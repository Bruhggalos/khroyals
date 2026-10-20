-- ======================================================================
-- Activities: event addresses, team photos and "Are you going?"
--
-- * Schedule items get an address under the venue name (Directions opens Maps).
-- * Coaches/directors and activity managers upload a team photo, stored at
--   avatars/sports/<activity id>/…, which approved accounts can see (like
--   profile photos; signed-out visitors see the activity's emoji).
-- * Parents answer Going / Not going for each registered child, and students for
--   themselves; the activity's coaches/directors and managers see who's coming.
-- ======================================================================

alter table public.sport_events add column address text check (char_length(address) <= 200);
alter table public.sports add column photo_path text;

-- ----------------------------------------------------------------------
-- Addresses on schedule items
-- ----------------------------------------------------------------------

drop function public.sport_event_save(uuid, uuid, text, text, timestamptz, timestamptz, text, boolean, text);
create function public.sport_event_save(
  p_id uuid, p_season uuid, p_kind text, p_title text, p_starts timestamptz, p_ends timestamptz default null,
  p_location text default null, p_home boolean default null, p_notes text default '', p_address text default null
) returns public.sport_events
language plpgsql security definer set search_path = public as $$
declare old sport_events%rowtype; row sport_events%rowtype; season uuid; what text;
begin
  if p_id is not null then
    select * into old from sport_events where id = p_id;
    if not found then raise exception 'That schedule item is gone.'; end if;
  end if;
  season := coalesce(old.season_id, p_season);
  if season is null or not app.can_manage_sport(app.season_sport(season)) then perform app.require_permission('sports.manage'); end if;
  if coalesce(trim(p_title), '') = '' or char_length(trim(p_title)) > 120 then
    raise exception 'Add a title (up to 120 characters), like "vs. Westminster" or "Rehearsal".';
  end if;
  if p_kind is not null and p_kind not in ('game', 'practice', 'tryout', 'tournament', 'rehearsal', 'audition', 'performance',
                                           'meeting', 'competition', 'exhibit', 'other') then
    raise exception 'That isn''t a kind of schedule item.';
  end if;
  if p_starts is null then raise exception 'Give it a start time.'; end if;
  if p_ends < p_starts then raise exception 'The end time must be after the start.'; end if;
  if char_length(coalesce(trim(p_address), '')) > 200 then raise exception 'Keep the address to 200 characters.'; end if;
  if p_id is null then
    insert into sport_events (season_id, kind, title, starts_at, ends_at, location, address, home, notes, created_by)
    values (season, coalesce(p_kind, 'game'), trim(p_title), p_starts, p_ends, nullif(trim(p_location), ''), nullif(trim(p_address), ''),
            p_home, coalesce(trim(p_notes), ''), auth.uid())
    returning * into row;
    what := case row.kind when 'other' then 'event' when 'audition' then 'auditions' else row.kind end;
    perform app.sport_schedule_note(row, 'new ' || what);
  else
    update sport_events set kind = coalesce(p_kind, kind), title = trim(p_title), starts_at = p_starts, ends_at = p_ends,
      location = nullif(trim(p_location), ''), address = nullif(trim(p_address), ''), home = p_home,
      notes = coalesce(trim(p_notes), ''), updated_at = now()
    where id = p_id returning * into row;
    what := case row.kind when 'other' then 'event' when 'audition' then 'auditions' else row.kind end;
    if row.starts_at is distinct from old.starts_at or row.location is distinct from old.location
       or row.address is distinct from old.address then
      perform app.sport_schedule_note(row, what || ' changed');
    end if;
  end if;
  return row;
end $$;
revoke all on function public.sport_event_save(uuid, uuid, text, text, timestamptz, timestamptz, text, boolean, text, text) from public, anon;
grant execute on function public.sport_event_save(uuid, uuid, text, text, timestamptz, timestamptz, text, boolean, text, text)
  to authenticated, service_role;

-- ----------------------------------------------------------------------
-- Team photos
-- ----------------------------------------------------------------------

create function app.sport_folder(name text) returns uuid
language sql immutable as $$
  select case when (storage.foldername(name))[1] = 'sports'
               and (storage.foldername(name))[2] ~ '^[0-9a-f-]{36}$' then (storage.foldername(name))[2]::uuid end
$$;
-- Reading falls under "profile photos: members read" (any approved account, outside children/).
create policy "team photos: leaders upload" on storage.objects for insert to authenticated
  with check (bucket_id = 'avatars' and app.sport_folder(name) is not null and app.can_manage_sport(app.sport_folder(name)));
create policy "team photos: leaders delete" on storage.objects for delete to authenticated
  using (bucket_id = 'avatars' and app.sport_folder(name) is not null and app.can_manage_sport(app.sport_folder(name)));

/** Set (a path in the activity's photo folder) or clear (null) its team photo. */
create function public.set_sport_photo(p_sport uuid, p_path text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not app.can_manage_sport(p_sport) then
    raise exception 'Only its coaches or directors and the activity managers can change the team photo.' using errcode = '42501';
  end if;
  if p_path is not null and app.sport_folder(p_path) is distinct from p_sport then
    raise exception 'That photo isn''t in this activity''s folder.' using errcode = '42501';
  end if;
  update sports set photo_path = p_path where id = p_sport;
  if not found then raise exception 'No such activity.'; end if;
end $$;

-- ----------------------------------------------------------------------
-- "Are you going?"
-- ----------------------------------------------------------------------

create table public.sport_event_rsvps (
  event_id    uuid not null references public.sport_events (id) on delete cascade,
  student_id  uuid not null references public.profiles (id) on delete cascade,
  status      text not null check (status in ('going', 'not_going')),
  answered_by uuid references public.profiles (id) on delete set null,
  updated_at  timestamptz not null default now(),
  primary key (event_id, student_id)
);
alter table public.sport_event_rsvps enable row level security;

create function app.event_sport(e uuid) returns uuid
language sql stable security definer set search_path = public as $$
  select app.season_sport(season_id) from sport_events where id = e
$$;

create policy "your family's answers, or the activity's leaders" on public.sport_event_rsvps for select to authenticated
  using (student_id in (select app.my_students()) or app.can_manage_sport(app.event_sport(event_id)));
grant select on public.sport_event_rsvps to authenticated;
revoke insert, update, delete on public.sport_event_rsvps from anon, authenticated;
grant all on public.sport_event_rsvps to service_role;
alter publication supabase_realtime add table public.sport_event_rsvps;

/** A parent answers for a registered child (or a student for themselves); null clears the answer. */
create function public.sport_rsvp(p_event uuid, p_student uuid, p_status text) returns void
language plpgsql security definer set search_path = public as $$
declare e sport_events%rowtype;
begin
  if app.school_role() is null then raise exception 'Sign in with an approved account to answer.' using errcode = '42501'; end if;
  select * into e from sport_events where id = p_event;
  if not found then raise exception 'That schedule item is gone.'; end if;
  if e.cancelled then raise exception 'This was cancelled.'; end if;
  if coalesce(e.ends_at, e.starts_at + interval '3 hours') < now() then raise exception 'This is already over.'; end if;
  if p_student is null or p_student not in (select app.my_students()) then
    raise exception 'You can only answer for your own children.' using errcode = '42501';
  end if;
  if not exists (select 1 from sport_registrations where season_id = e.season_id and student_id = p_student and status = 'registered') then
    raise exception 'Only registered participants answer for this.';
  end if;
  if p_status is null then
    delete from sport_event_rsvps where event_id = e.id and student_id = p_student;
    return;
  end if;
  if p_status not in ('going', 'not_going') then raise exception 'Choose Going or Not going.'; end if;
  insert into sport_event_rsvps (event_id, student_id, status, answered_by)
  values (e.id, p_student, p_status, auth.uid())
  on conflict (event_id, student_id) do update set status = excluded.status, answered_by = excluded.answered_by, updated_at = now();
end $$;

/** For an activity's leaders: everyone registered for these schedule items, with their answer ('going', 'not_going', 'none'). */
create function public.sport_event_attendance(p_events uuid[]) returns table (event_id uuid, student_id uuid, name text, status text)
language sql stable security definer set search_path = public as $$
  select e.id, p.id, trim(p.first_name || ' ' || p.last_name), coalesce(v.status, 'none')
  from sport_events e
  join sport_registrations r on r.season_id = e.season_id and r.status = 'registered'
  join profiles p on p.id = r.student_id
  left join sport_event_rsvps v on v.event_id = e.id and v.student_id = r.student_id
  where e.id = any (p_events) and app.can_manage_sport(app.season_sport(e.season_id))
  order by e.starts_at, p.last_name, p.first_name
$$;

revoke all on function public.set_sport_photo(uuid, text), public.sport_rsvp(uuid, uuid, text),
  public.sport_event_attendance(uuid[]) from public, anon;
grant execute on function public.set_sport_photo(uuid, text), public.sport_rsvp(uuid, uuid, text),
  public.sport_event_attendance(uuid[]) to authenticated, service_role;
