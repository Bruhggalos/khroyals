-- Car line (afternoon pickup).
--
-- A parent taps "I'm in the car line" for the children they're picking up; the
-- staff on car line duty see each arrival live and confirm when the child is in
-- the car. Office staff (people.family) choose who's on duty. Duty is not an
-- admin permission, so teachers can work the car line without the
-- authenticator-app step admin tools require.
--
-- Each check-in is one row per child, kept as the day's pickup record. The line
-- starts fresh every day (school days run on Central time).

alter table public.profiles add column carline_duty boolean not null default false;

create function app.school_today() returns date
language sql stable as $$ select (now() at time zone 'America/Chicago')::date $$;

create function app.is_guardian_of(s uuid, u uuid default auth.uid()) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from guardians where guardian_id = u and student_id = s)
$$;

/** On car line duty: flagged by the office and still a staff member. */
create function app.on_carline_duty(u uuid default auth.uid()) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select carline_duty and school_role in ('admin', 'teacher', 'staff') from profiles where id = u), false)
$$;

create table public.carline_pickups (
  id           uuid primary key default gen_random_uuid(),
  student_id   uuid not null references public.profiles (id) on delete cascade,
  guardian_id  uuid references public.profiles (id) on delete set null,   -- who checked in
  day          date not null default app.school_today(),
  status       text not null default 'waiting' check (status in ('waiting', 'picked_up', 'cancelled')),
  arrived_at   timestamptz not null default now(),
  picked_up_at timestamptz,
  picked_up_by uuid references public.profiles (id) on delete set null
);
-- A child waits in the line at most once at a time.
create unique index carline_one_waiting on public.carline_pickups (student_id, day) where status = 'waiting';
create index on public.carline_pickups (day, status);
alter table public.carline_pickups enable row level security;

create policy "car line: your children, or staff on duty" on public.carline_pickups for select to authenticated
  using (app.is_guardian_of(student_id) or app.on_carline_duty());

/** Today's car line: your children's check-ins, or everyone's for staff on duty. */
create function public.carline_today() returns setof public.carline_pickups
language sql stable security invoker set search_path = public as $$
  select * from carline_pickups where day = app.school_today() order by arrived_at
$$;

/** A parent is in the car line for some of their children (all of them when p_students is null). */
create function public.carline_check_in(p_students uuid[] default null) returns setof public.carline_pickups
language plpgsql security definer set search_path = public as $$
declare kids uuid[];
begin
  if app.school_role() is null then raise exception 'Sign in to use the car line.' using errcode = '42501'; end if;
  if p_students is not null and exists (select 1 from unnest(p_students) s where not app.is_guardian_of(s)) then
    raise exception 'You can only check in your own children.' using errcode = '42501';
  end if;
  kids := coalesce(p_students, array(select student_id from guardians where guardian_id = auth.uid()));
  if cardinality(kids) = 0 then raise exception 'No children are linked to your account yet.'; end if;
  insert into carline_pickups (student_id, guardian_id)
    select distinct k, auth.uid() from unnest(kids) k
    on conflict (student_id, day) where status = 'waiting' do nothing;
  return query select * from carline_pickups
    where student_id = any (kids) and day = app.school_today() and status = 'waiting' order by arrived_at;
end $$;

