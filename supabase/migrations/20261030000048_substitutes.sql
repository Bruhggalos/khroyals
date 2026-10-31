-- Substitutes: a school role for people who cover a teacher's classes while the teacher is away.
--
-- A Substitute account is closed by default: no groups, rosters, photo gallery, Ask the School,
-- children, Marketplace or Volunteer (those either list the roles they're for or are closed below),
-- and never any admin powers. Everything else comes from the sub schedule (sub_assignments): a
-- teacher schedules a sub for the class sections they lead, and subs.manage holders (the office,
-- administrators and directors; an admin power) for any section, with the days, the hours and the
-- teacher's sub plans. Only while a duty window is running (app.duty_now: between its first and last
-- day, between its hours on the school's clock) does the sub take that class's roll (today's only),
-- see the office's check-ins and get their notifications, read the sub plans, run field trip check-out
-- lists from its students (today's), see the car line board, and get and answer critical alerts.
-- Outside it they see which classes they're due to cover and when, nothing more. A teacher or staff
-- member can also be scheduled to cover a class; they get the same class tools for its duty window.

alter table public.profiles drop constraint if exists profiles_school_role_check;
alter table public.profiles add constraint profiles_school_role_check
  check (school_role in ('admin', 'teacher', 'staff', 'parent', 'student', 'family', 'substitute'));

create function app.is_substitute(u uuid default auth.uid()) returns boolean
language sql stable as $$ select coalesce(app.school_role(u) = 'substitute', false) $$;

/** Substitutes hold no admin powers: becoming one drops them, and granting them is refused. */
create function app.substitute_profile() returns trigger
language plpgsql as $$
begin
  if new.school_role = 'substitute' then
    if tg_op = 'UPDATE' and old.school_role is distinct from 'substitute' then
      new.admin_tier := null;
      new.permissions := '{}';
    elsif new.admin_tier is not null or cardinality(coalesce(new.permissions, '{}')) > 0 then
      raise exception 'Substitutes can''t have admin powers.' using errcode = '42501';
    end if;
  end if;
  return new;
end $$;
create trigger substitute_profile before insert or update of school_role, admin_tier, permissions on public.profiles
  for each row execute function app.substitute_profile();

/** Becoming a Substitute leaves every group. */
create function app.substitute_leaves_groups() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  delete from memberships where user_id = new.id;
  return null;
end $$;
create trigger substitute_leaves_groups after update of school_role on public.profiles
  for each row when (new.school_role = 'substitute' and old.school_role is distinct from 'substitute')
  execute function app.substitute_leaves_groups();

-- ----------------------------------------------------------------------
-- Closed by default: groups, rosters, the photo gallery, Ask the School, children
-- ----------------------------------------------------------------------

create or replace function app.effective_role(g uuid, u uuid default auth.uid()) returns text
language plpgsql stable security definer set search_path = public as $$
declare sr text; r text; vis text;
begin
  sr := app.school_role(u);
  if sr is null or sr in ('family', 'substitute') then return null; end if;  -- signed out, awaiting approval, Family or Substitute
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
         or (app.school_role() is not null and not app.is_family() and not app.is_substitute() and settings->>'visibility' <> 'hidden')
         or app.is_member(id));

drop policy "approved users" on public.rosters;
create policy "approved users" on public.rosters for select to authenticated
  using (app.school_role() is not null and not app.is_family() and not app.is_substitute());

create or replace function app.rule_targets(g uuid) returns table (user_id uuid, role text, rule_id uuid)
language sql stable security definer set search_path = public as $$
  with matched as (
    select r.id as rule_id, p.id as user_id, r.assign_as as role
    from assignment_rules r
    join profiles p on p.school_role is not null and p.school_role not in ('family', 'substitute')
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

/** Whatever path adds a member (joining, an invite, an admin, a rule), Family and Substitute accounts are refused. */
create or replace function app.no_family_in_groups() returns trigger
language plpgsql as $$
begin
  if app.is_family(new.user_id) then raise exception 'Groups aren''t part of Family accounts.' using errcode = '42501'; end if;
  if app.is_substitute(new.user_id) then raise exception 'Groups aren''t part of Substitute accounts.' using errcode = '42501'; end if;
  return new;
end $$;

create or replace function public.ask_school(p_topic text, p_subject text, p_body text) returns public.school_questions
language plpgsql security definer set search_path = public as $$
declare q school_questions%rowtype; r uuid;
begin
  if app.school_role() is null then raise exception 'Sign in with an approved account to ask the school.' using errcode = '42501'; end if;
  if app.is_family() then raise exception 'Ask the School isn''t part of Family accounts.' using errcode = '42501'; end if;
  if app.is_substitute() then raise exception 'Ask the School isn''t part of Substitute accounts.' using errcode = '42501'; end if;
  insert into school_questions (asker_id, topic, subject) values (auth.uid(), coalesce(p_topic, 'Other'), trim(p_subject)) returning * into q;
  insert into school_question_messages (question_id, author_id, from_school, body) values (q.id, auth.uid(), false, trim(p_body));
  for r in select app.question_routers() loop
    perform app.question_note(r, '❓ New question: ' || q.subject, app.short_name(auth.uid()) || ' · ' || q.topic, q.id);
  end loop;
  return q;
end $$;

create or replace function public.request_child(p_first text, p_last text, p_grade int, p_birthday date default null, p_note text default null,
                                                p_relation text default null)
returns public.family_requests
language plpgsql security definer set search_path = public as $$
declare row family_requests%rowtype; mine text;
begin
  if coalesce(app.school_role(), 'student') in ('student', 'family', 'substitute') then
    raise exception 'Only approved parents and staff can add children.' using errcode = '42501';
  end if;
  perform app.check_child_fields(p_first, p_last, p_grade);
  if p_relation is null or p_relation not in ('mother', 'father') then raise exception 'Say whether you''re the mother or the father.'; end if;
  -- Already yours?
  select trim(p.first_name) into mine from guardians g join profiles p on p.id = g.student_id left join student_details d on d.student_id = p.id
  where g.guardian_id = auth.uid()
    and app.child_match_score(p.first_name, p.last_name, d.birthday, p.grade, p_first, p_last, p_birthday, p_grade) >= 6
  limit 1;
  if mine is not null then raise exception '% is already linked to your account.', mine; end if;
  -- Already asked?
  if exists (select 1 from family_requests where requested_by = auth.uid() and kind = 'add_child' and status = 'pending'
             and app.norm_name(details->>'firstName') = app.norm_name(p_first) and app.norm_name(details->>'lastName') = app.norm_name(p_last)) then
    raise exception 'You already asked to add %. The office will get back to you.', trim(p_first);
  end if;
  insert into family_requests (requested_by, kind, details)
  values (auth.uid(), 'add_child', jsonb_build_object('firstName', trim(p_first), 'lastName', trim(p_last), 'grade', p_grade,
                                                     'birthday', p_birthday, 'note', nullif(trim(p_note), ''), 'relation', p_relation))
  returning * into row;
  return row;
end $$;

/** Can this person see this album? Everyone approved (not Substitutes) for "everyone" albums; staff for all. */
create or replace function app.sees_album(a uuid, u uuid default auth.uid()) returns boolean
language sql stable security definer set search_path = public as $$
  select app.school_role(u) is not null and not app.is_substitute(u)
     and exists (select 1 from gallery_albums where id = a and (visibility = 'everyone' or app.is_staff(u)))
$$;

drop policy "approved accounts see the categories" on public.gallery_categories;
create policy "approved accounts see the categories" on public.gallery_categories for select to authenticated
  using (app.school_role() is not null and not app.is_substitute());
drop policy "everyone approved, or staff for staff-only albums" on public.gallery_albums;
create policy "everyone approved, or staff for staff-only albums" on public.gallery_albums for select to authenticated
  using (app.school_role() is not null and not app.is_substitute() and (visibility = 'everyone' or app.is_staff()));
drop policy "gallery: photos of albums you can see" on storage.objects;
create policy "gallery: photos of albums you can see" on storage.objects for select to authenticated
  using (bucket_id = 'gallery' and app.school_role() is not null and not app.is_substitute() and (app.is_staff() or exists (
    select 1 from public.gallery_photos p
    where p.path = regexp_replace(objects.name, '_t\.jpg$', '.jpg') and app.sees_album(p.album_id))));

-- ----------------------------------------------------------------------
-- The sub schedule
-- ----------------------------------------------------------------------

create or replace function public.permission_catalog() returns table (key text, label text, description text)
language sql immutable as $$
  values
    ('admins.manage',    'Manage admins',         'Make or remove admins, set tiers and grant permissions (director only).'),
    ('people.view',      'View people',           'See everyone''s contact email in the admin portal.'),
    ('people.approve',   'Approve sign-ups',      'Approve new accounts as parents, students or family.'),
    ('people.roles',     'Change roles',          'Set anyone''s school role, including teachers, staff and substitutes.'),
    ('people.family',    'Families & rosters',    'Link parents and family to students, set grades, manage classes, class/team rosters and car line duty.'),
    ('groups.manage',    'Manage all groups',     'Act as owner of every group: settings, members, moderation.'),
    ('calendar.school',  'School calendar',       'Add, change and remove school-wide calendar events.'),
    ('push.send',        'Send notifications',    'Send push notifications to everyone, a role or any group.'),
    ('checkin.manage',   'Check in & out',        'Check students in when they arrive late and out when they leave early (only to someone on their pickup list), see the day''s check-ins, and run any event check-out list.'),
    ('subs.manage',      'Schedule substitutes',  'Schedule a substitute for any class, with the days, hours and sub plans, and change or cancel any sub day.'),
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

update public.admin_roles set permissions = permissions || 'subs.manage'::text
where id in ('director', 'administrator', 'office') and not ('subs.manage' = any (permissions));

create table public.sub_assignments (
  id            uuid primary key default gen_random_uuid(),
  substitute_id uuid not null references public.profiles (id) on delete cascade,
  starts_on     date not null,
  ends_on       date not null,
  start_time    time not null,
  end_time      time not null,
  plans         text not null default '' check (char_length(plans) <= 4000),
  created_by    uuid references public.profiles (id) on delete set null,
  created_at    timestamptz not null default now(),
  check (ends_on >= starts_on),
  check (end_time > start_time)
);
create index on public.sub_assignments (substitute_id, ends_on);

create table public.sub_assignment_sections (
  assignment_id uuid not null references public.sub_assignments (id) on delete cascade,
  section_id    text not null references public.rosters (id) on delete cascade,
  primary key (assignment_id, section_id)
);
create index on public.sub_assignment_sections (section_id);

/** Is a duty window running: between its first and last day, between its hours, on the school's clock (Central time). */
create function app.duty_now(d1 date, d2 date, t1 time, t2 time, p_at timestamptz default now()) returns boolean
language sql stable as $$
  select (p_at at time zone 'America/Chicago')::date between d1 and d2
     and (p_at at time zone 'America/Chicago')::time >= t1 and (p_at at time zone 'America/Chicago')::time < t2
$$;

/** Is this person covering this class section right now? Substitutes, teachers and staff only. */
create function app.on_duty_for(sec text, u uuid default auth.uid()) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(app.school_role(u) in ('substitute', 'teacher', 'staff', 'admin'), false) and exists (
    select 1 from sub_assignments a join sub_assignment_sections s on s.assignment_id = a.id
    where a.substitute_id = u and s.section_id = sec and app.duty_now(a.starts_on, a.ends_on, a.start_time, a.end_time))
$$;

/** Is this person covering any class right now? */
create function app.on_duty(u uuid default auth.uid()) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(app.school_role(u) in ('substitute', 'teacher', 'staff', 'admin'), false) and exists (
    select 1 from sub_assignments a join sub_assignment_sections s on s.assignment_id = a.id
    where a.substitute_id = u and app.duty_now(a.starts_on, a.ends_on, a.start_time, a.end_time))
$$;

/** May this person schedule a sub for this section: its lead teacher, or subs.manage. */
create function app.schedules_for(sec text, u uuid default auth.uid()) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from rosters r where r.id = sec and r.kind = 'section'
    and ((r.lead_id = u and app.is_staff(u)) or app.has_permission('subs.manage', u)))
$$;

/** Who sees and changes a sub day: whoever scheduled it (staff), the teacher of one of its classes, and subs.manage. Not the sub. */
create function app.manages_sub(a uuid, u uuid default auth.uid()) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from sub_assignments x where x.id = a and (
    app.has_permission('subs.manage', u)
    or (app.is_staff(u) and (x.created_by = u or exists (
      select 1 from sub_assignment_sections s join rosters r on r.id = s.section_id where s.assignment_id = x.id and r.lead_id = u)))))
$$;

alter table public.sub_assignments enable row level security;
alter table public.sub_assignment_sections enable row level security;
create policy "whoever scheduled it, the class's teacher, and the office" on public.sub_assignments for select to authenticated
  using (app.manages_sub(id));
create policy "whoever scheduled it, the class's teacher, and the office" on public.sub_assignment_sections for select to authenticated
  using (app.manages_sub(assignment_id));

/** "Mon, Nov 2 · 7:30 AM–3:30 PM", or "Nov 2–4 · 7:30 AM–3:30 PM". */
create function app.sub_when(d1 date, d2 date, t1 time, t2 time) returns text
language sql stable as $$
  select case when d1 = d2 then to_char(d1, 'Dy, Mon FMDD') else to_char(d1, 'Mon FMDD') || '–' || to_char(d2, 'Mon FMDD') end
    || ' · ' || to_char(d1 + t1, 'FMHH12:MI AM') || '–' || to_char(d1 + t2, 'FMHH12:MI AM')
$$;

/** "English 10 – Period 3, Math 7". */
create function app.sub_classes(a uuid) returns text
language sql stable security definer set search_path = public as $$
  select coalesce(string_agg(r.name, ', ' order by r.name), 'a class')
  from sub_assignment_sections s join rosters r on r.id = s.section_id where s.assignment_id = a
$$;

/** A sub day as the app shows it; the sub plans only when `with_plans`. */
create function app.sub_json(a uuid, with_plans boolean) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object('id', x.id, 'substituteId', x.substitute_id, 'substitute', app.checkin_name(x.substitute_id),
      'startsOn', x.starts_on, 'endsOn', x.ends_on, 'startTime', left(x.start_time::text, 5), 'endTime', left(x.end_time::text, 5),
      'onDuty', app.duty_now(x.starts_on, x.ends_on, x.start_time, x.end_time),
      'plans', case when with_plans then x.plans end,
      'scheduledBy', case when x.created_by is not null then app.checkin_name(x.created_by) end,
      'classes', coalesce((select jsonb_agg(jsonb_build_object('id', r.id, 'name', r.name,
          'teacher', case when r.lead_id is not null then app.checkin_name(r.lead_id) end) order by r.name)
        from sub_assignment_sections s join rosters r on r.id = s.section_id where s.assignment_id = x.id), '[]'::jsonb))
  from sub_assignments x where x.id = a
$$;

/**
 * A class's teacher (for the sections they lead) or subs.manage (any section): schedule a sub, or change a
 * sub day (p_id). The sub is told; so are the classes' teachers when someone else scheduled it.
 */
create function public.sub_schedule_save(p_id uuid, p_substitute uuid, p_sections text[], p_starts_on date, p_ends_on date,
  p_start_time time, p_end_time time, p_plans text default '') returns uuid
language plpgsql security definer set search_path = public as $$
declare a sub_assignments; new_id uuid; sec text; lead uuid; what text; at_when text;
begin
  if p_id is not null then
    select * into a from sub_assignments where id = p_id;
    if not found then raise exception 'That sub day is gone.'; end if;
    if not app.manages_sub(p_id) then
      raise exception 'Only the class''s teacher or the office can change this sub day.' using errcode = '42501';
    end if;
  end if;
  if coalesce(cardinality(p_sections), 0) = 0 then raise exception 'Choose the classes to cover.'; end if;
  foreach sec in array p_sections loop
    if not exists (select 1 from rosters where id = sec and kind = 'section') then raise exception 'Choose classes only.'; end if;
    if not app.schedules_for(sec) then perform app.require_permission('subs.manage'); end if;
  end loop;
  if p_substitute is null or coalesce(app.school_role(p_substitute), '') not in ('substitute', 'teacher', 'staff', 'admin') then
    raise exception 'Choose a substitute, or a teacher or staff member to cover.';
  end if;
  if exists (select 1 from rosters where id = any (p_sections) and lead_id = p_substitute) then
    raise exception '% already teaches one of these classes.', app.checkin_name(p_substitute);
  end if;
  if p_starts_on is null or p_ends_on is null then raise exception 'Choose the days.'; end if;
  if p_ends_on < p_starts_on then raise exception 'The last day can''t be before the first.'; end if;
  if p_ends_on < app.school_today() then raise exception 'Choose today or a day coming up.'; end if;
  if p_ends_on - p_starts_on > 60 then raise exception 'Schedule up to two months at a time.'; end if;
  if p_start_time is null or p_end_time is null or p_end_time <= p_start_time then raise exception 'The end time must be after the start time.'; end if;
  if char_length(coalesce(p_plans, '')) > 4000 then raise exception 'Keep the sub plans under 4,000 characters.'; end if;

  if p_id is null then
    insert into sub_assignments (substitute_id, starts_on, ends_on, start_time, end_time, plans, created_by)
    values (p_substitute, p_starts_on, p_ends_on, p_start_time, p_end_time, trim(coalesce(p_plans, '')), auth.uid())
    returning id into new_id;
  else
    new_id := p_id;
    update sub_assignments set substitute_id = p_substitute, starts_on = p_starts_on, ends_on = p_ends_on,
      start_time = p_start_time, end_time = p_end_time, plans = trim(coalesce(p_plans, '')) where id = p_id;
    delete from sub_assignment_sections where assignment_id = p_id;
  end if;
  insert into sub_assignment_sections (assignment_id, section_id) select new_id, x from (select distinct unnest(p_sections) x) q;

  what := app.sub_classes(new_id);
  at_when := app.sub_when(p_starts_on, p_ends_on, p_start_time, p_end_time);
  if p_id is not null and a.substitute_id <> p_substitute then
    perform app.notify_user(a.substitute_id, '📋 Sub day cancelled: ' || what,
      app.sub_when(a.starts_on, a.ends_on, a.start_time, a.end_time), jsonb_build_object('subDays', true));
  end if;
  perform app.notify_user(p_substitute,
    case when p_id is null or a.substitute_id <> p_substitute then '📋 You''re subbing: ' else '📋 Your sub day changed: ' end || what,
    at_when, jsonb_build_object('subDays', true));
  if p_id is null then
    for lead in select distinct r.lead_id from rosters r
                where r.id = any (p_sections) and r.lead_id is not null and r.lead_id <> auth.uid() loop
      perform app.notify_user(lead, '📋 Sub scheduled: ' || app.checkin_name(p_substitute), what || ' · ' || at_when,
        jsonb_build_object('subSchedule', true));
    end loop;
  end if;
  perform app.audit(null, case when p_id is null then 'sub.scheduled' else 'sub.changed' end, new_id::text,
    jsonb_build_object('substitute', p_substitute, 'sections', p_sections, 'from', p_starts_on, 'to', p_ends_on));
  return new_id;
end $$;

/** Cancel a sub day (whoever may change it); the sub is told if it hasn't ended. */
create function public.sub_schedule_delete(p_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare a sub_assignments;
begin
  select * into a from sub_assignments where id = p_id;
  if not found then raise exception 'That sub day is gone.'; end if;
  if not app.manages_sub(p_id) then
    raise exception 'Only the class''s teacher or the office can cancel this sub day.' using errcode = '42501';
  end if;
  if a.ends_on >= app.school_today() then
    perform app.notify_user(a.substitute_id, '📋 Sub day cancelled: ' || app.sub_classes(p_id),
      app.sub_when(a.starts_on, a.ends_on, a.start_time, a.end_time), jsonb_build_object('subDays', true));
  end if;
  delete from sub_assignments where id = p_id;
  perform app.audit(null, 'sub.cancelled', p_id::text, jsonb_build_object('substitute', a.substitute_id));
end $$;

/** The sub days the caller can see and change, from today on, with their sub plans. */
create function public.sub_schedule_list() returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(app.sub_json(a.id, true) order by a.starts_on, a.start_time), '[]'::jsonb)
  from sub_assignments a where a.ends_on >= app.school_today() and app.manages_sub(a.id)
$$;

/** The caller's own sub days from today on: the classes and hours always, the sub plans only while on duty. */
create function public.my_sub_days() returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(app.sub_json(a.id, app.duty_now(a.starts_on, a.ends_on, a.start_time, a.end_time))
      order by a.starts_on, a.start_time), '[]'::jsonb)
  from sub_assignments a where a.substitute_id = auth.uid() and a.ends_on >= app.school_today()
