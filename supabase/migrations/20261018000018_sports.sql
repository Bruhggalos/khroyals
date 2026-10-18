-- Sports (Apps → Sports).
--
-- Each sport (Volleyball, Basketball…) has seasons with dates, eligible grades, a
-- details note and an online sign-up window, plus a schedule of games, practices
-- and tryouts. Anyone can browse them, even signed out. Approved accounts follow a
-- sport (the ★ button), and parents sign their children up for a season; a coach
-- or sports manager approves the sign-up, and only then is the child registered.
-- A person is "involved" in a sport they follow or that one of their children (or
-- they, as a student) is registered for; their schedule shows those sports.
--
-- Managing: the new sports.manage permission (Director and Administrator roles to
-- start; directors can give it to a role such as "Athletic Director") manages every
-- sport and assigns coaches. A sport's coaches (staff) manage its seasons, schedule
-- and sign-ups. Coaching isn't an admin power, so it needs no authenticator code.
--
-- Notifications: schedule changes go to everyone involved; sign-up decisions to the
-- parent who asked; new sign-ups to the sport's coaches (or the sports managers when
-- it has none); and a season opening for sign-ups to the sport's followers.

-- ======================================================================
-- The "Manage sports" permission
-- ======================================================================

create or replace function public.permission_catalog() returns table (key text, label text, description text)
language sql immutable as $$
  values
    ('admins.manage',    'Manage admins',         'Make or remove admins, set tiers and grant permissions (director only).'),
    ('people.view',      'View people',           'See everyone''s contact email in the admin portal.'),
    ('people.approve',   'Approve sign-ups',      'Approve new accounts as parents or students.'),
    ('people.roles',     'Change roles',          'Set anyone''s school role, including teachers and staff.'),
    ('people.family',    'Families & rosters',    'Link parents to students, set grades, manage class/team rosters and car line duty.'),
    ('groups.manage',    'Manage all groups',     'Act as owner of every group: settings, members, moderation.'),
    ('calendar.school',  'School calendar',       'Add, change and remove school-wide calendar events.'),
    ('push.send',        'Send notifications',    'Send push notifications to everyone, a role or any group.'),
    ('questions.manage', 'Route questions',       'See every question sent to the school, assign it to faculty or staff, and answer it.'),
    ('sports.manage',    'Manage sports',         'Add sports and seasons, set schedules, assign coaches and approve sign-ups.'),
    ('audit.view',       'Activity log',          'Review the school-wide activity log.')
$$;

update public.admin_roles set permissions = permissions || 'sports.manage'::text
where id in ('director', 'administrator') and not ('sports.manage' = any (permissions));

-- ======================================================================
-- Tables
-- ======================================================================

create table public.sports (
  id          uuid primary key default gen_random_uuid(),
  name        text not null unique check (char_length(trim(name)) between 1 and 60),
  icon        text not null default '🏅',
  description text not null default '',
  created_at  timestamptz not null default now()
);

create table public.sport_coaches (
  sport_id uuid not null references public.sports (id) on delete cascade,
  user_id  uuid not null references public.profiles (id) on delete cascade,
  primary key (sport_id, user_id)
);
create index on public.sport_coaches (user_id);

create table public.sport_seasons (
  id            uuid primary key default gen_random_uuid(),
  sport_id      uuid not null references public.sports (id) on delete cascade,
  name          text not null check (char_length(trim(name)) between 1 and 80),
  starts_on     date not null,
  ends_on       date not null,
  signup_opens  date,             -- no window = no online sign-up
  signup_closes date,
  min_grade     int,              -- K2 = -3 … 12 (as app.grade_label); null = any
  max_grade     int,
  details       text not null default '',   -- tryouts, practice times, fees, forms
  info_url      text,                       -- e.g. the season's PDF
  signup_announced_at timestamptz,          -- when followers were told sign-ups opened
  created_at    timestamptz not null default now(),
  check (ends_on >= starts_on),
  check ((signup_opens is null) = (signup_closes is null) and (signup_closes is null or signup_closes >= signup_opens)),
  check (min_grade is null or max_grade is null or max_grade >= min_grade)
);
create index on public.sport_seasons (sport_id, starts_on);

