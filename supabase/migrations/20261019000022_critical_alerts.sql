-- ======================================================================
-- Critical alerts for teachers and staff: severe weather, an active threat
-- (lockdown), a dangerous situation, or another urgent message from the
-- administration. Admins with "Send critical alerts" (alerts.send) send them
-- and mark them all clear; every teacher and staff member gets them and
-- answers I'm safe or I need help, and the senders watch the answers live.
-- Parents, students and Family accounts never see them.
--
-- Delivery: alerts always push, whatever someone's notification settings or
-- quiet hours. data.level tells the send-push function how loud to be:
-- 'critical' (rings on silent and Do Not Disturb) once Apple has granted the
-- Critical Alerts entitlement and app.settings critical_alerts = 'on';
-- 'time-sensitive' until then.
-- ======================================================================

insert into app.settings values ('critical_alerts', 'off') on conflict (key) do nothing;

create table public.critical_alerts (
  id         uuid primary key default gen_random_uuid(),
  kind       text not null check (kind in ('weather', 'threat', 'danger', 'other')),
  title      text not null check (char_length(trim(title)) between 1 and 120),
  body       text not null default '' check (char_length(body) <= 1000),
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  ended_at   timestamptz,
  ended_by   uuid references public.profiles (id) on delete set null,
  end_note   text check (char_length(end_note) <= 500)
);
create index critical_alerts_recent on public.critical_alerts (created_at desc);

create table public.critical_alert_responses (
  alert_id   uuid not null references public.critical_alerts (id) on delete cascade,
  user_id    uuid not null references public.profiles (id) on delete cascade,
  status     text not null check (status in ('safe', 'help')),
  note       text check (char_length(note) <= 300),
  updated_at timestamptz not null default now(),
  primary key (alert_id, user_id)
);

alter table public.critical_alerts enable row level security;
alter table public.critical_alert_responses enable row level security;
create policy "teachers and staff" on public.critical_alerts for select to authenticated using (app.is_staff());
create policy "your own answer, or the senders" on public.critical_alert_responses for select to authenticated
  using (user_id = auth.uid() or app.has_permission('alerts.send'));
grant select on public.critical_alerts, public.critical_alert_responses to authenticated;
revoke insert, update, delete on public.critical_alerts, public.critical_alert_responses from anon, authenticated;
grant all on public.critical_alerts, public.critical_alert_responses to service_role;
alter publication supabase_realtime add table public.critical_alerts, public.critical_alert_responses;

/** How loudly alert pushes ring: 'critical' once Apple's entitlement is in the app, else 'time-sensitive'. */
create function app.alert_level() returns text
language sql stable as $$ select case when app.setting('critical_alerts') = 'on' then 'critical' else 'time-sensitive' end $$;

create function app.alert_icon(kind text) returns text
language sql immutable as $$
  select case kind when 'weather' then '⛈️' when 'threat' then '🚨' when 'danger' then '⚠️' else '📣' end
$$;

/** Everyone a critical alert goes to. */
create function app.alert_staff() returns setof uuid
language sql stable security definer set search_path = public as $$
  select id from profiles where school_role in ('admin', 'teacher', 'staff')
$$;

-- Critical alert traffic always pushes: no setting or quiet hours holds it back.
create or replace function app.wants_push(n public.notifications, u uuid, at timestamptz default now()) returns boolean
language plpgsql stable security definer set search_path = public as $$
declare st user_settings%rowtype; t time;
begin
  if n.data ? 'alertId' then return true; end if;
  if n.audience in ('everyone', 'roles') and n.urgent then return true; end if;
  select * into st from user_settings where user_id = u;
  if not found then return true; end if;
  if n.audience in ('everyone', 'roles') and not st.push_school then return false; end if;
  if n.data ? 'reply' then
    if not st.push_replies then return false; end if;
  elsif n.audience = 'group' and not st.push_groups then return false;
  end if;
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

-- ----------------------------------------------------------------------
-- Sending, answering and ending an alert
-- ----------------------------------------------------------------------

create function public.critical_alert_send(p_kind text, p_title text, p_body text default '') returns public.critical_alerts
language plpgsql security definer set search_path = public as $$
declare a critical_alerts%rowtype;
begin
  perform app.require_permission('alerts.send');
  if p_kind is null or p_kind not in ('weather', 'threat', 'danger', 'other') then raise exception 'Pick what kind of alert this is.'; end if;
  if coalesce(trim(p_title), '') = '' then raise exception 'Add a short title.'; end if;
  if char_length(trim(p_title)) > 120 then raise exception 'Keep the title to 120 characters.'; end if;
  if char_length(coalesce(p_body, '')) > 1000 then raise exception 'Keep the message to 1,000 characters.'; end if;
  insert into critical_alerts (kind, title, body, created_by)
  values (p_kind, trim(p_title), coalesce(trim(p_body), ''), auth.uid()) returning * into a;
  insert into notifications (audience, roles, title, body, data, urgent, created_by)
  values ('roles', array['admin', 'teacher', 'staff'], app.alert_icon(a.kind) || ' ' || a.title,
          coalesce(nullif(a.body, ''), 'Open KH Royals for details.'),
          jsonb_build_object('alertId', a.id, 'kind', a.kind, 'critical', true, 'level', app.alert_level()), true, auth.uid());
  perform app.audit(null, 'alert.sent', a.id::text, jsonb_build_object('kind', a.kind, 'title', a.title));
  return a;
end $$;