$$;

/** For the scheduling screen: the classes the caller can schedule for, and who can cover (substitutes first). */
create function public.sub_options() returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  if not (app.is_staff() or app.has_permission('subs.manage')) then
    raise exception 'Scheduling substitutes is for teachers and the office.' using errcode = '42501';
  end if;
  return jsonb_build_object(
    'classes', coalesce((select jsonb_agg(jsonb_build_object('id', r.id, 'name', r.name,
        'teacher', case when r.lead_id is not null then app.checkin_name(r.lead_id) end) order by r.name)
      from rosters r where r.kind = 'section' and app.schedules_for(r.id)), '[]'::jsonb),
    'people', coalesce((select jsonb_agg(jsonb_build_object('id', p.id, 'name', trim(p.first_name || ' ' || p.last_name), 'role', p.school_role)
        order by p.school_role <> 'substitute', p.last_name, p.first_name)
      from profiles p where p.school_role in ('substitute', 'teacher', 'staff', 'admin') and not p.managed and p.id <> auth.uid()), '[]'::jsonb));
end $$;

-- ----------------------------------------------------------------------
-- Class tools while on duty: Attendance
-- ----------------------------------------------------------------------

/** Keeps a section's roll on any day: its lead teacher, and checkin.manage holders (the office). Staff only. */
create function app.keeps_roll(sec text, u uuid default auth.uid()) returns boolean
language sql stable security definer set search_path = public as $$
  select app.is_staff(u) and exists (select 1 from rosters r where r.id = sec and r.kind = 'section'
    and (r.lead_id = u or app.has_permission('checkin.manage', u)))
