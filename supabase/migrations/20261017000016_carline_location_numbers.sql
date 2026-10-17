-- Car line, PikMyKid style.
--
-- * Every student has a pickup number (assigned automatically; the office or a
--   car line lead can change it). Staff call children by number; parents see
--   their children's numbers. Only staff and the child's parents can read it.
-- * Parents announce "I'm here" only from within the pickup radius: the app
--   sends the phone's location and the server checks the distance. Only a
--   child's linked parents can announce for that child.
-- * All staff (teachers, staff, admins) see the live line and confirm pickups.
-- * Car line leads (carline_duty) and the office (people.family) set the
--   pickup spot, the radius and the hours, and can open the line now (drills,
--   demos, early dismissal) for the rest of the day.

-- ======================================================================
-- Pickup numbers
-- ======================================================================

create table public.pickup_numbers (
  student_id uuid primary key references public.profiles (id) on delete cascade,
  number     text not null check (number ~ '^[A-Za-z0-9-]{1,8}$'),
  updated_at timestamptz not null default now()
);
create index on public.pickup_numbers (number);
alter table public.pickup_numbers enable row level security;
create policy "staff and the child's parents" on public.pickup_numbers for select to authenticated
  using (app.is_staff() or app.is_guardian_of(student_id));
grant select on public.pickup_numbers to authenticated;
revoke insert, update, delete on public.pickup_numbers from anon, authenticated;
grant all on public.pickup_numbers to service_role;

/** The next unused number (numbers start at 101). */
create function app.next_pickup_number() returns text
language sql volatile security definer set search_path = public as $$
  select (greatest(100, coalesce(max(number::int), 100)) + 1)::text from pickup_numbers where number ~ '^[0-9]{1,7}$'
$$;

/** Every student gets a number when they become a student. */
create function app.assign_pickup_number() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.school_role = 'student' and not exists (select 1 from pickup_numbers where student_id = new.id) then
    insert into pickup_numbers (student_id, number) values (new.id, app.next_pickup_number());
  end if;
  return new;
end $$;
create trigger assign_pickup_number after insert or update of school_role on public.profiles
  for each row execute function app.assign_pickup_number();

-- Students who already exist.
do $$
declare s uuid;
begin
  for s in select id from profiles where school_role = 'student' and id not in (select student_id from pickup_numbers)
           order by last_name, first_name loop
    insert into pickup_numbers (student_id, number) values (s, app.next_pickup_number());
  end loop;
end $$;

create function app.can_run_carline(u uuid default auth.uid()) returns boolean
language sql stable security definer set search_path = public as $$
  select app.on_carline_duty(u) or app.has_permission('people.family', u)
$$;

/** The office or a car line lead: change a student's pickup number (siblings may share one). */
create function public.set_pickup_number(p_student uuid, p_number text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not app.can_run_carline() then
    raise exception 'Only the office or a car line lead can change pickup numbers.' using errcode = '42501';
  end if;
  if coalesce(app.school_role(p_student), '') <> 'student' then raise exception 'No such student.'; end if;
  if coalesce(trim(p_number), '') !~ '^[A-Za-z0-9-]{1,8}$' then
    raise exception 'Pickup numbers are 1–8 letters or digits.';
  end if;
  insert into pickup_numbers (student_id, number) values (p_student, upper(trim(p_number)))
  on conflict (student_id) do update set number = excluded.number, updated_at = now();
  perform app.audit(null, 'carline.number', p_student::text, jsonb_build_object('number', upper(trim(p_number))));
end $$;

-- ======================================================================
-- Where, how far, when
-- ======================================================================

insert into app.settings values ('carline_open_on', null) on conflict (key) do nothing;

/** Metres between two points (haversine). */
create function app.distance_m(lat1 float8, lng1 float8, lat2 float8, lng2 float8) returns float8
language sql immutable as $$
  select 2 * 6371000 * asin(sqrt(
    power(sin(radians(lat2 - lat1) / 2), 2) +
    cos(radians(lat1)) * cos(radians(lat2)) * power(sin(radians(lng2 - lng1) / 2), 2)))
$$;

/** Open on school days in the pickup window, or any time the line was opened for today. */
create or replace function app.carline_window(now_ts timestamptz default now()) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  local timestamp := now_ts at time zone 'America/Chicago';
  d date := local::date;
  t time := local::time;
  opens time := coalesce(app.setting('carline_start'), '14:45')::time;
  closes time := coalesce(app.setting('carline_end'), '15:30')::time;
begin
  if app.setting('carline_open_on') = d::text then
    return jsonb_build_object('state', 'open', 'openedNow', true);
  end if;
  if not (extract(isodow from d)::int = any (string_to_array(coalesce(app.setting('carline_days'), '1,2,3,4,5'), ',')::int[]))
     or d < coalesce(app.setting('carline_first_day'), '-infinity')::date
     or d > coalesce(app.setting('carline_last_day'), 'infinity')::date
     or exists (select 1 from events
                where group_id is null and category in ('No School', 'Teacher In-Service', 'E-Learning')
                  and d between starts_on and coalesce(ends_on, starts_on))
     or t > closes then
    return jsonb_build_object('state', 'closed');
  end if;
  if t < opens then
    return jsonb_build_object('state', 'early', 'opensAt', (d + opens) at time zone 'America/Chicago');
  end if;
  return jsonb_build_object('state', 'open');
end $$;

/** The car line zone and hours (and whether it's open now), for the app. */
create or replace function public.carline_config() returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'latitude', app.setting('carline_latitude')::float8,
    'longitude', app.setting('carline_longitude')::float8,
    'radius', app.setting('carline_radius_m')::float8,
    'start', app.setting('carline_start'),
    'end', app.setting('carline_end'),
    'line', app.carline_window(),
    'canEdit', app.can_run_carline())
