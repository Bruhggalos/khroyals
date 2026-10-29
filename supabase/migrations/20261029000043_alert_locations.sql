-- Where people are when they answer a critical alert.
--
-- Teachers and staff agree once (the first time the app asks, after they sign in) to share
-- their location with critical alert answers (location_consents). From then on, when they tap
-- I'm safe or I need help, the phone sends where it is: GPS (with how accurate it is) and the
-- Wi-Fi access point it's connected to (its BSSID, the access point's MAC address). The Alert
-- map (alerts.map: directors, administrators and the IT role) lists the school's access points
-- and the room or area each one is in, so the senders' roll call can say "near Room 112".
--
-- Only the person and alerts.send holders see it (the existing policy on responses). It's
-- erased a set number of days after the alert's all clear (app.settings alert_location_days).
-- Nobody's location is ever read except at the moment they answer.

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
    ('alerts.map',       'Alert map',             'Keep the map of the school''s Wi-Fi access points (which room or area each one is in) that shows critical alert senders where people answered from.'),
    ('alerts.send',      'Send critical alerts',  'Send critical alerts (severe weather, an active threat, a dangerous situation) to every teacher and staff member, see who''s safe, and give the all clear.'),
    ('questions.manage', 'Route questions',       'See every question sent to the school, assign it to faculty or staff, and answer it.'),
    ('messages.review',  'Student messages',      'Read every Ask the Teacher conversation between students and teachers, for safety.'),
    ('sports.manage',    'Manage activities',     'Add activities (sports, theater, music, art, clubs) and seasons, set schedules, assign coaches and directors, and approve sign-ups.'),
    ('forms.send',       'Send forms',            'Send forms (permission slips, releases, acknowledgments) to any class, activity, grade or the whole school, and see every form''s signatures.'),
    ('people.delete',    'Delete accounts',       'Permanently delete someone''s account, with their posts and comments. Deleting an admin also needs Manage admins.'),
    ('gallery.manage',   'Manage photo gallery',  'Change or remove any photo album or photo, not just your own.'),
    ('feedback.triage',  'Triage feedback',       'See every bug report and feature request sent from the app, set its status and priority, reply, and plan student workshops from them.'),
    ('audit.view',       'Activity log',          'Review the school-wide activity log.')
$$;

update public.admin_roles set permissions = permissions || 'alerts.map'::text
where id in ('director', 'administrator', 'it') and not ('alerts.map' = any (permissions));

insert into app.settings values ('alert_location_days', '30') on conflict (key) do nothing;

-- ----------------------------------------------------------------------
-- Consent
-- ----------------------------------------------------------------------

create table public.location_consents (
  user_id     uuid primary key references public.profiles (id) on delete cascade,
  allowed     boolean not null,
  answered_at timestamptz not null default now()
);
alter table public.location_consents enable row level security;
create policy "your own" on public.location_consents for select to authenticated using (user_id = auth.uid());
grant select on public.location_consents to authenticated;
revoke insert, update, delete on public.location_consents from anon, authenticated;
grant all on public.location_consents to service_role;

/** Yes or no to sending your location with critical alert answers (staff; change it any time in My profile). */
create function public.alert_location_consent(p_allowed boolean) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not app.is_staff() then raise exception 'Critical alerts are for teachers and staff.' using errcode = '42501'; end if;
  if p_allowed is null then raise exception 'Choose yes or no.'; end if;
  insert into location_consents (user_id, allowed) values (auth.uid(), p_allowed)
  on conflict (user_id) do update set allowed = excluded.allowed, answered_at = now();
end $$;

-- ----------------------------------------------------------------------
-- The access point map
-- ----------------------------------------------------------------------

/** "AA-BB-CC-DD-EE-FF", "aabb.ccdd.eeff" or "aabbccddeeff" → "aa:bb:cc:dd:ee:ff"; null if it isn't a MAC address. */
create function app.normalize_mac(m text) returns text
language sql immutable as $$
  select case when x ~ '^[0-9a-f]{12}$'
    then substr(x, 1, 2) || ':' || substr(x, 3, 2) || ':' || substr(x, 5, 2) || ':' || substr(x, 7, 2) || ':' || substr(x, 9, 2) || ':' || substr(x, 11, 2)
  end
  from (select regexp_replace(lower(coalesce(m, '')), '[^0-9a-f]', '', 'g') as x) t
$$;

create table public.wifi_access_points (
  bssid      text primary key check (bssid ~ '^([0-9a-f]{2}:){5}[0-9a-f]{2}$'),
  place      text not null check (char_length(trim(place)) between 1 and 80),   -- "Room 112", "Gym"
  building   text not null default '' check (char_length(building) <= 80),
  floor      text not null default '' check (char_length(floor) <= 40),
  notes      text not null default '' check (char_length(notes) <= 200),
  updated_by uuid references public.profiles (id) on delete set null,
  updated_at timestamptz not null default now()
);
alter table public.wifi_access_points enable row level security;
create policy "the map's keepers and alert senders" on public.wifi_access_points for select to authenticated
  using (app.has_permission('alerts.map') or app.has_permission('alerts.send'));