$$;

/** Takes a section's roll: whoever keeps it, and a sub covering the class right now. */
create or replace function app.takes_roll(sec text, u uuid default auth.uid()) returns boolean
language sql stable security definer set search_path = public as $$
  select app.keeps_roll(sec, u) or app.on_duty_for(sec, u)
$$;

create or replace function public.class_attendance_mark(p_section text, p_day date, p_students uuid[], p_status text) returns void
language plpgsql security definer set search_path = public as $$
declare d date := coalesce(p_day, app.school_today()); s uuid;
begin
  if not app.takes_roll(p_section) then
    raise exception 'Only the class''s teacher and the office can take its roll.' using errcode = '42501';
  end if;
  if d > app.school_today() then raise exception 'Roll can''t be taken ahead of the day.'; end if;
  if not app.keeps_roll(p_section) and d <> app.school_today() then raise exception 'Substitutes take today''s roll only.'; end if;
  if d < app.school_today() - 14 then raise exception 'Roll can only be changed for the last two weeks.'; end if;
  if p_status is not null and p_status not in ('present', 'late', 'absent') then raise exception 'Choose present, late or absent.'; end if;
  foreach s in array coalesce(p_students, '{}') loop
    if s not in (select app.section_students(p_section)) then raise exception '% isn''t in this class.', app.checkin_name(s); end if;
  end loop;
  if p_status is null then
    delete from class_attendance where section_id = p_section and day = d and student_id = any (p_students);
  else
    insert into class_attendance (section_id, student_id, day, status, marked_by)
    select p_section, x, d, p_status, auth.uid() from (select distinct unnest(p_students) x) q
    on conflict (section_id, day, student_id) do update set status = excluded.status, marked_by = excluded.marked_by, at = now();
  end if;
