-- ======================================================================
-- Family accounts (grandparents, aunts, a regular sitter): a school role for
-- adults who pick children up but aren't their parents.
--
-- Family members get the car line for the children the office links to them,
-- the school calendar, Activities (browse and follow), the Handbook, and
-- Volunteer (including its chat). They get no Royals Connect groups, no Student
-- app details, no Marketplace and no Ask the School.
--
-- Their links live in family_pickups, not guardians, so nothing that checks
-- guardians (sign-ups, child details, family requests, group rules) opens up to
-- them; only the car line reads both.
-- ======================================================================

alter table public.profiles drop constraint if exists profiles_school_role_check;
alter table public.profiles add constraint profiles_school_role_check
  check (school_role in ('admin', 'teacher', 'staff', 'parent', 'student', 'family'));

create table public.family_pickups (
  family_id  uuid not null references public.profiles (id) on delete cascade,
  student_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (family_id, student_id)
);
alter table public.family_pickups enable row level security;
create policy "own pickup links, or staff" on public.family_pickups for select to authenticated
  using (family_id = auth.uid() or app.is_staff());
grant select on public.family_pickups to authenticated;
revoke insert, update, delete on public.family_pickups from anon, authenticated;
grant all on public.family_pickups to service_role;

create function app.is_family(u uuid default auth.uid()) returns boolean
language sql stable as $$ select coalesce(app.school_role(u) = 'family', false) $$;

/** Children someone may pick up: a parent's own, or the ones the office linked to a Family account. */
create function app.pickup_children(u uuid default auth.uid()) returns setof uuid
language sql stable security definer set search_path = public as $$
  select student_id from guardians where guardian_id = u and not app.is_family(u)
  union
  select student_id from family_pickups where family_id = u and app.is_family(u)
$$;

create function app.can_pick_up(s uuid, u uuid default auth.uid()) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from app.pickup_children(u) k where k = s)
$$;

/** Parent links never count for a Family account (sign-ups, child details, requests). */
create or replace function app.is_guardian_of(s uuid, u uuid default auth.uid()) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from guardians where guardian_id = u and student_id = s) and not app.is_family(u)
$$;

-- ----------------------------------------------------------------------
-- Royals Connect: Family accounts aren't in any group
-- ----------------------------------------------------------------------

create or replace function app.effective_role(g uuid, u uuid default auth.uid()) returns text
language plpgsql stable security definer set search_path = public as $$
declare sr text; r text; vis text;
begin
  sr := app.school_role(u);
  if sr is null or sr = 'family' then return null; end if;  -- signed out, awaiting approval, or a Family account
  if app.has_permission('groups.manage', u) then return 'owner'; end if;
  select role into r from memberships where group_id = g and user_id = u;
  if r is not null then return r; end if;
  select settings->>'visibility' into vis from groups where id = g;
  if vis in ('public', 'school') then return 'subscriber'; end if;
  return null;
end $$;

drop policy "discoverable groups" on public.groups;
create policy "discoverable groups" on public.groups for select to authenticated
  using (app.is_admin()
         or (app.school_role() is not null and not app.is_family() and settings->>'visibility' <> 'hidden')
         or app.is_member(id));

drop policy "approved users" on public.rosters;
create policy "approved users" on public.rosters for select to authenticated
  using (app.school_role() is not null and not app.is_family());

create or replace function public.join_group(p_group uuid) returns void
language plpgsql security definer set search_path = public as $$
declare s jsonb;
begin
  if app.is_family() then raise exception 'Groups aren''t part of Family accounts.' using errcode = '42501'; end if;
  select settings into s from groups where id = p_group;
  if app.school_role() is null or s is null or s->>'joinPolicy' <> 'open' or s->>'visibility' = 'hidden' then
    raise exception 'This group is not open to join.' using errcode = '42501';
  end if;
  insert into memberships (group_id, user_id, role, source)
  values (p_group, auth.uid(), case when s->>'mode' = 'broadcast' then 'subscriber' else 'member' end, 'self')
  on conflict do nothing;
end $$;