$$;

/** Car line leads and the office: pickup spot, radius (metres) and hours. */
create function public.carline_set_config(p_lat float8, p_lng float8, p_radius float8, p_start text, p_end text) returns jsonb
language plpgsql security definer set search_path = public as $$
begin
  if not app.can_run_carline() then
    raise exception 'Only car line leads and the office can change car line settings.' using errcode = '42501';
  end if;
  if p_lat is null or p_lng is null or p_lat not between -90 and 90 or p_lng not between -180 and 180 then
    raise exception 'Set the pickup location.';
  end if;
  if p_radius is null or p_radius < 20 or p_radius > 3000 then
    raise exception 'Choose a radius between 20 and 3,000 metres (about 65 feet to 2 miles).';
  end if;
  if p_start !~ '^\d{1,2}:\d{2}$' or p_end !~ '^\d{1,2}:\d{2}$' or p_start::time >= p_end::time then
    raise exception 'Set pickup hours like 14:45 to 15:30.';
  end if;
  update app.settings set value = round(p_lat::numeric, 6)::text where key = 'carline_latitude';
  update app.settings set value = round(p_lng::numeric, 6)::text where key = 'carline_longitude';
  update app.settings set value = round(p_radius)::text where key = 'carline_radius_m';
  update app.settings set value = p_start where key = 'carline_start';
  update app.settings set value = p_end where key = 'carline_end';
  perform app.audit(null, 'carline.settings', null,
                    jsonb_build_object('lat', p_lat, 'lng', p_lng, 'radius', p_radius, 'start', p_start, 'end', p_end));
  return public.carline_config();
end $$;

/** Car line leads and the office: open the line for the rest of today (or close it again). */
create function public.carline_open_now(p_open boolean) returns jsonb
language plpgsql security definer set search_path = public as $$
begin
  if not app.can_run_carline() then
    raise exception 'Only car line leads and the office can open the car line.' using errcode = '42501';
  end if;
  update app.settings set value = case when p_open then app.school_today()::text end where key = 'carline_open_on';
  perform app.audit(null, case when p_open then 'carline.opened' else 'carline.closed' end);
  return public.carline_config();
end $$;

-- ======================================================================
-- Announcing arrival (location required)
-- ======================================================================

alter table public.carline_pickups add column distance_m int;   -- how far from the pickup spot when announced

/** Raise unless (lat, lng) is within the radius (allowing for the phone's accuracy, up to 50 m). */
create function app.require_at_school(p_lat float8, p_lng float8, p_accuracy float8) returns int
language plpgsql stable security definer set search_path = public as $$
declare d float8; r float8 := coalesce(app.setting('carline_radius_m')::float8, 150);
begin
  if p_lat is null or p_lng is null then
    raise exception 'Turn on location for KH Royals so the school knows you''re at pickup.';
  end if;
  d := app.distance_m(p_lat, p_lng, app.setting('carline_latitude')::float8, app.setting('carline_longitude')::float8);
  if d > r + least(greatest(coalesce(p_accuracy, 0), 0), 50) then
    raise exception 'You''re about % from the pickup spot. You can announce when you''re within %.',
      case when d >= 1609 then round((d / 1609.34)::numeric, 1) || ' miles' else round(d * 3.28084) || ' feet' end,
      round(r * 3.28084) || ' feet';
  end if;
  return round(d)::int;
end $$;