end $$;

create or replace function public.class_attendance_roll(p_section text, p_day date default null) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare d date := coalesce(p_day, app.school_today());
begin
  if not app.takes_roll(p_section) then
    raise exception 'Only the class''s teacher and the office can see its attendance.' using errcode = '42501';
  end if;
  if not app.keeps_roll(p_section) and d <> app.school_today() then raise exception 'Substitutes see today''s roll only.'; end if;
  return (select jsonb_build_object('id', r.id, 'name', r.name, 'teacher', case when r.lead_id is not null then app.checkin_name(r.lead_id) end,
      'day', d, 'canMark', d between app.school_today() - 14 and app.school_today(), 'otherDays', app.keeps_roll(r.id),
      'students', coalesce((select jsonb_agg(jsonb_build_object(
          'id', p.id, 'name', trim(p.first_name || ' ' || p.last_name), 'grade', p.grade,
          'mark', a.status, 'markedBy', case when a.marked_by is not null then app.checkin_name(a.marked_by) end,
          'state', app.attendance_state(r.id, p.id, d), 'left', app.left_school(p.id, d),
          'checks', coalesce((select jsonb_agg(jsonb_build_object('kind', c.kind, 'at', c.at, 'reason', c.reason,
              'person', case when c.person_id is not null then app.checkin_name(c.person_id) end) order by c.at)
            from school_checks c where c.student_id = p.id and c.day = d), '[]'::jsonb))
          order by p.last_name, p.first_name)
        from app.section_students(r.id) s join profiles p on p.id = s
        left join class_attendance a on a.section_id = r.id and a.student_id = p.id and a.day = d), '[]'::jsonb))
    from rosters r where r.id = p_section);