create or replace function app.rule_targets(g uuid) returns table (user_id uuid, role text, rule_id uuid)
language sql stable security definer set search_path = public as $$
  with matched as (
    select r.id as rule_id, p.id as user_id, r.assign_as as role
    from assignment_rules r
    join profiles p on p.school_role is not null and p.school_role <> 'family'
    where r.group_id = g
      and (r.school_roles is null or p.school_role = any (r.school_roles))
      and (r.grades is null or p.grade = any (r.grades))
      and (r.roster_ids is null or exists (
            select 1 from roster_members rm where rm.profile_id = p.id and rm.roster_id = any (r.roster_ids)))
  ), everyone as (
    select rule_id, user_id, role from matched
    union all
    select m.rule_id, gd.guardian_id, r.include_guardians_as
    from matched m
    join assignment_rules r on r.id = m.rule_id and r.include_guardians_as is not null
    join guardians gd on gd.student_id = m.user_id
  )
  select distinct on (user_id) user_id, role, rule_id
  from everyone order by user_id, app.role_rank(role), rule_id
$$;

/** Whatever path adds a member (joining, an invite, an admin, a rule), a Family account is refused. */
create function app.no_family_in_groups() returns trigger
language plpgsql as $$
begin
  if app.is_family(new.user_id) then raise exception 'Groups aren''t part of Family accounts.' using errcode = '42501'; end if;
  return new;
end $$;
create trigger no_family_in_groups before insert or update of user_id on public.memberships
  for each row execute function app.no_family_in_groups();

-- ----------------------------------------------------------------------
-- What Family accounts can and can't do elsewhere
-- ----------------------------------------------------------------------

create or replace function app.can_volunteer(u uuid default auth.uid()) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(app.school_role(u) in ('parent', 'teacher', 'staff', 'admin', 'family'), false)
$$;

/** Family accounts volunteer, but Volunteer Leaders stay parents and staff. */
create or replace function app.is_volunteer_lead(u uuid default auth.uid()) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select volunteer_lead from profiles where id = u), false) and app.can_volunteer(u) and not app.is_family(u)
$$;

create or replace function public.admin_set_volunteer_lead(p_user uuid, p_on boolean) returns void
language plpgsql security definer set search_path = public as $$
begin
  perform app.require_permission('people.family');
  if p_on and (not app.can_volunteer(p_user) or app.is_family(p_user)) then
    raise exception 'Volunteer Leaders must be parents or staff.';
  end if;
  update profiles set volunteer_lead = p_on where id = p_user;
  if not found then raise exception 'No such person.'; end if;
  perform app.audit(null, case when p_on then 'volunteer.lead_on' else 'volunteer.lead_off' end, p_user::text);
end $$;

create or replace function public.ask_school(p_topic text, p_subject text, p_body text) returns public.school_questions
language plpgsql security definer set search_path = public as $$
declare q school_questions%rowtype; r uuid;
begin
  if app.school_role() is null then raise exception 'Sign in with an approved account to ask the school.' using errcode = '42501'; end if;
  if app.is_family() then raise exception 'Ask the School isn''t part of Family accounts.' using errcode = '42501'; end if;
  insert into school_questions (asker_id, topic, subject) values (auth.uid(), coalesce(p_topic, 'Other'), trim(p_subject)) returning * into q;
  insert into school_question_messages (question_id, author_id, from_school, body) values (q.id, auth.uid(), false, trim(p_body));
  for r in select app.question_routers() loop
    perform app.question_note(r, '❓ New question: ' || q.subject, app.short_name(auth.uid()) || ' · ' || q.topic, q.id);
  end loop;
  return q;
end $$;

create or replace function public.request_child(p_first text, p_last text, p_grade int, p_birthday date default null, p_note text default null)
returns public.family_requests
language plpgsql security definer set search_path = public as $$
declare row family_requests%rowtype;
begin
  if coalesce(app.school_role(), 'student') in ('student', 'family') then
    raise exception 'Only approved parents and staff can add children.' using errcode = '42501';
  end if;
  perform app.check_child_fields(p_first, p_last, p_grade);
  insert into family_requests (requested_by, kind, details)
  values (auth.uid(), 'add_child', jsonb_build_object('firstName', trim(p_first), 'lastName', trim(p_last), 'grade', p_grade,
                                                     'birthday', p_birthday, 'note', nullif(trim(p_note), '')))
  returning * into row;
  return row;
end $$;

-- ----------------------------------------------------------------------
-- Car line: parents and Family accounts pick up the children linked to them
-- ----------------------------------------------------------------------

drop policy "car line: your children, or staff" on public.carline_pickups;
create policy "car line: children you pick up, or staff" on public.carline_pickups for select to authenticated
  using (app.can_pick_up(student_id) or app.is_staff());

drop policy "staff and the child's parents" on public.pickup_numbers;
create policy "staff, and whoever picks the child up" on public.pickup_numbers for select to authenticated
  using (app.is_staff() or app.can_pick_up(student_id));

