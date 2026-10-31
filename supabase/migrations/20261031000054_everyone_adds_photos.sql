-- Photos: everyone who can see an album adds photos to it (parents, students and family too; never substitutes,
-- and a staff-only album stays staff-only). Teachers, staff and admins remove any photo, choosing a reason
-- (app.photo_removal_reasons, the same list as src/gallery/removal.ts) and adding a note if they like; the person
-- who added it is told who removed it and why. Anyone removes their own photos, no reason needed. Starting albums
-- stays with staff, and with whoever makes a Volunteer or school calendar event.

/** Why a photo was taken out of an album (src/gallery/removal.ts lists the same keys). */
create function app.photo_removal_reasons() returns table (key text, label text)
language sql immutable as $$
  values
    ('guidelines',    'Doesn''t meet the school''s photo guidelines'),
    ('inappropriate', 'Not appropriate for a school album'),
    ('permission',    'Shows a student without photo permission'),
    ('wrong_album',   'Belongs in a different album'),
    ('quality',       'A duplicate, or too blurry or dark'),
    ('other',         'Another reason')
$$;

-- ----------------------------------------------------------------------
-- Files: anyone who can see the gallery uploads to their own folder
-- ----------------------------------------------------------------------

drop policy "gallery: staff upload to their own folder" on storage.objects;
create policy "gallery: upload to your own folder" on storage.objects for insert to authenticated
  with check (bucket_id = 'gallery' and app.school_role() is not null and not app.is_substitute()
              and (storage.foldername(name))[1] = auth.uid()::text);
-- Your own files, always; staff also clear files (and thumbnails) no photo uses anymore.
drop policy "gallery: remove your own, or files no photo uses" on storage.objects;
create policy "gallery: remove your own, or files no photo uses" on storage.objects for delete to authenticated
  using (bucket_id = 'gallery' and app.school_role() is not null and ((storage.foldername(name))[1] = auth.uid()::text
         or (app.is_staff() and not exists (select 1 from public.gallery_photos p where p.path = regexp_replace(objects.name, '_t\.jpg$', '.jpg')))));

-- ----------------------------------------------------------------------
-- Adding and removing photos
-- ----------------------------------------------------------------------

/** Add uploaded photos to an album you can see. Each path must be in your own folder; up to 100 a day (staff: no limit). */
create or replace function public.gallery_add_photos(p_album uuid, p_photos jsonb) returns int
language plpgsql security definer set search_path = public as $$
declare ph jsonb; n int := 0;
begin
  if not exists (select 1 from gallery_albums where id = p_album) then raise exception 'That album is gone.'; end if;
  if not app.sees_album(p_album) then raise exception 'You can only add photos to albums you can see.' using errcode = '42501'; end if;
  if jsonb_typeof(p_photos) is distinct from 'array' or jsonb_array_length(p_photos) not between 1 and 100 then
    raise exception 'Add between 1 and 100 photos at a time.';
  end if;
  if not app.is_staff() and (select count(*) from gallery_photos where created_by = auth.uid() and created_at > now() - interval '1 day')
       + jsonb_array_length(p_photos) > 100 then
    raise exception 'You can add up to 100 photos a day.';
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

drop function public.gallery_photo_delete(uuid);
/**
 * Remove a photo: your own (no reason needed), or any photo if you're a teacher, staff or admin, with a reason
 * (app.photo_removal_reasons) and an optional note; "other" needs the note. Whoever added it is told who removed
 * it and why. Returns its file path, to delete.
 */
create function public.gallery_photo_delete(p_photo uuid, p_reason text default null, p_note text default null) returns text
language plpgsql security definer set search_path = public as $$
declare ph gallery_photos%rowtype; why text; note text := nullif(trim(coalesce(p_note, '')), ''); t text;
begin
  select * into ph from gallery_photos where id = p_photo;
  if not found then return null; end if;
  if ph.created_by is not distinct from auth.uid() and app.sees_album(ph.album_id) then
    delete from gallery_photos where id = p_photo;
    return ph.path;
  end if;
  if not app.is_staff() then raise exception 'You can only remove photos you added.' using errcode = '42501'; end if;
  select label into why from app.photo_removal_reasons() where key = p_reason;
  if why is null then raise exception 'Choose why you''re removing it.'; end if;
  if p_reason = 'other' and note is null then raise exception 'Add a note saying why.'; end if;
  if char_length(coalesce(note, '')) > 300 then raise exception 'Keep the note to 300 characters.'; end if;
  select title into t from gallery_albums where id = ph.album_id;
  delete from gallery_photos where id = p_photo;
  if ph.created_by is not null then
    perform app.notify_user(ph.created_by, '📷 A photo you added was removed',
      app.person_name(auth.uid()) || ' removed it from "' || t || '". Reason: ' || why || '.' || coalesce(' Note: ' || note, ''),
      jsonb_build_object('albumId', ph.album_id));
  end if;
  perform app.audit(null, 'gallery.photo_removed', p_photo::text,
    jsonb_build_object('album', ph.album_id, 'added_by', ph.created_by, 'reason', p_reason, 'note', note));
  return ph.path;
end $$;

/** Remove an album and its photos (its creator, or gallery.manage); everyone else who added photos is told. Returns the file paths to delete. */
create or replace function public.gallery_album_delete(p_album uuid) returns text[]
language plpgsql security definer set search_path = public as $$
declare paths text[]; t text; r record;
begin
  if not app.can_edit_album(p_album) then raise exception 'You can only remove albums you started.' using errcode = '42501'; end if;
  select title into t from gallery_albums where id = p_album;
  for r in select created_by as who, count(*) as n from gallery_photos
           where album_id = p_album and created_by is not null and created_by <> auth.uid() group by created_by loop
    perform app.notify_user(r.who, '📷 An album with your photos was removed',
      app.person_name(auth.uid()) || ' removed "' || t || '", with ' || r.n || case when r.n = 1 then ' photo' else ' photos' end || ' you added.',
      jsonb_build_object('photos', true));
  end loop;
  select coalesce(array_agg(path), '{}') into paths from gallery_photos where album_id = p_album;
  delete from gallery_albums where id = p_album;
  perform app.audit(null, 'gallery.album_deleted', p_album::text, jsonb_build_object('title', t, 'photos', cardinality(paths)));
  return paths;
end $$;

revoke all on function public.gallery_photo_delete(uuid, text, text) from public, anon;
grant execute on function public.gallery_photo_delete(uuid, text, text) to authenticated, service_role;
