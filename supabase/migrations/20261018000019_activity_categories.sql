-- Activities: the Sports app becomes Activities (Apps → Activities), for sports,
-- theater, music, art and clubs alike. Activities stay in the sports tables from
-- 20261018000018 (renaming them would break every function); each gets a category,
-- and the schedule gets theater, music and club kinds (rehearsals, auditions,
-- performances, meetings, competitions, exhibits). Existing activities are sports.

alter table public.sports add column category text not null default 'sports'
  check (category in ('sports', 'theater', 'music', 'art', 'clubs'));
create index on public.sports (category);

alter table public.sport_events drop constraint sport_events_kind_check;
alter table public.sport_events add constraint sport_events_kind_check check (kind in (
  'game', 'practice', 'tryout', 'tournament',            -- sports
  'rehearsal', 'audition', 'performance',                 -- theater and music
  'meeting', 'competition', 'exhibit', 'other'));         -- art, clubs, anything

-- The permission keeps its key; it now covers every activity.
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
    ('sports.manage',    'Manage activities',     'Add activities (sports, theater, music, art, clubs) and seasons, set schedules, assign coaches and directors, and approve sign-ups.'),
    ('audit.view',       'Activity log',          'Review the school-wide activity log.')
$$;

drop function public.sport_save(uuid, text, text, text);
create function public.sport_save(p_id uuid, p_name text, p_icon text, p_description text, p_category text default 'sports')
returns public.sports
language plpgsql security definer set search_path = public as $$
declare row sports%rowtype;
begin
  perform app.require_permission('sports.manage');
  if coalesce(trim(p_name), '') = '' then raise exception 'Give the activity a name.'; end if;
  if coalesce(p_category, 'sports') not in ('sports', 'theater', 'music', 'art', 'clubs') then
    raise exception 'Pick Sports, Theater, Music, Art or Clubs.';
  end if;
  if p_id is null then
    insert into sports (name, icon, description, category)
    values (trim(p_name), coalesce(nullif(trim(p_icon), ''), '🏅'), coalesce(trim(p_description), ''), coalesce(p_category, 'sports'))
    returning * into row;
  else
    update sports set name = trim(p_name), icon = coalesce(nullif(trim(p_icon), ''), icon), description = coalesce(trim(p_description), ''),
      category = coalesce(p_category, category)
    where id = p_id returning * into row;
    if not found then raise exception 'No such activity.'; end if;
  end if;
  perform app.audit(null, 'sport.saved', row.id::text, jsonb_build_object('name', row.name, 'category', row.category));
  return row;
exception when unique_violation then
  raise exception 'There''s already an activity called %.', trim(p_name);
end $$;

create or replace function public.sport_delete(p_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare n text;
begin
  perform app.require_permission('sports.manage');
  delete from sports where id = p_id returning name into n;
  if not found then raise exception 'No such activity.'; end if;
  perform app.audit(null, 'sport.deleted', p_id::text, jsonb_build_object('name', n));
end $$;

create or replace function public.sport_follow(p_sport uuid, p_follow boolean) returns void
language plpgsql security definer set search_path = public as $$
begin
  if app.school_role() is null then raise exception 'Sign in with an approved account to follow an activity.' using errcode = '42501'; end if;
  if p_follow then
    insert into sport_follows (sport_id, user_id) values (p_sport, auth.uid()) on conflict do nothing;
  else
    delete from sport_follows where sport_id = p_sport and user_id = auth.uid();
  end if;
end $$;

/** Activity managers put a staff member on (or off) an activity's coaches or directors. */
create or replace function public.sport_set_coach(p_sport uuid, p_user uuid, p_on boolean) returns void
language plpgsql security definer set search_path = public as $$
begin
  perform app.require_permission('sports.manage');
  if p_on then
    if not app.is_staff(p_user) then raise exception 'Only faculty and staff can coach or direct an activity.'; end if;
    insert into sport_coaches (sport_id, user_id) values (p_sport, p_user) on conflict do nothing;
  else
    delete from sport_coaches where sport_id = p_sport and user_id = p_user;
  end if;
  perform app.audit(null, case when p_on then 'sport.coach_on' else 'sport.coach_off' end, p_user::text, jsonb_build_object('sport', p_sport));
end $$;

revoke all on function public.sport_save(uuid, text, text, text, text) from public, anon;
grant execute on function public.sport_save(uuid, text, text, text, text) to authenticated, service_role;

-- Clear messages for each mistake (before, any rule broken read as a date error).
create or replace function public.season_save(
  p_id uuid, p_sport uuid, p_name text, p_starts date, p_ends date,
  p_signup_opens date default null, p_signup_closes date default null,
  p_min_grade int default null, p_max_grade int default null, p_details text default '', p_info_url text default null
) returns public.sport_seasons
language plpgsql security definer set search_path = public as $$
declare row sport_seasons%rowtype; sport uuid := coalesce(app.season_sport(p_id), p_sport);
begin
  if sport is null then raise exception 'No such activity.'; end if;
  if not app.can_manage_sport(sport) then perform app.require_permission('sports.manage'); end if;
  if coalesce(trim(p_name), '') = '' or char_length(trim(p_name)) > 80 then raise exception 'Give the season a name (up to 80 characters).'; end if;
  if p_starts is null or p_ends is null or p_ends < p_starts then raise exception 'The season must end on or after it starts.'; end if;
  if (p_signup_opens is null) <> (p_signup_closes is null) then raise exception 'Give sign-up both an opening and a closing date, or neither.'; end if;
  if p_signup_closes < p_signup_opens then raise exception 'Sign-up must close on or after it opens.'; end if;
  if p_max_grade < p_min_grade then raise exception 'The oldest grade can''t be below the youngest.'; end if;
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
      signup_announced_at = case when signup_opens is distinct from p_signup_opens then null else signup_announced_at end
    where id = p_id returning * into row;
  end if;
  perform app.announce_sport_signups();
  return row;
end $$;

create or replace function public.sport_event_save(
  p_id uuid, p_season uuid, p_kind text, p_title text, p_starts timestamptz, p_ends timestamptz default null,
  p_location text default null, p_home boolean default null, p_notes text default ''
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
  if p_id is null then
    insert into sport_events (season_id, kind, title, starts_at, ends_at, location, home, notes, created_by)
    values (season, coalesce(p_kind, 'game'), trim(p_title), p_starts, p_ends, nullif(trim(p_location), ''), p_home,
            coalesce(trim(p_notes), ''), auth.uid())
    returning * into row;
    what := case row.kind when 'other' then 'event' when 'audition' then 'auditions' else row.kind end;
    perform app.sport_schedule_note(row, 'new ' || what);
  else
    update sport_events set kind = coalesce(p_kind, kind), title = trim(p_title), starts_at = p_starts, ends_at = p_ends,
      location = nullif(trim(p_location), ''), home = p_home, notes = coalesce(trim(p_notes), ''), updated_at = now()
    where id = p_id returning * into row;
    what := case row.kind when 'other' then 'event' when 'audition' then 'auditions' else row.kind end;
    if row.starts_at is distinct from old.starts_at or row.location is distinct from old.location then
      perform app.sport_schedule_note(row, what || ' changed');
    end if;
  end if;
  return row;
end $$;