end $$;

-- A sub on duty reads the class's marks for today only.
drop policy "the class's teacher, the office, and the child's parents and the child" on public.class_attendance;
create policy "the class's teacher, the office, a sub on duty today, and the child's parents and the child" on public.class_attendance
  for select to authenticated
  using (app.keeps_roll(section_id) or (day = app.school_today() and app.on_duty_for(section_id))
         or app.is_guardian_of(student_id) or student_id = auth.uid());

/** The sections the caller leads, and the ones they're covering right now, each with its roll at a glance for the day. */
create or replace function public.my_class_attendance(p_day date default null) returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object('id', r.id, 'name', r.name, 'teacher', app.checkin_name(r.lead_id))
      || app.attendance_counts(r.id, coalesce(p_day, app.school_today())) order by r.name), '[]'::jsonb)
  from rosters r where r.kind = 'section' and ((r.lead_id = auth.uid() and app.is_staff()) or app.on_duty_for(r.id))
$$;

/** The office checked a student in or out: tell their sections' teachers and anyone covering them now (once each; not whoever recorded it). */
create or replace function app.tell_teachers_of_check() returns trigger
language plpgsql security definer set search_path = public as $$
declare t record; kid text := app.checkin_name(new.student_id);
begin
  for t in select x.u, min(x.sec) as sec from (
             select r.lead_id as u, r.id as sec from rosters r join roster_members m on m.roster_id = r.id
             where r.kind = 'section' and m.profile_id = new.student_id and r.lead_id is not null and app.is_staff(r.lead_id)
             union all
             select a.substitute_id, s.section_id from sub_assignment_sections s
             join sub_assignments a on a.id = s.assignment_id
             join roster_members m on m.roster_id = s.section_id
             where m.profile_id = new.student_id and app.on_duty_for(s.section_id, a.substitute_id)) x
           where x.u is distinct from new.recorded_by
           group by x.u loop
    perform app.notify_user(t.u,
      case new.kind when 'in' then '🕘 ' || kid || ' arrived late' else '👋 ' || kid || ' left early' end,
      concat_ws(' · ', app.checkin_time(new.at),
                case when new.kind = 'out' and new.person_id is not null then 'with ' || app.checkin_name(new.person_id) end,
                app.checkin_reason(new.reason)),
      jsonb_build_object('classAttendance', t.sec));
  end loop;
  return null;