grant select on public.wifi_access_points to authenticated;
revoke insert, update, delete on public.wifi_access_points from anon, authenticated;
grant all on public.wifi_access_points to service_role;

/**
 * Where an access point is: its row, or (one access point sends several BSSIDs, one per radio and
 * network, usually differing only in the last hex digit) the only mapped place whose BSSIDs match
 * all but that digit, marked `approx`. Null when it isn't on the map.
 */
create function app.ap_place(b text) returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(
    (select jsonb_build_object('place', place, 'building', building, 'floor', floor, 'approx', false)
     from wifi_access_points where bssid = app.normalize_mac(b)),
    (select jsonb_build_object('place', min(place), 'building', min(building), 'floor', min(floor), 'approx', true)
     from wifi_access_points where left(bssid, 16) = left(app.normalize_mac(b), 16)
     having count(distinct place || '|' || building || '|' || floor) = 1))
$$;

/** Add or change an access point (`p_old` renames one whose BSSID was typed wrong). */
create function public.wifi_ap_save(p_bssid text, p_place text, p_building text default '', p_floor text default '',
  p_notes text default '', p_old text default null) returns public.wifi_access_points
language plpgsql security definer set search_path = public as $$
declare row wifi_access_points%rowtype; b text := app.normalize_mac(p_bssid);
begin
  perform app.require_permission('alerts.map');
  if b is null then raise exception 'That isn''t a MAC address (like 3c:84:6a:12:34:56).'; end if;
  if trim(coalesce(p_place, '')) = '' then raise exception 'Say where it is, like Room 112.'; end if;
  if p_old is not null and app.normalize_mac(p_old) is distinct from b then
    delete from wifi_access_points where bssid = app.normalize_mac(p_old);
  end if;
  insert into wifi_access_points (bssid, place, building, floor, notes, updated_by)
  values (b, trim(p_place), trim(coalesce(p_building, '')), trim(coalesce(p_floor, '')), trim(coalesce(p_notes, '')), auth.uid())
  on conflict (bssid) do update set place = excluded.place, building = excluded.building, floor = excluded.floor,
    notes = excluded.notes, updated_by = excluded.updated_by, updated_at = now()
  returning * into row;
  return row;
end $$;

create function public.wifi_ap_delete(p_bssid text) returns void
language plpgsql security definer set search_path = public as $$
begin
  perform app.require_permission('alerts.map');
  delete from wifi_access_points where bssid = app.normalize_mac(p_bssid);
  if not found then raise exception 'That access point isn''t on the map.'; end if;
end $$;

/**
 * Add or update many at once, from the list IT exports: [{bssid, place, building?, floor?, notes?}].
 * Nothing is saved if any row is wrong; the error names the row. Returns how many were saved.
 */
create function public.wifi_ap_import(p_rows jsonb) returns int
language plpgsql security definer set search_path = public as $$
declare r jsonb; i int := 0;
begin
  perform app.require_permission('alerts.map');
  if jsonb_typeof(p_rows) is distinct from 'array' or jsonb_array_length(p_rows) = 0 then raise exception 'Paste at least one access point.'; end if;
  if jsonb_array_length(p_rows) > 2000 then raise exception 'Import up to 2000 access points at a time.'; end if;
  for r in select * from jsonb_array_elements(p_rows) loop
    i := i + 1;
    if app.normalize_mac(r->>'bssid') is null then raise exception 'Line %: "%" isn''t a MAC address.', i, coalesce(r->>'bssid', ''); end if;
    if trim(coalesce(r->>'place', '')) = '' then raise exception 'Line %: say where it is.', i; end if;
    if char_length(trim(r->>'place')) > 80 then raise exception 'Line %: keep the place to 80 characters.', i; end if;
    insert into wifi_access_points (bssid, place, building, floor, notes, updated_by)
    values (app.normalize_mac(r->>'bssid'), trim(r->>'place'), left(trim(coalesce(r->>'building', '')), 80),
            left(trim(coalesce(r->>'floor', '')), 40), left(trim(coalesce(r->>'notes', '')), 200), auth.uid())
    on conflict (bssid) do update set place = excluded.place, building = excluded.building, floor = excluded.floor,
      notes = excluded.notes, updated_by = excluded.updated_by, updated_at = now();
  end loop;
  perform app.audit(null, 'alerts.map_imported', null, jsonb_build_object('count', i));
  return i;
end $$;

-- ----------------------------------------------------------------------
-- Location with an answer
-- ----------------------------------------------------------------------

alter table public.critical_alert_responses
  add column lat            double precision check (lat between -90 and 90),
  add column lng            double precision check (lng between -180 and 180),
  add column accuracy_m     real check (accuracy_m >= 0),
  add column located_at     timestamptz,
  add column bssid          text check (bssid ~ '^([0-9a-f]{2}:){5}[0-9a-f]{2}$'),
  add column ssid           text check (char_length(ssid) <= 64),
  add column location_error text check (location_error in ('no_consent', 'denied', 'unavailable'));