create or replace function public.carline_announce(p_students uuid[], p_lat float8, p_lng float8, p_accuracy float8 default null)
returns setof public.carline_pickups
language plpgsql security definer set search_path = public as $$
declare kids uuid[]; dist int;
begin
  if coalesce(app.school_role(), 'student') = 'student' then
    raise exception 'Only parents can announce pickup.' using errcode = '42501';
  end if;
  if p_students is not null and exists (select 1 from unnest(p_students) s where not app.can_pick_up(s)) then
    raise exception 'You can only announce your own children.' using errcode = '42501';
  end if;
  kids := coalesce(p_students, array(select * from app.pickup_children()));
  if cardinality(kids) = 0 then raise exception 'No children are linked to your account yet.'; end if;
  if app.carline_window()->>'state' = 'closed' then raise exception 'The car line is closed right now.'; end if;
  dist := app.require_at_school(p_lat, p_lng, p_accuracy);
  insert into carline_pickups (student_id, guardian_id, distance_m)
    select distinct k, auth.uid(), dist from unnest(kids) k
    on conflict (student_id, day) where status = 'waiting' do nothing;
  return query select * from carline_pickups
    where student_id = any (kids) and day = app.school_today() and status = 'waiting' order by arrived_at;
end $$;

create or replace function public.carline_arrived(p_lat float8, p_lng float8, p_accuracy float8 default null) returns jsonb
language plpgsql security definer set search_path = public as $$
declare w jsonb := app.carline_window(); ids uuid[]; names text[]; dist int;
begin
  if app.school_role() is null then raise exception 'Sign in to use the car line.' using errcode = '42501'; end if;
  if w->>'state' <> 'open' then return w; end if;
  dist := app.require_at_school(p_lat, p_lng, p_accuracy);
  with ins as (
    insert into carline_pickups (student_id, guardian_id, via, distance_m)
      select k.student_id, auth.uid(), 'arrival', dist from app.pickup_children() k(student_id)
      where not exists (select 1 from carline_pickups c where c.student_id = k.student_id
                          and c.day = app.school_today() and c.status in ('waiting', 'picked_up'))
    on conflict (student_id, day) where status = 'waiting' do nothing
    returning id, student_id
  )
  select array_agg(ins.id order by p.first_name), array_agg(p.first_name order by p.first_name)
    into ids, names from ins join profiles p on p.id = ins.student_id;
  return jsonb_build_object('state', 'open', 'checkedIn', coalesce(to_jsonb(ids), '[]'::jsonb),
                            'names', coalesce(to_jsonb(names), '[]'::jsonb));
end $$;

create or replace function public.carline_cancel(p_pickup uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  update carline_pickups set status = 'cancelled'
  where id = p_pickup and status = 'waiting' and app.can_pick_up(student_id);
  if not found then raise exception 'That check-in can''t be cancelled.' using errcode = '42501'; end if;
end $$;

create or replace function public.create_car_pass() returns text
language plpgsql security definer set search_path = public as $$
declare t text;
begin
  if app.school_role() is null then raise exception 'Sign in first.' using errcode = '42501'; end if;
  if not exists (select 1 from app.pickup_children()) then
    raise exception 'The car screen is for parents and family with children linked to their account.' using errcode = '42501';
  end if;
  delete from app.car_passes where last_used_at < now() - interval '90 days';
  -- Keep a handful of devices per person.
  delete from app.car_passes where token_hash in (
    select token_hash from app.car_passes where user_id = auth.uid() order by last_used_at desc offset 4);
  t := replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', '');
  insert into app.car_passes (token_hash, user_id) values (app.car_token_hash(t), auth.uid());
  return t;
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
      from app.pickup_children(u) k(student_id) join profiles p on p.id = k.student_id
      left join pickup_numbers n on n.student_id = p.id
      left join lateral (
        select * from carline_pickups x
        where x.student_id = k.student_id and x.day = app.school_today() and x.status in ('waiting', 'picked_up')
        order by (x.status = 'waiting') desc, x.arrived_at desc limit 1) c on true
      where p.school_role = 'student'), '[]'::jsonb));
end $$;

/** A parent's children with their details; a Family account gets only what the car line needs. */
create or replace function public.my_children() returns jsonb
language plpgsql security definer set search_path = public as $$
begin
  perform app.refresh_grades();
  if app.is_family() then
    return coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', p.id, 'firstName', p.first_name, 'lastName', p.last_name, 'grade', p.grade, 'gradeLabel', app.grade_label(p.grade),
        'classOf', p.class_of, 'pickupNumber', n.number, 'pickupOnly', true)
        order by p.first_name)
      from family_pickups f join profiles p on p.id = f.student_id left join pickup_numbers n on n.student_id = p.id
      where f.family_id = auth.uid() and p.school_role = 'student'), '[]'::jsonb);
  end if;
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

