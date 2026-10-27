-- Teachers: their students' activities, and a calendar of their own.
--
-- My students' events: a teacher sees the schedule of the activities that students in the
-- class sections they lead are registered for (games, performances, meets), with which of
-- their students take part, so they can go and cheer them on. They only learn this for
-- students they already teach, and never see "Are you going?" answers.
--
-- My calendar: anyone on staff (teachers, staff, admins) keeps their own events: meetings,
-- duties, a game they'll go to. Private to them. An entry added from an activity's schedule
-- follows it: its time, place and cancellation come from the schedule, so a moved game moves
-- on their calendar too. When they add one, they can tell their students in it and the
-- students' parents that they're coming.

create table public.personal_events (
  id             uuid primary key default gen_random_uuid(),
  owner_id       uuid not null references public.profiles (id) on delete cascade,
  sport_event_id uuid references public.sport_events (id) on delete cascade,   -- set: follows that schedule item
  title          text check (title is null or char_length(trim(title)) between 1 and 120),
  starts_on      date,
  start_time     time,
  end_time       time,
  location       text check (location is null or char_length(location) <= 200),
  notes          text not null default '' check (char_length(notes) <= 1000),
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  unique (owner_id, sport_event_id),
  check (sport_event_id is not null or (title is not null and starts_on is not null)),
  check (end_time is null or (start_time is not null and end_time > start_time))
);
create index on public.personal_events (owner_id, starts_on);

alter table public.personal_events enable row level security;
create policy "your own calendar" on public.personal_events for select to authenticated using (owner_id = auth.uid());
grant select on public.personal_events to authenticated;
revoke insert, update, delete on public.personal_events from anon, authenticated;
grant all on public.personal_events to service_role;

/** The students in class sections teacher `t` leads who are registered for this season. */
create function app.class_students_in(p_season uuid, t uuid default auth.uid()) returns setof uuid
language sql stable security definer set search_path = public as $$
  select distinct g.student_id
  from sport_registrations g
  join roster_members m on m.profile_id = g.student_id
  join rosters r on r.id = m.roster_id
  where g.season_id = p_season and g.status = 'registered'
    and r.kind = 'section' and r.lead_id = t and app.is_staff(t)
$$;

-- ======================================================================
-- My students' events
-- ======================================================================

/**
 * For a teacher: activity schedule items from `p_from` to `p_to` (school dates) that students
 * in their classes are registered for, soonest first, with those students and whether the
 * item is on the teacher's own calendar.
 */
create function public.student_events(p_from date default app.school_today(), p_to date default app.school_today() + 60)
returns table (
  id uuid, season_id uuid, sport_id uuid, sport_name text, sport_icon text, kind text, title text,
  starts_at timestamptz, ends_at timestamptz, location text, address text, home boolean, notes text, cancelled boolean,
  students jsonb, planned boolean
)
language sql stable security definer set search_path = public as $$
  with mine as (
    select distinct m.profile_id as sid
    from rosters r join roster_members m on m.roster_id = r.id join profiles p on p.id = m.profile_id
    where r.kind = 'section' and r.lead_id = auth.uid() and app.is_staff() and p.school_role = 'student'
  ), taking_part as (
    select e.id as event_id, p.id as sid, trim(p.first_name || ' ' || p.last_name) as name, p.first_name, p.last_name
    from sport_events e
    join sport_registrations g on g.season_id = e.season_id and g.status = 'registered'
    join mine on mine.sid = g.student_id
    join profiles p on p.id = g.student_id
    where (e.starts_at at time zone 'America/Chicago')::date between p_from and least(p_to, p_from + 400)
  )
  select e.id, e.season_id, se.sport_id, s.name, s.icon, e.kind, e.title, e.starts_at, e.ends_at, e.location, e.address,
         e.home, e.notes, e.cancelled,
         jsonb_agg(jsonb_build_object('id', k.sid, 'name', k.name) order by k.last_name, k.first_name),
         exists (select 1 from personal_events pe where pe.owner_id = auth.uid() and pe.sport_event_id = e.id)
  from taking_part k
  join sport_events e on e.id = k.event_id
  join sport_seasons se on se.id = e.season_id
  join sports s on s.id = se.sport_id
  group by e.id, se.sport_id, s.name, s.icon
  order by e.starts_at, s.name
$$;

-- ======================================================================
-- My calendar
-- ======================================================================

create function app.require_own_calendar() returns void
language plpgsql stable as $$
begin
  if not app.is_staff() then raise exception 'My calendar is for teachers and staff.' using errcode = '42501'; end if;
end $$;

/**
 * The signed-in person's calendar from `p_from` to `p_to`: what they added, and the activity
 * schedule items they plan to go to (as the schedule has them now). Times are 24-hour HH:MM
 * in school time; `end_time` is null for an item that ends on another day.
 */