/** A parent at pickup announces the children they're collecting (all of theirs when p_students is null). */
create function public.carline_announce(p_students uuid[], p_lat float8, p_lng float8, p_accuracy float8 default null)
returns setof public.carline_pickups
language plpgsql security definer set search_path = public as $$
declare kids uuid[]; dist int;
begin
  if coalesce(app.school_role(), 'student') = 'student' then
    raise exception 'Only parents can announce pickup.' using errcode = '42501';
  end if;
  if p_students is not null and exists (select 1 from unnest(p_students) s where not app.is_guardian_of(s)) then
    raise exception 'You can only announce your own children.' using errcode = '42501';
  end if;
  kids := coalesce(p_students, array(select student_id from guardians where guardian_id = auth.uid()));
  if cardinality(kids) = 0 then raise exception 'No children are linked to your account yet.'; end if;
  if app.carline_window()->>'state' = 'closed' then raise exception 'The car line is closed right now.'; end if;
  dist := app.require_at_school(p_lat, p_lng, p_accuracy);
  insert into carline_pickups (student_id, guardian_id, distance_m)
    select distinct k, auth.uid(), dist from unnest(kids) k
    on conflict (student_id, day) where status = 'waiting' do nothing;
  return query select * from carline_pickups
    where student_id = any (kids) and day = app.school_today() and status = 'waiting' order by arrived_at;
end $$;

-- The old check-in had no location check: it now needs the current app.
create or replace function public.carline_check_in(p_students uuid[] default null) returns setof public.carline_pickups
language plpgsql security definer set search_path = public as $$
begin
  raise exception 'Update KH Royals to announce pickup (it now checks that you''re at school).';
end $$;

/** Automatic check-in (geofence): same rules, with the phone's location. */
drop function public.carline_arrived();
create function public.carline_arrived(p_lat float8, p_lng float8, p_accuracy float8 default null) returns jsonb
language plpgsql security definer set search_path = public as $$
declare w jsonb := app.carline_window(); ids uuid[]; names text[]; dist int;
begin
  if app.school_role() is null then raise exception 'Sign in to use the car line.' using errcode = '42501'; end if;
  if w->>'state' <> 'open' then return w; end if;
  dist := app.require_at_school(p_lat, p_lng, p_accuracy);
  with ins as (
    insert into carline_pickups (student_id, guardian_id, via, distance_m)
      select g.student_id, auth.uid(), 'arrival', dist from guardians g
      where g.guardian_id = auth.uid()
        and not exists (select 1 from carline_pickups c where c.student_id = g.student_id
                          and c.day = app.school_today() and c.status in ('waiting', 'picked_up'))
    on conflict (student_id, day) where status = 'waiting' do nothing
    returning id, student_id
  )
  select array_agg(ins.id order by p.first_name), array_agg(p.first_name order by p.first_name)
    into ids, names from ins join profiles p on p.id = ins.student_id;
  return jsonb_build_object('state', 'open', 'checkedIn', coalesce(to_jsonb(ids), '[]'::jsonb),
                            'names', coalesce(to_jsonb(names), '[]'::jsonb));
end $$;

-- ======================================================================
-- Staff: everyone on staff sees the line and confirms pickups
-- ======================================================================

drop policy "car line: your children, or staff on duty" on public.carline_pickups;
create policy "car line: your children, or staff" on public.carline_pickups for select to authenticated
  using (app.is_guardian_of(student_id) or app.is_staff());

create or replace function public.carline_confirm(p_pickup uuid) returns public.carline_pickups
language plpgsql security definer set search_path = public as $$
declare r carline_pickups%rowtype;
begin
  if not app.is_staff() then raise exception 'Only school staff can confirm pickups.' using errcode = '42501'; end if;
  update carline_pickups set status = 'picked_up', picked_up_at = now(), picked_up_by = auth.uid()
  where id = p_pickup and status = 'waiting' returning * into r;
  if not found then raise exception 'That child isn''t waiting in the car line.'; end if;
  return r;
end $$;

create or replace function public.carline_reopen(p_pickup uuid) returns public.carline_pickups
language plpgsql security definer set search_path = public as $$
declare r carline_pickups%rowtype;
begin
  if not app.is_staff() then raise exception 'Only school staff can change pickups.' using errcode = '42501'; end if;
  update carline_pickups set status = 'waiting', picked_up_at = null, picked_up_by = null
  where id = p_pickup and status = 'picked_up' and day = app.school_today() returning * into r;
  if not found then raise exception 'Only today''s pickups can be undone.'; end if;
  return r;
exception when unique_violation then
  raise exception 'This child is already waiting in the car line again.';
end $$;