-- ----------------------------------------------------------------------
-- Admin portal: approve Family accounts and link them to children
-- ----------------------------------------------------------------------

create or replace function public.admin_update_profile(
  p_user uuid, p_role text, p_grade int default null, p_first text default null, p_last text default null
) returns void
language plpgsql security definer set search_path = public as $$
declare cur profiles%rowtype;
begin
  select * into cur from profiles where id = p_user;
  if not found then raise exception 'No such person.'; end if;
  if p_role is distinct from cur.school_role then
    if cur.admin_tier is not null or cur.school_role = 'admin' or p_role = 'admin' then
      perform app.require_permission('admins.manage');
    elsif cur.school_role is null and p_role in ('parent', 'student', 'family') then
      perform app.require_permission('people.approve');
    else
      perform app.require_permission('people.roles');
    end if;
    if cur.admin_tier = 'director' then raise exception 'Transfer the director role before changing the director''s access.'; end if;
  end if;
  if p_grade is distinct from cur.grade then perform app.require_permission('people.family'); end if;
  update profiles set school_role = p_role, grade = p_grade,
         first_name = coalesce(p_first, first_name), last_name = coalesce(p_last, last_name),
         -- Losing access, or becoming a student or Family account, also removes admin powers.
         admin_tier = case when p_role is null or p_role in ('parent', 'student', 'family') then null else admin_tier end,
         permissions = case when p_role is null or p_role = 'family' then '{}' else permissions end
   where id = p_user;
  if p_role = 'family' and cur.school_role is distinct from 'family' then
    -- Parent links become pickup links, and a Family account leaves every group.
    insert into family_pickups (family_id, student_id) select guardian_id, student_id from guardians where guardian_id = p_user
      on conflict do nothing;
    delete from guardians where guardian_id = p_user;
    delete from memberships where user_id = p_user;
  elsif cur.school_role = 'family' and p_role is not null and p_role <> 'family' then
    delete from family_pickups where family_id = p_user;  -- link them again as a parent if that's what they are
  end if;
  perform app.audit(null, 'profile.updated', p_user::text, jsonb_build_object('role', p_role, 'grade', p_grade));
end $$;

create or replace function public.admin_set_access(p_user uuid, p_tier text, p_permissions text[] default '{}') returns void
language plpgsql security definer set search_path = public as $$
declare cur profiles%rowtype; bad text;
begin
  perform app.require_permission('admins.manage');
  select * into cur from profiles where id = p_user;
  if not found then raise exception 'No such person.'; end if;
  if p_tier = 'director' or cur.admin_tier = 'director' then
    raise exception 'Use "Make director" / "Remove director" to change directors.';
  end if;
  if p_tier is not null and not exists (select 1 from admin_roles where id = p_tier) then
    raise exception 'That role no longer exists.';
  end if;
  if p_tier is not null and coalesce(cur.school_role, '') not in ('admin', 'teacher', 'staff') then
    raise exception 'Admin roles are for staff accounts. Change their school role to staff first.';
  end if;
  if cur.school_role is null or (cur.school_role in ('student', 'family') and cardinality(coalesce(p_permissions, '{}')) > 0) then
    raise exception 'Students, Family accounts and unapproved accounts can''t be given admin permissions.';
  end if;
  select x into bad from unnest(coalesce(p_permissions, '{}')) x
  where x = 'admins.manage' or x not in (select key from permission_catalog()) limit 1;
  if bad is not null then raise exception 'Permission "%" can''t be granted.', bad; end if;
  update profiles set admin_tier = p_tier, permissions = coalesce(p_permissions, '{}') where id = p_user;
  perform app.audit(null, 'access.updated', p_user::text, jsonb_build_object('role', p_tier, 'permissions', p_permissions));
end $$;

