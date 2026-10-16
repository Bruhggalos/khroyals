-- Automatic car line check-in.
--
-- Parents can opt in to a geofence around the car line. When their phone
-- notices them arriving, the app calls carline_arrived(), and the server
-- decides whether the line is open: school days (Mon–Fri within the school
-- year, skipping No School, Teacher In-Service and E-Learning days on the school
-- calendar) during the pickup window, in Central time.
--
-- Where and when live in app.settings, so the office can move the zone or change
-- the hours without an app update (Supabase dashboard → app.settings for now).
-- The zone starts centered on 3401 Holmes Ave NW; move it to the car line
-- entrance for better results.

insert into app.settings values
  ('carline_latitude',  '34.7264'),
  ('carline_longitude', '-86.6177'),
  ('carline_radius_m',  '150'),
  ('carline_start',     '14:45'),
  ('carline_end',       '15:30'),
  ('carline_days',      '1,2,3,4,5'),     -- ISO weekdays, Monday = 1
  ('carline_first_day', '2026-08-10'),
  ('carline_last_day',  '2027-05-20')
on conflict (key) do nothing;

-- How a child joined the line: the parent tapped the button, or the app noticed them arrive.
alter table public.carline_pickups add column via text not null default 'app' check (via in ('app', 'arrival'));

/** The car line zone and hours, for the app's geofence and wording. */
create function public.carline_config() returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'latitude', app.setting('carline_latitude')::float8,
    'longitude', app.setting('carline_longitude')::float8,
    'radius', app.setting('carline_radius_m')::float8,
    'start', app.setting('carline_start'),
    'end', app.setting('carline_end'))
$$;

/**
 * Is automatic check-in open at a moment? {"state": "open"}, {"state": "early",
 * "opensAt": …} later on a school day, or {"state": "closed"}.
 */
create function app.carline_window(now_ts timestamptz default now()) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  local timestamp := now_ts at time zone 'America/Chicago';
  d date := local::date;
  t time := local::time;
  opens time := coalesce(app.setting('carline_start'), '14:45')::time;
  closes time := coalesce(app.setting('carline_end'), '15:30')::time;
begin
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

/**
 * The app noticed the parent arriving at the car line. While the line is open,
 * check in each of their children who isn't already waiting or picked up today,
 * and say who (for the "you're checked in" notification). Otherwise return the
 * window state so the app can remind them when it opens.
 */
create function public.carline_arrived() returns jsonb
language plpgsql security definer set search_path = public as $$
declare w jsonb := app.carline_window(); ids uuid[]; names text[];
begin
  if app.school_role() is null then raise exception 'Sign in to use the car line.' using errcode = '42501'; end if;
  if w->>'state' <> 'open' then return w; end if;
  with ins as (
    insert into carline_pickups (student_id, guardian_id, via)
      select g.student_id, auth.uid(), 'arrival' from guardians g
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

revoke all on function app.carline_window(timestamptz) from public, anon, authenticated;
revoke all on function public.carline_config(), public.carline_arrived() from public, anon;
grant execute on function public.carline_config(), public.carline_arrived() to authenticated, service_role;