/**
 * The phone sends where it is right after you answer (so the answer itself is never held up).
 * Saved only if you agreed to share it; `p_error` says why there's none ('denied': location is
 * off for the app; 'unavailable': no fix in time).
 */
create function public.critical_alert_share_location(p_alert uuid, p_lat double precision default null, p_lng double precision default null,
  p_accuracy real default null, p_located_at timestamptz default null, p_bssid text default null, p_ssid text default null,
  p_error text default null) returns void
language plpgsql security definer set search_path = public as $$
declare a critical_alerts%rowtype; ok boolean;
begin
  if not app.is_staff() then raise exception 'Critical alerts are for teachers and staff.' using errcode = '42501'; end if;
  select * into a from critical_alerts where id = p_alert;
  if not found then raise exception 'No such alert.'; end if;
  if a.ended_at is not null and a.ended_at < now() - interval '10 minutes' then raise exception 'This alert has ended.'; end if;
  if not exists (select 1 from critical_alert_responses where alert_id = a.id and user_id = auth.uid()) then
    raise exception 'Answer the alert first.';
  end if;
  ok := coalesce((select allowed from location_consents where user_id = auth.uid()), false);
  if p_error is not null and p_error not in ('denied', 'unavailable') then raise exception 'Unknown location error.'; end if;
  if (p_lat is null) <> (p_lng is null) then raise exception 'Send both latitude and longitude.'; end if;
  update critical_alert_responses set
    lat = case when ok then p_lat end, lng = case when ok then p_lng end,
    accuracy_m = case when ok and p_lat is not null then greatest(p_accuracy, 0) end,
    located_at = case when ok and (p_lat is not null or p_bssid is not null) then least(coalesce(p_located_at, now()), now()) end,
    bssid = case when ok then app.normalize_mac(p_bssid) end,
    ssid = case when ok then nullif(left(trim(coalesce(p_ssid, '')), 64), '') end,
    location_error = case when not ok then 'no_consent'
                          when p_lat is null and app.normalize_mac(p_bssid) is null then coalesce(p_error, 'unavailable') end
  where alert_id = a.id and user_id = auth.uid();
end $$;

/** The senders' roll call, now with each answer's location and the access point's place on the map. */
create or replace function public.critical_alert_status(p_alert uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  perform app.require_permission('alerts.send');
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', p.id, 'name', trim(p.first_name || ' ' || p.last_name), 'role', p.school_role,
      'status', coalesce(r.status, 'none'), 'note', r.note, 'updatedAt', r.updated_at,
      'lat', r.lat, 'lng', r.lng, 'accuracy', r.accuracy_m, 'locatedAt', r.located_at,
      'bssid', r.bssid, 'ssid', r.ssid, 'place', case when r.bssid is not null then app.ap_place(r.bssid) end,
      'locationError', r.location_error, 'consent', c.allowed)
      order by case coalesce(r.status, 'none') when 'help' then 0 when 'none' then 1 else 2 end, p.last_name, p.first_name)
    from profiles p
    left join critical_alert_responses r on r.alert_id = p_alert and r.user_id = p.id
    left join location_consents c on c.user_id = p.id
    where p.id in (select * from app.alert_staff())), '[]'::jsonb);
end $$;

/** Erase answers' locations once their alert has been over for alert_location_days (daily). */
create function app.purge_alert_locations() returns int
language plpgsql security definer set search_path = public as $$
declare n int;
begin
  update critical_alert_responses r set lat = null, lng = null, accuracy_m = null, located_at = null, bssid = null, ssid = null
  from critical_alerts a
  where a.id = r.alert_id and a.ended_at is not null
    and a.ended_at < now() - make_interval(days => coalesce(nullif(app.setting('alert_location_days'), '')::int, 30))
    and (r.lat is not null or r.bssid is not null);
  get diagnostics n = row_count;
  return n;
end $$;

do $$
begin
  if exists (select 1 from pg_available_extensions where name = 'pg_cron') then
    create extension if not exists pg_cron;
    perform cron.schedule('purge-alert-locations', '30 7 * * *', 'select app.purge_alert_locations()');
  end if;
exception when others then
  raise notice 'pg_cron not available: %', sqlerrm;
end $$;

revoke all on function public.alert_location_consent(boolean), public.wifi_ap_save(text, text, text, text, text, text),
  public.wifi_ap_delete(text), public.wifi_ap_import(jsonb),
  public.critical_alert_share_location(uuid, double precision, double precision, real, timestamptz, text, text, text),
  app.purge_alert_locations() from public, anon;
grant execute on function public.alert_location_consent(boolean), public.wifi_ap_save(text, text, text, text, text, text),
  public.wifi_ap_delete(text), public.wifi_ap_import(jsonb),
  public.critical_alert_share_location(uuid, double precision, double precision, real, timestamptz, text, text, text)
  to authenticated, service_role;
revoke all on function app.purge_alert_locations() from authenticated;