end $$;

-- ----------------------------------------------------------------------
-- Class tools while on duty: field trip check-out (today's lists, from the class's students)
-- ----------------------------------------------------------------------

/** Who runs a check-out list: staff as before; a sub runs the lists they made today while on duty. */
create or replace function app.manages_checkout(l uuid, u uuid default auth.uid()) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from checkout_lists c
    left join sport_events e on e.id = c.sport_event_id
    left join sport_seasons ss on ss.id = e.season_id
    where c.id = l and (
      (app.is_staff(u) and (c.created_by = u or app.has_permission('checkin.manage', u)
                            or (ss.sport_id is not null and app.can_manage_sport(ss.sport_id, u))))
      or (c.created_by = u and c.day = app.school_today() and app.on_duty(u))))
$$;

create or replace function public.checkout_list_save(p_title text, p_day date, p_students uuid[]) returns uuid
language plpgsql security definer set search_path = public as $$
declare new_id uuid; s uuid;
begin
  if not (app.is_staff() or app.on_duty()) then raise exception 'Check-out lists are for teachers and staff.' using errcode = '42501'; end if;
  if coalesce(trim(p_title), '') = '' then raise exception 'Give the list a name, like "Zoo field trip".'; end if;
  if p_day is null or p_day < app.school_today() then raise exception 'Choose today or a day coming up.'; end if;
  if not app.is_staff() and p_day <> app.school_today() then raise exception 'Substitutes make check-out lists for today only.'; end if;
  if coalesce(cardinality(p_students), 0) = 0 then raise exception 'Choose the students going.'; end if;
  foreach s in array p_students loop
    if not exists (select 1 from profiles where id = s and school_role = 'student') then raise exception 'Choose students only.'; end if;
    if not app.has_permission('checkin.manage') and not exists (
      select 1 from rosters r join roster_members m on m.roster_id = r.id
      where r.kind = 'section' and m.profile_id = s and ((r.lead_id = auth.uid() and app.is_staff()) or app.on_duty_for(r.id))) then
      raise exception '% isn''t in a class you lead.', app.checkin_name(s) using errcode = '42501';
    end if;
  end loop;
  insert into checkout_lists (title, day, created_by) values (trim(p_title), p_day, auth.uid()) returning id into new_id;
  insert into checkout_list_students (list_id, student_id) select new_id, x from unnest(p_students) x on conflict do nothing;
  return new_id;