/** A parent takes back a check-in (tapped by mistake, or plans changed). */
create function public.carline_cancel(p_pickup uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  update carline_pickups set status = 'cancelled'
  where id = p_pickup and status = 'waiting' and app.is_guardian_of(student_id);
  if not found then raise exception 'That check-in can''t be cancelled.' using errcode = '42501'; end if;
end $$;

/** Staff on duty confirm the child is in the car. */
create function public.carline_confirm(p_pickup uuid) returns public.carline_pickups
language plpgsql security definer set search_path = public as $$
declare r carline_pickups%rowtype;
begin
  if not app.on_carline_duty() then
    raise exception 'Only staff on car line duty can confirm pickups.' using errcode = '42501';
  end if;
  update carline_pickups set status = 'picked_up', picked_up_at = now(), picked_up_by = auth.uid()
  where id = p_pickup and status = 'waiting' returning * into r;
  if not found then raise exception 'That child isn''t waiting in the car line.'; end if;
  return r;
end $$;

/** Staff on duty undo a pickup confirmed by mistake today; the child is waiting again. */
create function public.carline_reopen(p_pickup uuid) returns public.carline_pickups
language plpgsql security definer set search_path = public as $$
declare r carline_pickups%rowtype;
begin
  if not app.on_carline_duty() then
    raise exception 'Only staff on car line duty can change pickups.' using errcode = '42501';
  end if;
  update carline_pickups set status = 'waiting', picked_up_at = null, picked_up_by = null
  where id = p_pickup and status = 'picked_up' and day = app.school_today() returning * into r;
  if not found then raise exception 'Only today''s pickups can be undone.'; end if;
  return r;
exception when unique_violation then
  raise exception 'This child is already waiting in the car line again.';
end $$;

/** Office staff put a staff member on (or off) car line duty. */
create function public.admin_set_carline_duty(p_user uuid, p_on boolean) returns void
language plpgsql security definer set search_path = public as $$
begin
  perform app.require_permission('people.family');
  if p_on and not app.is_staff(p_user) then raise exception 'Only staff can be on car line duty.'; end if;
  update profiles set carline_duty = p_on where id = p_user;
  if not found then raise exception 'No such person.'; end if;
  perform app.audit(null, case when p_on then 'carline.duty_on' else 'carline.duty_off' end, p_user::text);
end $$;

-- The admin portal's people list shows who's on car line duty.
drop function public.admin_list_people();
create function public.admin_list_people() returns table (
  id uuid, first_name text, last_name text, school_role text, grade int, email text,
  admin_tier text, permissions text[], carline_duty boolean, created_at timestamptz
)
language plpgsql stable security definer set search_path = public as $$
begin
  perform app.require_permission('people.view');
  return query
    select p.id, p.first_name, p.last_name, p.school_role, p.grade, pp.email, p.admin_tier, p.permissions, p.carline_duty, p.created_at
    from profiles p left join profile_private pp on pp.id = p.id
    order by p.school_role nulls first, p.last_name, p.first_name;
end $$;

create or replace function public.permission_catalog() returns table (key text, label text, description text)
language sql immutable as $$
  values
    ('admins.manage',   'Manage admins',         'Make or remove admins, set tiers and grant permissions (director only).'),
    ('people.view',     'View people',           'See everyone''s contact email in the admin portal.'),
    ('people.approve',  'Approve sign-ups',      'Approve new accounts as parents or students.'),
    ('people.roles',    'Change roles',          'Set anyone''s school role, including teachers and staff.'),
    ('people.family',   'Families & rosters',    'Link parents to students, set grades, manage class/team rosters and car line duty.'),
    ('groups.manage',   'Manage all groups',     'Act as owner of every group: settings, members, moderation.'),
    ('calendar.school', 'School calendar',       'Add, change and remove school-wide calendar events.'),
    ('push.send',       'Send notifications',    'Send push notifications to everyone, a role or any group.'),
    ('audit.view',      'Activity log',          'Review the school-wide activity log.')
$$;

-- ======================================================================
-- Privileges
-- ======================================================================

revoke all on function app.school_today(), app.is_guardian_of(uuid, uuid), app.on_carline_duty(uuid) from public, anon;
grant execute on function app.school_today(), app.is_guardian_of(uuid, uuid), app.on_carline_duty(uuid) to authenticated, service_role;
revoke all on function public.carline_today(), public.carline_check_in(uuid[]), public.carline_cancel(uuid),
  public.carline_confirm(uuid), public.carline_reopen(uuid), public.admin_set_carline_duty(uuid, boolean),
  public.admin_list_people() from public, anon;
grant execute on function public.carline_today(), public.carline_check_in(uuid[]), public.carline_cancel(uuid),
  public.carline_confirm(uuid), public.carline_reopen(uuid), public.admin_set_carline_duty(uuid, boolean),
  public.admin_list_people() to authenticated, service_role;

-- Reads go through RLS; writes only through the functions above.
revoke all on public.carline_pickups from anon;
revoke insert, update, delete on public.carline_pickups from authenticated;
grant select on public.carline_pickups to authenticated;
grant all on public.carline_pickups to service_role;

alter publication supabase_realtime add table public.carline_pickups;