create table public.sport_registrations (
  id            uuid primary key default gen_random_uuid(),
  season_id     uuid not null references public.sport_seasons (id) on delete cascade,
  student_id    uuid not null references public.profiles (id) on delete cascade,
  requested_by  uuid references public.profiles (id) on delete set null,
  status        text not null default 'pending' check (status in ('pending', 'registered', 'declined', 'withdrawn')),
  note          text not null default '',   -- from the parent
  decided_by    uuid references public.profiles (id) on delete set null,
  decided_at    timestamptz,
  decision_note text not null default '',
  created_at    timestamptz not null default now(),
  unique (season_id, student_id)
);
create index on public.sport_registrations (student_id);

create table public.sport_follows (
  sport_id   uuid not null references public.sports (id) on delete cascade,
  user_id    uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (sport_id, user_id)
);
create index on public.sport_follows (user_id);

create table public.sport_events (
  id         uuid primary key default gen_random_uuid(),
  season_id  uuid not null references public.sport_seasons (id) on delete cascade,
  kind       text not null default 'game' check (kind in ('game', 'practice', 'tryout', 'tournament', 'other')),
  title      text not null check (char_length(trim(title)) between 1 and 120),   -- "vs. Westminster", "Practice"
  starts_at  timestamptz not null,
  ends_at    timestamptz,
  location   text,
  home       boolean,            -- games: home or away; null when it doesn't apply
  notes      text not null default '',
  cancelled  boolean not null default false,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (ends_at is null or ends_at >= starts_at)
);
create index on public.sport_events (season_id, starts_at);

-- ======================================================================
-- Who manages, who's involved
-- ======================================================================

/** A sport's coaches and the sports managers may manage it. */
create function app.can_manage_sport(s uuid, u uuid default auth.uid()) returns boolean
language sql stable security definer set search_path = public as $$
  select app.has_permission('sports.manage', u)
      or (app.is_staff(u) and exists (select 1 from sport_coaches where sport_id = s and user_id = u))
$$;

create function app.season_sport(p_season uuid) returns uuid
language sql stable security definer set search_path = public as $$ select sport_id from sport_seasons where id = p_season $$;

/** Students a person signs up and follows the schedule for: their children, or themselves as a student. */
create function app.my_students(u uuid default auth.uid()) returns setof uuid
language sql stable security definer set search_path = public as $$
  select student_id from guardians where guardian_id = u
  union select u where app.school_role(u) = 'student'
$$;

/** Sports someone is involved in: followed, or a season (not over) one of their students is registered for. */
create function app.involved_sports(u uuid default auth.uid()) returns table (sport_id uuid, following boolean, registered boolean)
language sql stable security definer set search_path = public as $$
  with reg as (
    select distinct s.sport_id from sport_registrations r join sport_seasons s on s.id = r.season_id
    where r.status = 'registered' and s.ends_on >= app.school_today()
      and r.student_id in (select app.my_students(u))
  ), fol as (select sport_id from sport_follows where user_id = u)
  select coalesce(f.sport_id, r.sport_id), f.sport_id is not null, r.sport_id is not null
  from fol f full join reg r on r.sport_id = f.sport_id
$$;

/** Everyone involved in a sport (for schedule notifications): followers, registered students and their parents. */
create function app.sport_audience(s uuid) returns setof uuid
language sql stable security definer set search_path = public as $$
  select user_id from sport_follows where sport_id = s
  union
  select x from sport_registrations r join sport_seasons se on se.id = r.season_id,
    lateral (select r.student_id union select guardian_id from guardians where student_id = r.student_id) g(x)
  where se.sport_id = s and r.status = 'registered' and se.ends_on >= app.school_today()
    and app.school_role(x) is not null
$$;

