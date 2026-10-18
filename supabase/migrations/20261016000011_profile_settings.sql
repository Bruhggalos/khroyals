-- Everyone's own profile settings: photo, name, and which push notifications
-- reach their phone.
--
-- Photos live in a private "avatars" bucket, one folder per person; any
-- approved member can see them (the app uses signed URLs). profiles.avatar_url
-- holds the storage path. Staff with people.roles can remove a photo.
--
-- Push settings only decide what is pushed to devices; the in-app inbox still
-- lists everything. School-wide announcements (everyone / by role) always
-- push, so closures and emergencies reach families.

-- ======================================================================
-- Photos
-- ======================================================================

insert into storage.buckets (id, name, public) values ('avatars', 'avatars', false)
on conflict (id) do nothing;
create policy "profile photos: members read" on storage.objects for select to authenticated
  using (bucket_id = 'avatars' and app.school_role() is not null);
create policy "profile photos: upload to your own folder" on storage.objects for insert to authenticated
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "profile photos: delete your own" on storage.objects for delete to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);

/** Set (a path in your own avatars folder) or clear (null) your photo. */
create function public.set_my_avatar(p_path text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'Sign in first.' using errcode = '42501'; end if;
  if p_path is not null and split_part(p_path, '/', 1) <> auth.uid()::text then
    raise exception 'That photo isn''t yours.' using errcode = '42501';
  end if;
  update profiles set avatar_url = p_path where id = auth.uid();
end $$;

/** Staff with people.roles: remove someone's photo (e.g. an inappropriate one). */
create function public.admin_clear_avatar(p_user uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  perform app.require_permission('people.roles');
  update profiles set avatar_url = null where id = p_user;
  perform app.audit(null, 'avatar.removed', p_user::text);
end $$;

/** Change your name (first and last are both required). */
create or replace function public.update_my_profile(p_first text, p_last text, p_avatar text default null) returns void
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'Sign in first.' using errcode = '42501'; end if;
  if coalesce(trim(p_first), '') = '' or coalesce(trim(p_last), '') = '' then
    raise exception 'Enter your first and last name.';
  end if;
  if length(trim(p_first)) > 50 or length(trim(p_last)) > 50 then raise exception 'That name is too long.'; end if;
  update profiles set first_name = trim(p_first), last_name = trim(p_last) where id = auth.uid();
end $$;

-- ======================================================================
-- Push settings
-- ======================================================================

create table public.user_settings (
  user_id          uuid primary key references public.profiles (id) on delete cascade,
  push_groups      boolean not null default true,   -- posts in your groups (per-group levels still apply)
  push_marketplace boolean not null default true,
  push_volunteer   boolean not null default true,
  quiet_start      time,                             -- no pushes between these (school time); both or neither
  quiet_end        time,
  updated_at       timestamptz not null default now(),
  check ((quiet_start is null) = (quiet_end is null))
);
alter table public.user_settings enable row level security;
create policy "own settings" on public.user_settings for select to authenticated using (user_id = auth.uid());
revoke insert, update, delete on public.user_settings from anon, authenticated;
grant select on public.user_settings to authenticated;
grant all on public.user_settings to service_role;

create function public.update_my_settings(
  p_push_groups boolean, p_push_marketplace boolean, p_push_volunteer boolean,
  p_quiet_start time default null, p_quiet_end time default null
) returns public.user_settings
language plpgsql security definer set search_path = public as $$
declare row user_settings%rowtype;
begin
  if auth.uid() is null then raise exception 'Sign in first.' using errcode = '42501'; end if;
  if (p_quiet_start is null) <> (p_quiet_end is null) then raise exception 'Set both quiet-hours times, or neither.'; end if;
  insert into user_settings (user_id, push_groups, push_marketplace, push_volunteer, quiet_start, quiet_end)
  values (auth.uid(), p_push_groups, p_push_marketplace, p_push_volunteer, p_quiet_start, p_quiet_end)
  on conflict (user_id) do update set push_groups = excluded.push_groups, push_marketplace = excluded.push_marketplace,
    push_volunteer = excluded.push_volunteer, quiet_start = excluded.quiet_start, quiet_end = excluded.quiet_end, updated_at = now()
  returning * into row;
  return row;
end $$;

/** Does this person want this notification pushed to their phone right now? */
create function app.wants_push(n public.notifications, u uuid, at timestamptz default now()) returns boolean
language plpgsql stable security definer set search_path = public as $$
declare st user_settings%rowtype; t time;
begin
  if n.audience in ('everyone', 'roles') then return true; end if;   -- school announcements always push
  select * into st from user_settings where user_id = u;
  if not found then return true; end if;
  if n.audience = 'group' and not st.push_groups then return false; end if;
  if n.data ? 'listingId' and not st.push_marketplace then return false; end if;
  if n.data ? 'opportunityId' and not st.push_volunteer then return false; end if;
  if st.quiet_start is not null then
    t := (at at time zone 'America/Chicago')::time;
    if (st.quiet_start <= st.quiet_end and t >= st.quiet_start and t < st.quiet_end)
       or (st.quiet_start > st.quiet_end and (t >= st.quiet_start or t < st.quiet_end)) then
      return false;
    end if;
  end if;
  return true;
end $$;

create or replace function app.push_targets(p_notification uuid) returns table (token text, user_id uuid)
language sql stable security definer set search_path = public as $$
  select t.token, t.user_id
  from notifications n, push_tokens t
  where n.id = p_notification and app.notification_for(n, t.user_id) and app.wants_push(n, t.user_id)
$$;

revoke all on function app.wants_push(public.notifications, uuid, timestamptz) from public, anon, authenticated;
grant execute on function app.wants_push(public.notifications, uuid, timestamptz) to service_role;
revoke all on function app.push_targets(uuid) from public, anon, authenticated;
grant execute on function app.push_targets(uuid) to service_role;
revoke all on function public.set_my_avatar(text), public.admin_clear_avatar(uuid),
  public.update_my_profile(text, text, text),
  public.update_my_settings(boolean, boolean, boolean, time, time) from public, anon;
grant execute on function public.set_my_avatar(text), public.admin_clear_avatar(uuid),
  public.update_my_profile(text, text, text),
  public.update_my_settings(boolean, boolean, boolean, time, time) to authenticated, service_role;
