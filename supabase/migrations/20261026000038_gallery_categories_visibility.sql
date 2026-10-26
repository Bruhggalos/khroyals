-- Photo gallery: categories (Events, Sports, Field Trips…) and who sees an album: everyone at school
-- or staff only (e.g. while it's being put together). Staff-only albums, their photos and their files
-- are hidden from everyone but staff by row-level security and the storage policy, not just the app.

create table public.gallery_categories (
  id        uuid primary key default gen_random_uuid(),
  name      text not null unique check (length(trim(name)) between 1 and 40),
  icon      text not null default '📷',
  position  int not null default 0
);
insert into public.gallery_categories (name, icon, position) values
  ('Events', '🎉', 1), ('Sports', '🏆', 2), ('Fine Arts', '🎭', 3), ('Field Trips', '🚌', 4),
  ('Classroom', '📚', 5), ('Chapel', '⛪', 6), ('Clubs', '🧩', 7), ('Campus', '🏫', 8);

alter table public.gallery_albums
  add column category_id uuid references public.gallery_categories (id) on delete set null,
  add column visibility text not null default 'everyone' check (visibility in ('everyone', 'staff'));
update public.gallery_albums set category_id = (select id from public.gallery_categories where name = 'Events') where category_id is null;

alter table public.gallery_categories enable row level security;
create policy "approved accounts see the categories" on public.gallery_categories for select to authenticated
  using (app.school_role() is not null);

/** Can this person see this album? Everyone approved for "everyone" albums; staff for all. */
create function app.sees_album(a uuid, u uuid default auth.uid()) returns boolean
language sql stable security definer set search_path = public as $$
  select app.school_role(u) is not null
     and exists (select 1 from gallery_albums where id = a and (visibility = 'everyone' or app.is_staff(u)))
$$;

drop policy "approved accounts see the gallery" on public.gallery_albums;
drop policy "approved accounts see the gallery" on public.gallery_photos;
create policy "everyone approved, or staff for staff-only albums" on public.gallery_albums for select to authenticated
  using (app.school_role() is not null and (visibility = 'everyone' or app.is_staff()));
create policy "photos of albums you can see" on public.gallery_photos for select to authenticated
  using (app.sees_album(album_id));

-- Files follow their album: a photo (or its "_t" thumbnail) is readable only if its album is.
drop policy "gallery: approved accounts read" on storage.objects;
create policy "gallery: photos of albums you can see" on storage.objects for select to authenticated
  using (bucket_id = 'gallery' and app.school_role() is not null and (app.is_staff() or exists (
    select 1 from public.gallery_photos p
    where p.path = regexp_replace(objects.name, '_t\.jpg$', '.jpg') and app.sees_album(p.album_id))));

drop function public.gallery_album_save(uuid, text, text, date, boolean);
/**
 * Staff: start an album, or change one (its creator, or gallery.manage). p_visibility is
 * 'everyone' or 'staff'. p_notify (push.send holders, everyone-albums only) tells everyone it's there.
 */
create function public.gallery_album_save(
  p_id uuid, p_title text, p_description text, p_taken_on date, p_notify boolean default false,
  p_category uuid default null, p_visibility text default 'everyone'
) returns uuid
language plpgsql security definer set search_path = public as $$
declare new_id uuid;
begin
  if not app.is_staff() then raise exception 'Only staff post to the photo gallery.' using errcode = '42501'; end if;
  if coalesce(trim(p_title), '') = '' then raise exception 'Give the album a name, like "Fall Fest 2026".'; end if;
  if coalesce(p_visibility, '') not in ('everyone', 'staff') then raise exception 'Choose who sees the album.'; end if;
  if p_category is null or not exists (select 1 from gallery_categories where id = p_category) then
    raise exception 'Pick a category for the album.';
  end if;
  if p_id is null then
    insert into gallery_albums (title, description, taken_on, created_by, category_id, visibility)
    values (trim(p_title), coalesce(trim(p_description), ''), coalesce(p_taken_on, current_date), auth.uid(), p_category, p_visibility)
    returning id into new_id;
  else
    if not app.can_edit_album(p_id) then raise exception 'You can only change albums you started.' using errcode = '42501'; end if;
    update gallery_albums set title = trim(p_title), description = coalesce(trim(p_description), ''),
      taken_on = coalesce(p_taken_on, taken_on), category_id = p_category, visibility = p_visibility
    where id = p_id returning id into new_id;
  end if;
  if p_notify then
    perform app.require_permission('push.send');
    if p_visibility <> 'everyone' then raise exception 'Show the album to everyone before letting everyone know.'; end if;
    insert into notifications (audience, title, body, data, created_by)
    values ('everyone', '📸 New photos: ' || trim(p_title), 'See the album in the KH Royals photo gallery.',
            jsonb_build_object('albumId', new_id), auth.uid());
  end if;
  return new_id;
end $$;

/** gallery.manage: add a category (p_id null), rename one, or move it in the list. */
create function public.gallery_category_save(p_id uuid, p_name text, p_icon text default '📷', p_position int default null) returns uuid
language plpgsql security definer set search_path = public as $$
declare new_id uuid;
begin
  perform app.require_permission('gallery.manage');
  if coalesce(trim(p_name), '') = '' then raise exception 'Name the category.'; end if;
  if exists (select 1 from gallery_categories where lower(name) = lower(trim(p_name)) and id is distinct from p_id) then
    raise exception 'There''s already a "%" category.', trim(p_name);
  end if;
  if p_id is null then
    insert into gallery_categories (name, icon, position)
    values (trim(p_name), coalesce(nullif(trim(p_icon), ''), '📷'), coalesce(p_position, (select coalesce(max(position), 0) + 1 from gallery_categories)))
    returning id into new_id;
  else
    update gallery_categories set name = trim(p_name), icon = coalesce(nullif(trim(p_icon), ''), icon), position = coalesce(p_position, position)
    where id = p_id returning id into new_id;
  end if;
  return new_id;
end $$;

/** gallery.manage: remove a category; its albums move to another one (p_move_to). */
create function public.gallery_category_delete(p_id uuid, p_move_to uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  perform app.require_permission('gallery.manage');
  if p_move_to is null or p_move_to = p_id or not exists (select 1 from gallery_categories where id = p_move_to) then
    raise exception 'Pick the category its albums move to.';
  end if;
  update gallery_albums set category_id = p_move_to where category_id = p_id;
  delete from gallery_categories where id = p_id;
end $$;

revoke all on function app.sees_album(uuid, uuid) from public, anon;
grant execute on function app.sees_album(uuid, uuid) to authenticated, service_role;
revoke all on function public.gallery_album_save(uuid, text, text, date, boolean, uuid, text),
  public.gallery_category_save(uuid, text, text, int), public.gallery_category_delete(uuid, uuid) from public, anon;
grant execute on function public.gallery_album_save(uuid, text, text, date, boolean, uuid, text),
  public.gallery_category_save(uuid, text, text, int), public.gallery_category_delete(uuid, uuid) to authenticated, service_role;

revoke all on public.gallery_categories from anon;
revoke insert, update, delete on public.gallery_categories from authenticated;
grant select on public.gallery_categories to authenticated;
grant all on public.gallery_categories to service_role;