create function public.my_calendar(p_from date default app.school_today(), p_to date default app.school_today() + 60)
returns table (
  id uuid, sport_event_id uuid, sport_id uuid, title text, starts_on date, start_time text, end_time text,
  location text, address text, notes text, cancelled boolean
)
language sql stable security definer set search_path = public as $$
  select * from (
    select pe.id, pe.sport_event_id, se.sport_id,
           case when e.id is null then pe.title else app.sport_label(se.sport_id) || ' · ' || e.title end as title,
           coalesce((e.starts_at at time zone 'America/Chicago')::date, pe.starts_on) as starts_on,
           to_char(coalesce((e.starts_at at time zone 'America/Chicago')::time, pe.start_time), 'HH24:MI') as start_time,
           to_char(case
             when e.id is null then pe.end_time
             when (e.ends_at at time zone 'America/Chicago')::date = (e.starts_at at time zone 'America/Chicago')::date
               then (e.ends_at at time zone 'America/Chicago')::time
           end, 'HH24:MI') as end_time,
           coalesce(e.location, pe.location) as location, e.address, pe.notes, coalesce(e.cancelled, false) as cancelled
    from personal_events pe
    left join sport_events e on e.id = pe.sport_event_id
    left join sport_seasons se on se.id = e.season_id
    where pe.owner_id = auth.uid() and app.is_staff()
  ) c
  where c.starts_on between p_from and least(p_to, p_from + 400)
  order by c.starts_on, c.start_time nulls first, c.title
$$;

/** Add (no `p_id`) or change one of your own events. Times are optional; an end time needs a start. */
create function public.personal_event_save(
  p_id uuid, p_title text, p_on date, p_start time default null, p_end time default null,
  p_location text default null, p_notes text default ''
) returns public.personal_events
language plpgsql security definer set search_path = public as $$
declare row personal_events%rowtype; t text := trim(coalesce(p_title, ''));
begin
  perform app.require_own_calendar();
  if t = '' then raise exception 'Give it a title.'; end if;
  if char_length(t) > 120 then raise exception 'Keep the title to 120 characters.'; end if;
  if p_on is null then raise exception 'Pick a date.'; end if;
  if p_end is not null and (p_start is null or p_end <= p_start) then raise exception 'The end time must be after the start time.'; end if;
  if char_length(coalesce(p_location, '')) > 200 then raise exception 'Keep the place to 200 characters.'; end if;
  if char_length(coalesce(p_notes, '')) > 1000 then raise exception 'Keep the notes to 1000 characters.'; end if;
  if p_id is null then
    insert into personal_events (owner_id, title, starts_on, start_time, end_time, location, notes)
    values (auth.uid(), t, p_on, p_start, p_end, nullif(trim(coalesce(p_location, '')), ''), trim(coalesce(p_notes, '')))
    returning * into row;
  else
    update personal_events set title = t, starts_on = p_on, start_time = p_start, end_time = p_end,
      location = nullif(trim(coalesce(p_location, '')), ''), notes = trim(coalesce(p_notes, '')), updated_at = now()
    where id = p_id and owner_id = auth.uid() and sport_event_id is null
    returning * into row;
    if not found then raise exception 'That isn''t one of your own events.'; end if;
  end if;
  return row;
end $$;

create function public.personal_event_delete(p_id uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  perform app.require_own_calendar();
  delete from personal_events where id = p_id and owner_id = auth.uid();
  if not found then raise exception 'That isn''t on your calendar.'; end if;
end $$;

/**
 * Put an activity schedule item on your calendar (`p_going`), or take it off. With `p_tell`,
 * the students in your classes who take part (those with a login) and their parents hear that
 * you're coming, once. Returns how many of your students were told.
 */
create function public.student_event_plan(p_event uuid, p_going boolean, p_tell boolean default false) returns int
language plpgsql security definer set search_path = public as $$
declare e sport_events%rowtype; sport uuid; added int; who text; told int := 0; r record;
begin
  perform app.require_own_calendar();
  select * into e from sport_events where id = p_event;
  if not found then raise exception 'That schedule item is gone.'; end if;
  if not coalesce(p_going, false) then
    delete from personal_events where owner_id = auth.uid() and sport_event_id = e.id;
    return 0;
  end if;
  if e.cancelled then raise exception 'This was cancelled.'; end if;
  if coalesce(e.ends_at, e.starts_at + interval '3 hours') < now() then raise exception 'This is already over.'; end if;
  insert into personal_events (owner_id, sport_event_id) values (auth.uid(), e.id) on conflict (owner_id, sport_event_id) do nothing;
  get diagnostics added = row_count;
  if added = 0 or not coalesce(p_tell, false) then return 0; end if;

  sport := app.season_sport(e.season_id);
  select coalesce(nullif(trim(first_name || ' ' || last_name), ''), 'Your teacher') into who from profiles where id = auth.uid();
  for r in
    select distinct g.uid, g.student from app.class_students_in(e.season_id) s(sid)
    cross join lateral (select s.sid, true union select guardian_id, false from guardians where student_id = s.sid) g(uid, student)
    join profiles p on p.id = g.uid
    where p.school_role is not null and not (g.student and p.managed)
  loop
    perform app.notify_user(r.uid, '📣 ' || who || ' is coming!',
      app.sport_label(sport) || ' · ' || e.title || ' · ' || app.sport_when(e.starts_at), jsonb_build_object('sportId', sport));
    if r.student then told := told + 1; end if;
  end loop;
  return told;
end $$;

revoke all on function public.student_events(date, date), public.my_calendar(date, date),
  public.personal_event_save(uuid, text, date, time, time, text, text), public.personal_event_delete(uuid),
  public.student_event_plan(uuid, boolean, boolean) from public, anon;
grant execute on function public.student_events(date, date), public.my_calendar(date, date),
  public.personal_event_save(uuid, text, date, time, time, text, text), public.personal_event_delete(uuid),
  public.student_event_plan(uuid, boolean, boolean) to authenticated, service_role;
