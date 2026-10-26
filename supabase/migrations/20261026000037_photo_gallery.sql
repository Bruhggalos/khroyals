-- Photo gallery: staff post albums of school photos (events, games, field trips) that every
-- approved account can see: parents, students, family and staff. Photos live in the private
-- 'gallery' storage bucket under "<uploader id>/…"; the app shows them through signed links.
-- Any staff member can post; gallery.manage holders (and an album's creator) tidy up; push.send
-- holders can also let everyone know about a new album.

create or replace function public.permission_catalog() returns table (key text, label text, description text)
language sql immutable as $$
  values
    ('admins.manage',    'Manage admins',         'Make or remove admins, set tiers and grant permissions (director only).'),
    ('people.view',      'View people',           'See everyone''s contact email in the admin portal.'),
    ('people.approve',   'Approve sign-ups',      'Approve new accounts as parents, students or family.'),
    ('people.roles',     'Change roles',          'Set anyone''s school role, including teachers and staff.'),
    ('people.family',    'Families & rosters',    'Link parents and family to students, set grades, manage classes, class/team rosters and car line duty.'),
    ('groups.manage',    'Manage all groups',     'Act as owner of every group: settings, members, moderation.'),
    ('calendar.school',  'School calendar',       'Add, change and remove school-wide calendar events.'),
    ('push.send',        'Send notifications',    'Send push notifications to everyone, a role or any group.'),
    ('alerts.send',      'Send critical alerts',  'Send critical alerts (severe weather, an active threat, a dangerous situation) to every teacher and staff member, see who''s safe, and give the all clear.'),
    ('questions.manage', 'Route questions',       'See every question sent to the school, assign it to faculty or staff, and answer it.'),
    ('messages.review',  'Student messages',      'Read every Ask the Teacher conversation between students and teachers, for safety.'),
    ('sports.manage',    'Manage activities',     'Add activities (sports, theater, music, art, clubs) and seasons, set schedules, assign coaches and directors, and approve sign-ups.'),
    ('forms.send',       'Send forms',            'Send forms (permission slips, releases, acknowledgments) to any class, activity, grade or the whole school, and see every form''s signatures.'),
    ('people.delete',    'Delete accounts',       'Permanently delete someone''s account, with their posts and comments. Deleting an admin also needs Manage admins.'),
    ('gallery.manage',   'Manage photo gallery',  'Change or remove any photo album or photo, not just your own.'),
    ('audit.view',       'Activity log',          'Review the school-wide activity log.')
$$;

update public.admin_roles set permissions = permissions || 'gallery.manage'::text
where id in ('director', 'administrator') and not ('gallery.manage' = any (permissions));

create table public.gallery_albums (
  id          uuid primary key default gen_random_uuid(),
  title       text not null check (length(trim(title)) between 1 and 80),
  description text not null default '' check (length(description) <= 500),
  taken_on    date not null default current_date,
  created_by  uuid references public.profiles (id) on delete set null,
  created_at  timestamptz not null default now()
);
create index on public.gallery_albums (taken_on desc, created_at desc);

create table public.gallery_photos (
  id          uuid primary key default gen_random_uuid(),
  album_id    uuid not null references public.gallery_albums (id) on delete cascade,
  path        text not null unique,                  -- gallery bucket: "<uploader id>/<file>.jpg"
  width       int not null check (width > 0),
  height      int not null check (height > 0),
  caption     text not null default '' check (length(caption) <= 300),
  created_by  uuid references public.profiles (id) on delete set null,
  created_at  timestamptz not null default now()
);
create index on public.gallery_photos (album_id, created_at);

alter table public.gallery_albums enable row level security;
alter table public.gallery_photos enable row level security;
create policy "approved accounts see the gallery" on public.gallery_albums for select to authenticated
  using (app.school_role() is not null);
create policy "approved accounts see the gallery" on public.gallery_photos for select to authenticated
  using (app.school_role() is not null);

/** May the caller change this album (its creator, or gallery.manage)? */
create function app.can_edit_album(a uuid, u uuid default auth.uid()) returns boolean
language sql stable security definer set search_path = public as $$
  select app.is_staff(u) and (exists (select 1 from gallery_albums where id = a and created_by = u) or app.has_permission('gallery.manage', u))
$$;

/** Staff: start an album. p_notify (push.send holders only) tells everyone it's there. */
create function public.gallery_album_save(p_id uuid, p_title text, p_description text, p_taken_on date, p_notify boolean default false)
returns uuid
language plpgsql security definer set search_path = public as $$
declare new_id uuid;
begin
  if not app.is_staff() then raise exception 'Only staff post to the photo gallery.' using errcode = '42501'; end if;
  if coalesce(trim(p_title), '') = '' then raise exception 'Give the album a name, like "Fall Fest 2026".'; end if;
  if p_id is null then
    insert into gallery_albums (title, description, taken_on, created_by)
    values (trim(p_title), coalesce(trim(p_description), ''), coalesce(p_taken_on, current_date), auth.uid())
    returning id into new_id;
  else
    if not app.can_edit_album(p_id) then raise exception 'You can only change albums you started.' using errcode = '42501'; end if;
    update gallery_albums set title = trim(p_title), description = coalesce(trim(p_description), ''), taken_on = coalesce(p_taken_on, taken_on)
    where id = p_id returning id into new_id;
  end if;
  if p_notify then
    perform app.require_permission('push.send');
    insert into notifications (audience, title, body, data, created_by)
    values ('everyone', '📸 New photos: ' || trim(p_title), 'See the album in the KH Royals photo gallery.',
            jsonb_build_object('albumId', new_id), auth.uid());
  end if;
  return new_id;
end $$;

/** Staff: add uploaded photos to an album. Each path must be in the caller's own folder. */
create function public.gallery_add_photos(p_album uuid, p_photos jsonb) returns int
language plpgsql security definer set search_path = public as $$
declare ph jsonb; n int := 0;
begin
  if not app.is_staff() then raise exception 'Only staff post to the photo gallery.' using errcode = '42501'; end if;
  if not exists (select 1 from gallery_albums where id = p_album) then raise exception 'That album is gone.'; end if;
  if jsonb_typeof(p_photos) is distinct from 'array' or jsonb_array_length(p_photos) not between 1 and 100 then
    raise exception 'Add between 1 and 100 photos at a time.';
  end if;
  for ph in select * from jsonb_array_elements(p_photos) loop
    if (ph->>'path') is null or split_part(ph->>'path', '/', 1) <> auth.uid()::text then
      raise exception 'Upload photos to your own folder first.';
    end if;
    insert into gallery_photos (album_id, path, width, height, caption, created_by)
    values (p_album, ph->>'path', (ph->>'width')::int, (ph->>'height')::int, coalesce(trim(ph->>'caption'), ''), auth.uid());
    n := n + 1;
  end loop;
  return n;
end $$;

/** Remove a photo: whoever posted it, the album's creator, or gallery.manage. Returns its file path to delete. */
create function public.gallery_photo_delete(p_photo uuid) returns text
language plpgsql security definer set search_path = public as $$
declare ph gallery_photos%rowtype;
begin
  select * into ph from gallery_photos where id = p_photo;
  if not found then return null; end if;
  if not (ph.created_by = auth.uid() and app.is_staff()) and not app.can_edit_album(ph.album_id) then
    raise exception 'You can only remove photos you posted.' using errcode = '42501';
  end if;
  delete from gallery_photos where id = p_photo;
  return ph.path;
end $$;

/** Remove an album and its photos (its creator, or gallery.manage). Returns the file paths to delete. */
create function public.gallery_album_delete(p_album uuid) returns text[]
language plpgsql security definer set search_path = public as $$
declare paths text[]; t text;
begin
  if not app.can_edit_album(p_album) then raise exception 'You can only remove albums you started.' using errcode = '42501'; end if;
  select coalesce(array_agg(path), '{}') into paths from gallery_photos where album_id = p_album;
  delete from gallery_albums where id = p_album returning title into t;
  perform app.audit(null, 'gallery.album_deleted', p_album::text, jsonb_build_object('title', t, 'photos', cardinality(paths)));
  return paths;
end $$;

-- Files: approved accounts read; staff upload to their own folder; a file no photo points to
-- anymore can be removed by staff (after gallery_photo_delete / gallery_album_delete), and
-- uploaders can always remove their own.
insert into storage.buckets (id, name, public) values ('gallery', 'gallery', false) on conflict (id) do nothing;
create policy "gallery: approved accounts read" on storage.objects for select to authenticated
  using (bucket_id = 'gallery' and app.school_role() is not null);
create policy "gallery: staff upload to their own folder" on storage.objects for insert to authenticated
  with check (bucket_id = 'gallery' and app.is_staff() and (storage.foldername(name))[1] = auth.uid()::text);
create policy "gallery: remove your own, or files no photo uses" on storage.objects for delete to authenticated
  using (bucket_id = 'gallery' and app.is_staff() and ((storage.foldername(name))[1] = auth.uid()::text
         or not exists (select 1 from public.gallery_photos p where p.path = objects.name)));

revoke all on function app.can_edit_album(uuid, uuid) from public, anon;
grant execute on function app.can_edit_album(uuid, uuid) to authenticated, service_role;
revoke all on function public.gallery_album_save(uuid, text, text, date, boolean), public.gallery_add_photos(uuid, jsonb),
  public.gallery_photo_delete(uuid), public.gallery_album_delete(uuid) from public, anon;
grant execute on function public.gallery_album_save(uuid, text, text, date, boolean), public.gallery_add_photos(uuid, jsonb),
  public.gallery_photo_delete(uuid), public.gallery_album_delete(uuid) to authenticated, service_role;

-- Reads go through row-level security; writes only through the functions above.
revoke all on public.gallery_albums, public.gallery_photos from anon;
revoke insert, update, delete on public.gallery_albums, public.gallery_photos from authenticated;
grant select on public.gallery_albums, public.gallery_photos to authenticated;
grant all on public.gallery_albums, public.gallery_photos to service_role;