/** Who hears about new sign-ups: the sport's coaches, or the sports managers when it has none. */
create function app.sport_signup_team(s uuid) returns setof uuid
language sql stable security definer set search_path = public as $$
  select user_id from sport_coaches where sport_id = s and app.is_staff(user_id)
  union
  select id from profiles
  where not exists (select 1 from sport_coaches c where c.sport_id = s and app.is_staff(c.user_id))
    and school_role is not null and (admin_tier is not null or cardinality(permissions) > 0)
    and 'sports.manage' = any (app.permissions(id))
$$;

create function app.sport_label(s uuid) returns text
language sql stable security definer set search_path = public as $$ select icon || ' ' || name from sports where id = s $$;

/** "Sat, Oct 24, 4:30 PM" in school time. */
create function app.sport_when(t timestamptz) returns text
language sql stable as $$ select to_char(t at time zone 'America/Chicago', 'Dy, Mon FMDD, FMHH12:MI AM') $$;

-- ======================================================================
-- Read policies (writes only through the functions below)
-- ======================================================================

alter table public.sports enable row level security;
alter table public.sport_coaches enable row level security;
alter table public.sport_seasons enable row level security;
alter table public.sport_registrations enable row level security;
alter table public.sport_follows enable row level security;
alter table public.sport_events enable row level security;

create policy "anyone sees sports" on public.sports for select to anon, authenticated using (true);
create policy "anyone sees coaches" on public.sport_coaches for select to anon, authenticated using (true);
create policy "anyone sees seasons" on public.sport_seasons for select to anon, authenticated using (true);
create policy "anyone sees schedules" on public.sport_events for select to anon, authenticated using (true);
create policy "your follows" on public.sport_follows for select to authenticated using (user_id = auth.uid());
create policy "your family's sign-ups, or the sport's managers" on public.sport_registrations for select to authenticated
  using (requested_by = auth.uid() or student_id in (select app.my_students()) or app.can_manage_sport(app.season_sport(season_id)));

-- ======================================================================
-- Following
-- ======================================================================

create function public.sport_follow(p_sport uuid, p_follow boolean) returns void
language plpgsql security definer set search_path = public as $$
begin
  if app.school_role() is null then raise exception 'Sign in with an approved account to follow a sport.' using errcode = '42501'; end if;
  if p_follow then
    insert into sport_follows (sport_id, user_id) values (p_sport, auth.uid()) on conflict do nothing;
  else
    delete from sport_follows where sport_id = p_sport and user_id = auth.uid();
  end if;
end $$;

/** The signed-in person's sports, and why (following, and/or a registered child). */
create function public.my_sports() returns table (sport_id uuid, following boolean, registered boolean)
language sql stable security definer set search_path = public as $$ select * from app.involved_sports(auth.uid()) $$;

/** Coming up for the sports someone is involved in, soonest first. */
create function public.my_sport_schedule(p_days int default 60) returns setof public.sport_events
language sql stable security definer set search_path = public as $$
  select e.* from sport_events e join sport_seasons s on s.id = e.season_id
  where s.sport_id in (select sport_id from app.involved_sports(auth.uid()))
    and e.starts_at >= now() - interval '3 hours'
    and e.starts_at < now() + make_interval(days => least(greatest(coalesce(p_days, 60), 1), 366))
  order by e.starts_at
$$;

-- ======================================================================
-- Managing sports, coaches and seasons
-- ======================================================================

create function public.sport_save(p_id uuid, p_name text, p_icon text, p_description text) returns public.sports
language plpgsql security definer set search_path = public as $$
declare row sports%rowtype;
begin
  perform app.require_permission('sports.manage');
  if coalesce(trim(p_name), '') = '' then raise exception 'Give the sport a name.'; end if;
  if p_id is null then
    insert into sports (name, icon, description) values (trim(p_name), coalesce(nullif(trim(p_icon), ''), '🏅'), coalesce(trim(p_description), ''))
    returning * into row;
  else
    update sports set name = trim(p_name), icon = coalesce(nullif(trim(p_icon), ''), icon), description = coalesce(trim(p_description), '')
    where id = p_id returning * into row;
    if not found then raise exception 'No such sport.'; end if;
  end if;
  perform app.audit(null, 'sport.saved', row.id::text, jsonb_build_object('name', row.name));
  return row;