/** Link a parent to a student, or a Family account to a child they may pick up (people.family). */
create or replace function public.admin_link_guardian(p_guardian uuid, p_student uuid, p_link boolean default true) returns void
language plpgsql security definer set search_path = public as $$
begin
  perform app.require_permission('people.family');
  if p_link then
    if coalesce(app.school_role(p_student), '') <> 'student' then raise exception 'Children must be students at the school.'; end if;
    if coalesce(app.school_role(p_guardian), 'student') = 'student' then
      raise exception 'Parents and family must be approved adults (not students).';
    end if;
    if app.is_family(p_guardian) then
      insert into family_pickups (family_id, student_id) values (p_guardian, p_student) on conflict do nothing;
    else
      insert into guardians values (p_guardian, p_student) on conflict do nothing;
    end if;
  else
    delete from guardians where guardian_id = p_guardian and student_id = p_student;
    delete from family_pickups where family_id = p_guardian and student_id = p_student;
  end if;
  perform app.audit(null, case when p_link then 'family.linked' else 'family.unlinked' end, p_guardian::text,
                    jsonb_build_object('student', p_student, 'pickupOnly', app.is_family(p_guardian)));
end $$;

create or replace function public.admin_list_people(
  p_search text default null, p_filter text default 'all', p_limit int default 25, p_offset int default 0
) returns table (
  id uuid, first_name text, last_name text, school_role text, grade int, email text,
  admin_tier text, permissions text[], carline_duty boolean, volunteer_lead boolean, created_at timestamptz, total bigint
)
language plpgsql stable security definer set search_path = public as $$
declare term text := '%' || lower(coalesce(trim(p_search), '')) || '%';
begin
  perform app.require_permission('people.view');
  return query
    select p.id, p.first_name, p.last_name, p.school_role, p.grade, pp.email, p.admin_tier, p.permissions,
           p.carline_duty, p.volunteer_lead, p.created_at, count(*) over () as total
    from profiles p left join profile_private pp on pp.id = p.id
    where (lower(p.first_name || ' ' || p.last_name || ' ' || coalesce(pp.email, '')) like term)
      and case coalesce(p_filter, 'all')
            when 'pending'  then p.school_role is null
            when 'staff'    then p.school_role in ('admin', 'teacher', 'staff')
            when 'parents'  then p.school_role = 'parent'
            when 'family'   then p.school_role = 'family'
            when 'students' then p.school_role = 'student'
            when 'admins'   then p.admin_tier is not null or cardinality(p.permissions) > 0
            else true end
    order by (p.school_role is null) desc, (p.admin_tier = 'director') desc, p.last_name, p.first_name, p.id
    limit greatest(1, least(coalesce(p_limit, 25), 100)) offset greatest(0, coalesce(p_offset, 0));
end $$;

/** Students with the adults linked to them; Family accounts are marked `family`. */
create or replace function public.admin_list_students(p_search text default null, p_limit int default 25, p_offset int default 0)
returns table (id uuid, first_name text, last_name text, grade int, grade_label text, class_of int, managed boolean,
               photo_path text, parents jsonb, total bigint)
language plpgsql security definer set search_path = public as $$
declare term text := '%' || lower(coalesce(trim(p_search), '')) || '%';
begin
  perform app.require_permission('people.family');
  perform app.refresh_grades();
  return query
    select p.id, p.first_name, p.last_name, p.grade, app.grade_label(p.grade), p.class_of, p.managed, p.avatar_url,
           (select coalesce(jsonb_agg(jsonb_build_object('id', a.id, 'name', a.name, 'family', a.family) order by a.family, a.name), '[]'::jsonb)
            from (select q.id, trim(q.first_name || ' ' || q.last_name) as name, false as family
                    from guardians g join profiles q on q.id = g.guardian_id where g.student_id = p.id
                  union all
                  select q.id, trim(q.first_name || ' ' || q.last_name), true
                    from family_pickups f join profiles q on q.id = f.family_id where f.student_id = p.id) a),
           count(*) over ()
    from profiles p
    where p.school_role = 'student'
      and (lower(p.first_name || ' ' || p.last_name) like term
           or exists (select 1 from guardians g join profiles q on q.id = g.guardian_id
                      where g.student_id = p.id and lower(q.first_name || ' ' || q.last_name) like term)
           or exists (select 1 from family_pickups f join profiles q on q.id = f.family_id
                      where f.student_id = p.id and lower(q.first_name || ' ' || q.last_name) like term))
    order by p.grade nulls last, p.last_name, p.first_name, p.id
    limit greatest(1, least(coalesce(p_limit, 25), 100)) offset greatest(0, coalesce(p_offset, 0));
end $$;

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
    ('questions.manage', 'Route questions',       'See every question sent to the school, assign it to faculty or staff, and answer it.'),
    ('sports.manage',    'Manage activities',     'Add activities (sports, theater, music, art, clubs) and seasons, set schedules, assign coaches and directors, and approve sign-ups.'),
    ('audit.view',       'Activity log',          'Review the school-wide activity log.')
$$;