end $$;

/** Students in the sections the caller leads or is covering right now (children without a login too), for a check-out list. */
create or replace function public.checkout_my_students() returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object('id', x.id, 'name', x.name, 'grade', x.grade, 'sections', x.sections) order by x.last, x.first), '[]'::jsonb)
  from (select p.id, trim(p.first_name || ' ' || p.last_name) as name, p.grade, p.first_name as first, p.last_name as last,
          string_agg(distinct r.name, ', ') as sections
        from rosters r join roster_members m on m.roster_id = r.id join profiles p on p.id = m.profile_id
        where r.kind = 'section' and ((r.lead_id = auth.uid() and app.is_staff()) or app.on_duty_for(r.id)) and p.school_role = 'student'
        group by p.id, p.first_name, p.last_name, p.grade) x
$$;

-- ----------------------------------------------------------------------
-- School-wide while on duty: critical alerts and the car line board
-- ----------------------------------------------------------------------

/** Who gets critical alerts: teachers, staff and admins, and substitutes on duty. */
create function app.alert_reader(u uuid default auth.uid()) returns boolean
language sql stable security definer set search_path = public as $$
  select app.is_staff(u) or app.on_duty(u)
$$;

/** Everyone a critical alert goes to (and its roll call lists): staff with a login, and substitutes on duty. */
create or replace function app.alert_staff() returns setof uuid
language sql stable security definer set search_path = public as $$
  select id from profiles where school_role in ('admin', 'teacher', 'staff') and not managed
  union
  select id from profiles where school_role = 'substitute' and app.on_duty(id)
$$;

drop policy "teachers and staff" on public.critical_alerts;
create policy "teachers, staff and substitutes on duty" on public.critical_alerts for select to authenticated using (app.alert_reader());