/** The staff board: today's line with pickup numbers, names, grades and parents, in arrival order. */
create function public.carline_board() returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  if not app.is_staff() then raise exception 'The car line board is for school staff.' using errcode = '42501'; end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', c.id, 'studentId', c.student_id, 'status', c.status, 'via', c.via,
      'arrivedAt', c.arrived_at, 'pickedUpAt', c.picked_up_at, 'distanceM', c.distance_m,
      'number', n.number, 'name', trim(s.first_name || ' ' || s.last_name), 'grade', s.grade,
      'parent', trim(g.first_name || ' ' || g.last_name),
      'pickedUpBy', trim(coalesce(b.first_name, '') || ' ' || coalesce(b.last_name, '')))
      order by c.arrived_at)
    from carline_pickups c
    join profiles s on s.id = c.student_id
    left join pickup_numbers n on n.student_id = c.student_id
    left join profiles g on g.id = c.guardian_id
    left join profiles b on b.id = c.picked_up_by
    where c.day = app.school_today() and c.status in ('waiting', 'picked_up')), '[]'::jsonb);
end $$;

-- ======================================================================
-- Children's numbers for parents and the car screen
-- ======================================================================

create or replace function public.my_children() returns jsonb
language plpgsql security definer set search_path = public as $$
begin
  perform app.refresh_grades();
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', p.id, 'firstName', p.first_name, 'lastName', p.last_name, 'grade', p.grade, 'gradeLabel', app.grade_label(p.grade),
      'classOf', p.class_of, 'photoPath', p.avatar_url, 'hasLogin', not p.managed, 'pickupNumber', n.number,
      'birthday', d.birthday, 'bio', coalesce(d.bio, ''), 'allergies', coalesce(d.allergies, ''), 'medicalNotes', coalesce(d.medical_notes, ''),
      'parents', (select coalesce(jsonb_agg(trim(q.first_name || ' ' || q.last_name) order by q.first_name), '[]'::jsonb)
                  from guardians g2 join profiles q on q.id = g2.guardian_id where g2.student_id = p.id))
      order by p.first_name)
    from guardians g join profiles p on p.id = g.student_id
    left join student_details d on d.student_id = p.id left join pickup_numbers n on n.student_id = p.id
    where g.guardian_id = auth.uid() and p.school_role = 'student'), '[]'::jsonb);
end $$;

create or replace function public.car_carline_status(p_token text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare u uuid := app.use_car_pass(p_token);
begin
  return jsonb_build_object(
    'line', app.carline_window(),
    'children', coalesce((
      select jsonb_agg(jsonb_build_object(
               'name', trim(p.first_name),
               'number', n.number,
               'status', coalesce(c.status, 'none'),
               'position', case when c.status = 'waiting' then (
                 select count(*) from carline_pickups w
                 where w.day = app.school_today() and w.status = 'waiting' and w.arrived_at <= c.arrived_at) end)
             order by p.first_name)
      from guardians g join profiles p on p.id = g.student_id
      left join pickup_numbers n on n.student_id = p.id
      left join lateral (
        select * from carline_pickups x
        where x.student_id = g.student_id and x.day = app.school_today() and x.status in ('waiting', 'picked_up')
        order by (x.status = 'waiting') desc, x.arrived_at desc limit 1) c on true
      where g.guardian_id = u and p.school_role = 'student'), '[]'::jsonb));
end $$;

drop function public.car_carline_check_in(text);
/** Android Auto "I'm here", with the phone's location. */
create function public.car_carline_check_in(p_token text, p_lat float8, p_lng float8, p_accuracy float8 default null) returns jsonb
language plpgsql security definer set search_path = public as $$
begin
  perform app.use_car_pass(p_token);
  perform public.carline_announce(null, p_lat, p_lng, p_accuracy);
  return public.car_carline_status(p_token);
end $$;

-- ======================================================================
-- Privileges
-- ======================================================================

revoke all on function app.next_pickup_number(), app.assign_pickup_number(), app.require_at_school(float8, float8, float8)
  from public, anon, authenticated;
grant execute on function app.can_run_carline(uuid), app.distance_m(float8, float8, float8, float8) to authenticated, service_role;
revoke all on function public.set_pickup_number(uuid, text), public.carline_set_config(float8, float8, float8, text, text),
  public.carline_open_now(boolean), public.carline_announce(uuid[], float8, float8, float8),
  public.carline_arrived(float8, float8, float8), public.carline_board() from public, anon;
grant execute on function public.set_pickup_number(uuid, text), public.carline_set_config(float8, float8, float8, text, text),
  public.carline_open_now(boolean), public.carline_announce(uuid[], float8, float8, float8),
  public.carline_arrived(float8, float8, float8), public.carline_board() to authenticated, service_role;
revoke all on function public.car_carline_check_in(text, float8, float8, float8) from public;
grant execute on function public.car_carline_check_in(text, float8, float8, float8) to anon, authenticated, service_role;