exception when unique_violation then
  raise exception 'There''s already a sport called %.', trim(p_name);
end $$;

create function public.sport_delete(p_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare n text;
begin
  perform app.require_permission('sports.manage');
  delete from sports where id = p_id returning name into n;
  if not found then raise exception 'No such sport.'; end if;
  perform app.audit(null, 'sport.deleted', p_id::text, jsonb_build_object('name', n));
end $$;

/** Sports managers put a staff member on (or off) a sport's coaching staff. */
create function public.sport_set_coach(p_sport uuid, p_user uuid, p_on boolean) returns void
language plpgsql security definer set search_path = public as $$
begin
  perform app.require_permission('sports.manage');
  if p_on then
    if not app.is_staff(p_user) then raise exception 'Only faculty and staff can coach.'; end if;
    insert into sport_coaches (sport_id, user_id) values (p_sport, p_user) on conflict do nothing;
  else
    delete from sport_coaches where sport_id = p_sport and user_id = p_user;
  end if;
  perform app.audit(null, case when p_on then 'sport.coach_on' else 'sport.coach_off' end, p_user::text, jsonb_build_object('sport', p_sport));
end $$;

/** Tell a sport's followers that a season's sign-ups are open (once). Run on save and daily. */
create function app.announce_sport_signups() returns int
language plpgsql security definer set search_path = public as $$
declare s record; u uuid; n int := 0;
begin
  for s in select se.* from sport_seasons se
    where se.signup_announced_at is null and se.signup_opens <= app.school_today() and se.signup_closes >= app.school_today()
    for update
  loop
    for u in select user_id from sport_follows where sport_id = s.sport_id loop
      perform app.notify_user(u, app.sport_label(s.sport_id) || ': sign-ups are open',
        s.name || ' · sign up by ' || to_char(s.signup_closes, 'Mon FMDD'),
        jsonb_build_object('sportId', s.sport_id, 'seasonId', s.id));
    end loop;
    update sport_seasons set signup_announced_at = now() where id = s.id;
    n := n + 1;
  end loop;
  return n;
end $$;

create function public.season_save(
  p_id uuid, p_sport uuid, p_name text, p_starts date, p_ends date,
  p_signup_opens date default null, p_signup_closes date default null,
  p_min_grade int default null, p_max_grade int default null, p_details text default '', p_info_url text default null
) returns public.sport_seasons
language plpgsql security definer set search_path = public as $$
declare row sport_seasons%rowtype; sport uuid := coalesce(app.season_sport(p_id), p_sport);
begin
  if sport is null then raise exception 'No such sport.'; end if;
  if not app.can_manage_sport(sport) then perform app.require_permission('sports.manage'); end if;
  if coalesce(trim(p_name), '') = '' then raise exception 'Give the season a name.'; end if;
  if p_info_url is not null and trim(p_info_url) <> '' and trim(p_info_url) !~* '^https?://' then
    raise exception 'The info link must start with https://.';
  end if;
  if p_id is null then
    insert into sport_seasons (sport_id, name, starts_on, ends_on, signup_opens, signup_closes, min_grade, max_grade, details, info_url)
    values (sport, trim(p_name), p_starts, p_ends, p_signup_opens, p_signup_closes, p_min_grade, p_max_grade,
            coalesce(trim(p_details), ''), nullif(trim(p_info_url), ''))
    returning * into row;
  else
    update sport_seasons set name = trim(p_name), starts_on = p_starts, ends_on = p_ends,
      signup_opens = p_signup_opens, signup_closes = p_signup_closes, min_grade = p_min_grade, max_grade = p_max_grade,
      details = coalesce(trim(p_details), ''), info_url = nullif(trim(p_info_url), ''),
      -- a new window gets announced again
      signup_announced_at = case when signup_opens is distinct from p_signup_opens then null else signup_announced_at end
    where id = p_id returning * into row;
  end if;
  perform app.announce_sport_signups();
  return row;
exception when check_violation then
  raise exception 'Check the dates: the season and sign-up must end on or after they start, and sign-up needs both dates.';
end $$;

create function public.season_delete(p_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare sport uuid := app.season_sport(p_id);
begin
  if sport is null then raise exception 'No such season.'; end if;
  if not app.can_manage_sport(sport) then perform app.require_permission('sports.manage'); end if;
  delete from sport_seasons where id = p_id;
end $$;

-- ======================================================================
-- The schedule
-- ======================================================================

/** Tell everyone involved in a sport about a schedule change (not the person who made it). */
create function app.sport_schedule_note(e public.sport_events, what text) returns void
language plpgsql security definer set search_path = public as $$
declare sport uuid := app.season_sport(e.season_id); u uuid;
begin
  for u in select * from app.sport_audience(sport) loop
    if u <> coalesce(auth.uid(), '00000000-0000-0000-0000-000000000000'::uuid) then
      perform app.notify_user(u, app.sport_label(sport) || ': ' || what,
        e.title || ' · ' || app.sport_when(e.starts_at) || coalesce(' · ' || e.location, ''),
        jsonb_build_object('sportId', sport, 'eventId', e.id));
    end if;
  end loop;
end $$;

create function public.sport_event_save(
  p_id uuid, p_season uuid, p_kind text, p_title text, p_starts timestamptz, p_ends timestamptz default null,
  p_location text default null, p_home boolean default null, p_notes text default ''
) returns public.sport_events
language plpgsql security definer set search_path = public as $$
declare old sport_events%rowtype; row sport_events%rowtype; season uuid;
begin
  if p_id is not null then
    select * into old from sport_events where id = p_id;
    if not found then raise exception 'That schedule item is gone.'; end if;
  end if;
  season := coalesce(old.season_id, p_season);
  if season is null or not app.can_manage_sport(app.season_sport(season)) then perform app.require_permission('sports.manage'); end if;
  if coalesce(trim(p_title), '') = '' then raise exception 'Add a title, like "vs. Westminster" or "Practice".'; end if;
  if p_id is null then
    insert into sport_events (season_id, kind, title, starts_at, ends_at, location, home, notes, created_by)
    values (season, coalesce(p_kind, 'game'), trim(p_title), p_starts, p_ends, nullif(trim(p_location), ''), p_home,
            coalesce(trim(p_notes), ''), auth.uid())
    returning * into row;
    perform app.sport_schedule_note(row, 'new ' || (case row.kind when 'other' then 'event' else row.kind end));
  else
    update sport_events set kind = coalesce(p_kind, kind), title = trim(p_title), starts_at = p_starts, ends_at = p_ends,
      location = nullif(trim(p_location), ''), home = p_home, notes = coalesce(trim(p_notes), ''), updated_at = now()
    where id = p_id returning * into row;
    if row.starts_at is distinct from old.starts_at or row.location is distinct from old.location then
      perform app.sport_schedule_note(row, (case row.kind when 'other' then 'event' else row.kind end) || ' changed');
    end if;
  end if;
  return row;
exception when check_violation then
  raise exception 'The end time must be after the start.';
end $$;

/** Cancel a game or practice (or undo it); everyone involved is told. */
create function public.sport_event_cancel(p_id uuid, p_cancelled boolean default true) returns public.sport_events
language plpgsql security definer set search_path = public as $$
declare row sport_events%rowtype;
begin
  select * into row from sport_events where id = p_id;
  if not found then raise exception 'That schedule item is gone.'; end if;
  if not app.can_manage_sport(app.season_sport(row.season_id)) then perform app.require_permission('sports.manage'); end if;
  if row.cancelled = p_cancelled then return row; end if;
  update sport_events set cancelled = p_cancelled, updated_at = now() where id = p_id returning * into row;
  perform app.sport_schedule_note(row, case when p_cancelled then 'cancelled' else 'back on' end);
  return row;
end $$;

create function public.sport_event_delete(p_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare row sport_events%rowtype;
begin
  select * into row from sport_events where id = p_id;
  if not found then return; end if;
  if not app.can_manage_sport(app.season_sport(row.season_id)) then perform app.require_permission('sports.manage'); end if;
  delete from sport_events where id = p_id;
  if not row.cancelled and row.starts_at > now() then perform app.sport_schedule_note(row, 'removed from the schedule'); end if;
end $$;

-- ======================================================================
-- Sign-ups
-- ======================================================================

/** A parent signs a child up for a season; the coaches decide. */
create function public.sport_register(p_season uuid, p_student uuid, p_note text default '') returns public.sport_registrations
language plpgsql security definer set search_path = public as $$
declare s sport_seasons%rowtype; g int; row sport_registrations%rowtype; who text; u uuid;
begin
  if app.school_role() is null then raise exception 'Sign in with an approved account to sign up.' using errcode = '42501'; end if;
  if not app.is_guardian_of(p_student) then raise exception 'You can only sign up your own children.' using errcode = '42501'; end if;
  select * into s from sport_seasons where id = p_season;
  if not found then raise exception 'No such season.'; end if;
  if s.signup_opens is null or app.school_today() not between s.signup_opens and s.signup_closes then
    raise exception 'Sign-ups for % aren''t open.', s.name;
  end if;
  select grade into g from profiles where id = p_student;
  if (s.min_grade is not null and (g is null or g < s.min_grade)) or (s.max_grade is not null and (g is null or g > s.max_grade)) then
    raise exception '% is for %.', s.name,
      case when s.min_grade is not null and s.max_grade is not null then app.grade_label(s.min_grade) || '–' || app.grade_label(s.max_grade) || ' grade'
           when s.min_grade is not null then app.grade_label(s.min_grade) || ' grade and up'
           else app.grade_label(s.max_grade) || ' grade and below' end;
  end if;
  insert into sport_registrations (season_id, student_id, requested_by, note)
  values (p_season, p_student, auth.uid(), coalesce(trim(p_note), ''))
  on conflict (season_id, student_id) do update
    set status = 'pending', requested_by = auth.uid(), note = excluded.note, decided_by = null, decided_at = null,
        decision_note = '', created_at = now()
    where sport_registrations.status in ('declined', 'withdrawn')
  returning * into row;
  if row.id is null then raise exception 'They''re already signed up for %.', s.name; end if;
  select trim(first_name || ' ' || last_name) into who from profiles where id = p_student;
  for u in select * from app.sport_signup_team(s.sport_id) loop
    perform app.notify_user(u, app.sport_label(s.sport_id) || ': new sign-up',
      who || ' for ' || s.name || ' (from ' || app.short_name(auth.uid()) || ')',
      jsonb_build_object('sportId', s.sport_id, 'registrationId', row.id));
  end loop;
  return row;
end $$;

/** A parent takes a sign-up back (waiting or registered). */
create function public.sport_withdraw(p_registration uuid) returns void
language plpgsql security definer set search_path = public as $$
declare r sport_registrations%rowtype; s sport_seasons%rowtype; u uuid;
begin
  select * into r from sport_registrations where id = p_registration;
  if not found or not app.is_guardian_of(r.student_id) then raise exception 'That sign-up can''t be withdrawn.' using errcode = '42501'; end if;
  if r.status not in ('pending', 'registered') then return; end if;
  update sport_registrations set status = 'withdrawn' where id = p_registration;
  select * into s from sport_seasons where id = r.season_id;
  if r.status = 'registered' then
    for u in select * from app.sport_signup_team(s.sport_id) loop
      perform app.notify_user(u, app.sport_label(s.sport_id) || ': sign-up withdrawn',
        (select trim(first_name || ' ' || last_name) from profiles where id = r.student_id) || ' · ' || s.name,
        jsonb_build_object('sportId', s.sport_id, 'registrationId', r.id));
    end loop;
  end if;
end $$;

/** Coaches and sports managers approve or decline a sign-up; the parent is told. */
create function public.sport_decide(p_registration uuid, p_approve boolean, p_note text default '') returns public.sport_registrations
language plpgsql security definer set search_path = public as $$
declare r sport_registrations%rowtype; s sport_seasons%rowtype; who text;
begin
  select * into r from sport_registrations where id = p_registration;
  if not found then raise exception 'No such sign-up.'; end if;
  select * into s from sport_seasons where id = r.season_id;
  if not app.can_manage_sport(s.sport_id) then perform app.require_permission('sports.manage'); end if;
  if r.status = 'withdrawn' then raise exception 'The family withdrew this sign-up.'; end if;
  update sport_registrations set status = case when p_approve then 'registered' else 'declined' end,
    decided_by = auth.uid(), decided_at = now(), decision_note = coalesce(trim(p_note), '')
  where id = p_registration returning * into r;
  select first_name into who from profiles where id = r.student_id;
  perform app.notify_user(r.requested_by,
    app.sport_label(s.sport_id) || ': ' || case when p_approve then who || ' is registered' else 'sign-up not accepted' end,
    s.name || case when coalesce(trim(p_note), '') <> '' then ' · ' || trim(p_note) else '' end,
    jsonb_build_object('sportId', s.sport_id, 'registrationId', r.id))
  where r.requested_by is not null;
  return r;
end $$;

-- Daily, where pg_cron exists (Supabase): announce seasons whose sign-ups open today.
do $$
begin
  if exists (select 1 from pg_available_extensions where name = 'pg_cron') then
    create extension if not exists pg_cron;
    perform cron.schedule('announce-sport-signups', '0 12 * * *', 'select app.announce_sport_signups()');
  end if;
exception when others then
  raise notice 'pg_cron not available: %', sqlerrm;
end $$;

-- ======================================================================
-- Privileges
-- ======================================================================

revoke all on public.sports, public.sport_coaches, public.sport_seasons, public.sport_registrations,
  public.sport_follows, public.sport_events from anon, authenticated;
grant select on public.sports, public.sport_coaches, public.sport_seasons, public.sport_events to anon, authenticated;
grant select on public.sport_registrations, public.sport_follows to authenticated;
grant all on public.sports, public.sport_coaches, public.sport_seasons, public.sport_registrations,
  public.sport_follows, public.sport_events to service_role;

revoke all on function app.can_manage_sport(uuid, uuid), app.season_sport(uuid), app.my_students(uuid),
  app.involved_sports(uuid), app.sport_audience(uuid), app.sport_signup_team(uuid), app.sport_label(uuid),
  app.sport_when(timestamptz), app.announce_sport_signups(), app.sport_schedule_note(public.sport_events, text) from public, anon;
grant execute on function app.can_manage_sport(uuid, uuid), app.season_sport(uuid), app.my_students(uuid)
  to authenticated, service_role;
revoke all on function public.sport_follow(uuid, boolean), public.my_sports(), public.my_sport_schedule(int),
  public.sport_save(uuid, text, text, text), public.sport_delete(uuid), public.sport_set_coach(uuid, uuid, boolean),
  public.season_save(uuid, uuid, text, date, date, date, date, int, int, text, text), public.season_delete(uuid),
  public.sport_event_save(uuid, uuid, text, text, timestamptz, timestamptz, text, boolean, text),
  public.sport_event_cancel(uuid, boolean), public.sport_event_delete(uuid),
  public.sport_register(uuid, uuid, text), public.sport_withdraw(uuid), public.sport_decide(uuid, boolean, text)
  from public, anon;
grant execute on function public.sport_follow(uuid, boolean), public.my_sports(), public.my_sport_schedule(int),
  public.sport_save(uuid, text, text, text), public.sport_delete(uuid), public.sport_set_coach(uuid, uuid, boolean),
  public.season_save(uuid, uuid, text, date, date, date, date, int, int, text, text), public.season_delete(uuid),
  public.sport_event_save(uuid, uuid, text, text, timestamptz, timestamptz, text, boolean, text),
  public.sport_event_cancel(uuid, boolean), public.sport_event_delete(uuid),
  public.sport_register(uuid, uuid, text), public.sport_withdraw(uuid), public.sport_decide(uuid, boolean, text)
  to authenticated, service_role;

alter publication supabase_realtime add table public.sport_events, public.sport_registrations;