/** Alerts go to the staff roles; substitutes on duty get their own copy of each (data.alertId always pushes). */
create function app.alerts_reach_subs() returns trigger
language plpgsql security definer set search_path = public as $$
declare u uuid;
begin
  if new.audience = 'roles' and new.data ? 'alertId' then
    for u in select id from profiles where school_role = 'substitute' and app.on_duty(id) loop
      insert into notifications (audience, user_id, title, body, data, urgent, created_by)
      values ('user', u, new.title, new.body, new.data, new.urgent, new.created_by);
    end loop;
  end if;
  return null;
end $$;
create trigger alerts_reach_subs after insert on public.notifications for each row execute function app.alerts_reach_subs();

/** A teacher, staff member or substitute on duty answers: safe, or needs help (the senders are told at once). */
create or replace function public.critical_alert_respond(p_alert uuid, p_status text, p_note text default null)
returns public.critical_alert_responses
language plpgsql security definer set search_path = public as $$
declare a critical_alerts%rowtype; r critical_alert_responses%rowtype; u uuid;
begin
  if not app.alert_reader() then raise exception 'Critical alerts are for teachers and staff.' using errcode = '42501'; end if;
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

/** Yes or no to sending your location with critical alert answers (staff and substitutes on duty). */
create or replace function public.alert_location_consent(p_allowed boolean) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not app.alert_reader() then raise exception 'Critical alerts are for teachers and staff.' using errcode = '42501'; end if;
  if p_allowed is null then raise exception 'Choose yes or no.'; end if;
  insert into location_consents (user_id, allowed) values (auth.uid(), p_allowed)
  on conflict (user_id) do update set allowed = excluded.allowed, answered_at = now();
end $$;

create or replace function public.critical_alert_share_location(p_alert uuid, p_lat double precision default null, p_lng double precision default null,
  p_accuracy real default null, p_located_at timestamptz default null, p_bssid text default null, p_ssid text default null,
  p_error text default null) returns void
language plpgsql security definer set search_path = public as $$
declare a critical_alerts%rowtype; ok boolean;
begin
  if not app.alert_reader() then raise exception 'Critical alerts are for teachers and staff.' using errcode = '42501'; end if;
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

create or replace function public.carline_board() returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  if not (app.is_staff() or app.on_duty()) then raise exception 'The car line board is for school staff.' using errcode = '42501'; end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', c.id, 'studentId', c.student_id, 'status', c.status, 'via', c.via,
      'arrivedAt', c.arrived_at, 'pickedUpAt', c.picked_up_at, 'distanceM', c.distance_m,
      'number', n.number, 'name', trim(s.first_name || ' ' || s.last_name), 'grade', s.grade,
      'parent', trim(g.first_name || ' ' || g.last_name),
      'vehicle', c.vehicle->>'label', 'vehicleColor', c.vehicle->>'color', 'vehicleKind', c.vehicle->>'kind',
      'birthday', app.is_birthday(d.birthday),
      'pickedUpBy', trim(coalesce(b.first_name, '') || ' ' || coalesce(b.last_name, '')))
      order by c.arrived_at)
    from carline_pickups c
    join profiles s on s.id = c.student_id
    left join student_details d on d.student_id = c.student_id
    left join pickup_numbers n on n.student_id = c.student_id
    left join profiles g on g.id = c.guardian_id
    left join profiles b on b.id = c.picked_up_by
    where c.day = app.school_today() and c.status in ('waiting', 'picked_up')), '[]'::jsonb);
end $$;

-- The board updates live for substitutes on duty too.
drop policy "car line: children you pick up, or staff" on public.carline_pickups;
create policy "car line: children you pick up, staff, or a sub on duty" on public.carline_pickups for select to authenticated
  using (app.can_pick_up(student_id) or app.is_staff() or app.on_duty());

revoke all on function app.substitute_leaves_groups(), app.sub_when(date, date, time, time), app.sub_classes(uuid),
  app.sub_json(uuid, boolean), app.alerts_reach_subs() from public, anon, authenticated;
grant execute on function app.is_substitute(uuid), app.duty_now(date, date, time, time, timestamptz), app.on_duty_for(text, uuid),
  app.on_duty(uuid), app.schedules_for(text, uuid), app.manages_sub(uuid, uuid), app.keeps_roll(text, uuid), app.alert_reader(uuid)
  to authenticated, service_role;
revoke all on function public.sub_schedule_save(uuid, uuid, text[], date, date, time, time, text), public.sub_schedule_delete(uuid),
  public.sub_schedule_list(), public.my_sub_days(), public.sub_options() from public, anon;
grant execute on function public.sub_schedule_save(uuid, uuid, text[], date, date, time, time, text), public.sub_schedule_delete(uuid),
  public.sub_schedule_list(), public.my_sub_days(), public.sub_options() to authenticated, service_role;
grant select on public.sub_assignments, public.sub_assignment_sections to authenticated;
grant all on public.sub_assignments, public.sub_assignment_sections to service_role;