/** A teacher or staff member answers: safe, or needs help (the senders are told at once). */
create function public.critical_alert_respond(p_alert uuid, p_status text, p_note text default null)
returns public.critical_alert_responses
language plpgsql security definer set search_path = public as $$
declare a critical_alerts%rowtype; r critical_alert_responses%rowtype; u uuid;
begin
  if not app.is_staff() then raise exception 'Critical alerts are for teachers and staff.' using errcode = '42501'; end if;
  select * into a from critical_alerts where id = p_alert;
  if not found then raise exception 'No such alert.'; end if;
  if a.ended_at is not null then raise exception 'This alert has ended.'; end if;
  if p_status is null or p_status not in ('safe', 'help') then raise exception 'Choose I''m safe or I need help.'; end if;
  if char_length(coalesce(p_note, '')) > 300 then raise exception 'Keep the note to 300 characters.'; end if;
  insert into critical_alert_responses (alert_id, user_id, status, note)
  values (a.id, auth.uid(), p_status, nullif(trim(p_note), ''))
  on conflict (alert_id, user_id) do update set status = excluded.status, note = excluded.note, updated_at = now()
  returning * into r;
  if p_status = 'help' then
    for u in select id from profiles
             where school_role is not null and id <> auth.uid() and ('alerts.send' = any (app.permissions(id)) or id = a.created_by) loop
      perform app.notify_user(u, '🆘 ' || app.short_name(auth.uid()) || ' needs help', coalesce(r.note, a.title),
        jsonb_build_object('alertId', a.id, 'kind', a.kind, 'critical', true, 'level', app.alert_level()));
    end loop;
  end if;
  return r;
end $$;

create function public.critical_alert_end(p_alert uuid, p_note text default null) returns public.critical_alerts
language plpgsql security definer set search_path = public as $$
declare a critical_alerts%rowtype;
begin
  perform app.require_permission('alerts.send');
  if char_length(coalesce(p_note, '')) > 500 then raise exception 'Keep the note to 500 characters.'; end if;
  update critical_alerts set ended_at = now(), ended_by = auth.uid(), end_note = nullif(trim(p_note), '')
   where id = p_alert and ended_at is null returning * into a;
  if not found then raise exception 'This alert has already ended.'; end if;
  insert into notifications (audience, roles, title, body, data, urgent, created_by)
  values ('roles', array['admin', 'teacher', 'staff'], '✅ All clear: ' || a.title, coalesce(a.end_note, 'The alert is over.'),
          jsonb_build_object('alertId', a.id, 'kind', a.kind, 'level', 'time-sensitive'), true, auth.uid());
  perform app.audit(null, 'alert.ended', a.id::text, jsonb_build_object('title', a.title));
  return a;
end $$;

/** For the senders: every teacher and staff member with their answer ('help', 'none' or 'safe'), most urgent first. */
create function public.critical_alert_status(p_alert uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  perform app.require_permission('alerts.send');
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', p.id, 'name', trim(p.first_name || ' ' || p.last_name), 'role', p.school_role,
      'status', coalesce(r.status, 'none'), 'note', r.note, 'updatedAt', r.updated_at)
      order by case coalesce(r.status, 'none') when 'help' then 0 when 'none' then 1 else 2 end, p.last_name, p.first_name)
    from profiles p
    left join critical_alert_responses r on r.alert_id = p_alert and r.user_id = p.id
    where p.id in (select * from app.alert_staff())), '[]'::jsonb);
end $$;

-- ----------------------------------------------------------------------
-- The new admin power
-- ----------------------------------------------------------------------

create or replace function public.permission_catalog() returns table (key text, label text, description text)
language sql immutable as $$
  values
    ('admins.manage',    'Manage admins',         'Make or remove admins, set tiers and grant permissions (director only).'),
    ('people.view',      'View people',           'See everyone''s contact email in the admin portal.'),
    ('people.approve',   'Approve sign-ups',      'Approve new accounts as parents, students or family.'),
    ('people.roles',     'Change roles',          'Set anyone''s school role, including teachers and staff.'),
    ('people.family',    'Families & rosters',    'Link parents and family to students, set grades, manage class/team rosters and car line duty.'),
    ('groups.manage',    'Manage all groups',     'Act as owner of every group: settings, members, moderation.'),
    ('calendar.school',  'School calendar',       'Add, change and remove school-wide calendar events.'),
    ('push.send',        'Send notifications',    'Send push notifications to everyone, a role or any group.'),
    ('alerts.send',      'Send critical alerts',  'Send critical alerts (severe weather, an active threat, a dangerous situation) to every teacher and staff member, see who''s safe, and give the all clear.'),
    ('questions.manage', 'Route questions',       'See every question sent to the school, assign it to faculty or staff, and answer it.'),
    ('sports.manage',    'Manage activities',     'Add activities (sports, theater, music, art, clubs) and seasons, set schedules, assign coaches and directors, and approve sign-ups.'),
    ('audit.view',       'Activity log',          'Review the school-wide activity log.')
$$;

update public.admin_roles set permissions = permissions || 'alerts.send'::text
where id in ('director', 'administrator', 'office') and not ('alerts.send' = any (permissions));

revoke all on function app.alert_staff() from public, anon, authenticated;
revoke all on function public.critical_alert_send(text, text, text), public.critical_alert_respond(uuid, text, text),
  public.critical_alert_end(uuid, text), public.critical_alert_status(uuid) from public, anon;
grant execute on function public.critical_alert_send(text, text, text), public.critical_alert_respond(uuid, text, text),
  public.critical_alert_end(uuid, text), public.critical_alert_status(uuid) to authenticated, service_role;
