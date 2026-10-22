-- Students: Ask the Teacher, Assignments, and the class rosters both use.
--
-- Classes are rosters of kind 'section' ("English 10 – Period 3"): a lead teacher and
-- the students in it. The office manages them in the admin portal (people.family); a
-- section's teacher can add and remove its students too. FACTS can fill them later.
--
-- Ask the Teacher: a student with their own login has one conversation with each teacher
-- who leads one of their sections. Either of them writes, and the other is notified. The
-- student's parents can read it (not write), and so can admins with messages.review.
--
-- Assignments: a teacher assigns work to one of their sections and its students see it
-- (and are notified); students also add their own. Checking one off is private to the
-- student: teachers don't see who's done.

-- ======================================================================
-- Who teaches whom
-- ======================================================================

/** The teachers (staff) who lead a class section the student is in. */
create function app.teachers_of(s uuid) returns setof uuid
language sql stable security definer set search_path = public as $$
  select distinct r.lead_id from rosters r join roster_members m on m.roster_id = r.id
  where r.kind = 'section' and m.profile_id = s and r.lead_id is not null and r.lead_id <> s and app.is_staff(r.lead_id)
$$;

create function app.teaches(t uuid, s uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from app.teachers_of(s) x where x = t)
$$;

/** The student and the teacher, the student's parents, and admins with messages.review. */
create function app.reads_teacher_thread(s uuid, t uuid, u uuid default auth.uid()) returns boolean
language sql stable security definer set search_path = public as $$
  select u = s or u = t or app.is_guardian_of(s, u) or app.has_permission('messages.review', u)
$$;

-- ======================================================================
-- Ask the Teacher
-- ======================================================================

create table public.teacher_threads (
  id              uuid primary key default gen_random_uuid(),
  student_id      uuid not null references public.profiles (id) on delete cascade,
  teacher_id      uuid not null references public.profiles (id) on delete cascade,
  last_message_at timestamptz,
  student_read_at timestamptz,
  teacher_read_at timestamptz,
  created_at      timestamptz not null default now(),
  unique (student_id, teacher_id),
  check (student_id <> teacher_id)
);

create table public.teacher_messages (
  id         uuid primary key default gen_random_uuid(),
  thread_id  uuid not null references public.teacher_threads (id) on delete cascade,
  author_id  uuid references public.profiles (id) on delete set null,
  body       text not null check (char_length(trim(body)) between 1 and 2000),
  created_at timestamptz not null default now()
);
create index on public.teacher_messages (thread_id, created_at);

alter table public.teacher_threads enable row level security;
alter table public.teacher_messages enable row level security;
create policy "the student, the teacher, parents and reviewers" on public.teacher_threads for select to authenticated
  using (app.reads_teacher_thread(student_id, teacher_id));
create policy "the student, the teacher, parents and reviewers" on public.teacher_messages for select to authenticated
  using (exists (select 1 from teacher_threads t where t.id = thread_id and app.reads_teacher_thread(t.student_id, t.teacher_id)));

/** Write in a student–teacher conversation (started on the first message). Only those two write. */
create function public.teacher_send(p_student uuid, p_teacher uuid, p_body text) returns public.teacher_messages
language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); th teacher_threads%rowtype; r teacher_messages%rowtype; other uuid;
begin
  if me = p_student then
    if app.school_role() is distinct from 'student' then raise exception 'Ask the Teacher is for students.' using errcode = '42501'; end if;
    if not app.teaches(p_teacher, p_student) then raise exception 'You can message the teachers of your classes.' using errcode = '42501'; end if;
    other := p_teacher;
  elsif me = p_teacher then
    if not app.teaches(p_teacher, p_student) then raise exception 'You can message the students in your classes.' using errcode = '42501'; end if;
    other := p_student;
  else
    raise exception 'Only the student and the teacher write here.' using errcode = '42501';
  end if;
  if nullif(trim(p_body), '') is null then raise exception 'Write a message first.'; end if;
  insert into teacher_threads (student_id, teacher_id) values (p_student, p_teacher) on conflict (student_id, teacher_id) do nothing;
  select * into th from teacher_threads where student_id = p_student and teacher_id = p_teacher for update;
  insert into teacher_messages (thread_id, author_id, body) values (th.id, me, trim(p_body)) returning * into r;
  update teacher_threads set last_message_at = r.created_at,
    student_read_at = case when me = p_student then r.created_at else student_read_at end,
    teacher_read_at = case when me = p_teacher then r.created_at else teacher_read_at end
  where id = th.id;
  perform app.notify_user(other, '✉️ ' || app.short_name(me), left(trim(p_body), 140), jsonb_build_object('teacherThreadId', th.id));
  return r;
end $$;

/** The student or the teacher has read the conversation up to now. */
create function public.teacher_thread_read(p_thread uuid) returns void
language sql security definer set search_path = public as $$
  update teacher_threads set
    student_read_at = case when student_id = auth.uid() then now() else student_read_at end,
    teacher_read_at = case when teacher_id = auth.uid() then now() else teacher_read_at end
  where id = p_thread and auth.uid() in (student_id, teacher_id)
$$;

/**
 * The conversations this person can read: their own (as student or teacher), their
 * children's (parents), or all of them (messages.review); `p_student` narrows to one
 * student. Unread is for the person's own side only.
 */
create function public.teacher_conversations(p_student uuid default null)
returns table (id uuid, student_id uuid, student_name text, teacher_id uuid, teacher_name text,
               last_message_at timestamptz, last_body text, unread boolean)
language sql stable security definer set search_path = public as $$
  select t.id, t.student_id, trim(s.first_name || ' ' || s.last_name), t.teacher_id, trim(p.first_name || ' ' || p.last_name),
         t.last_message_at,
         (select m.body from teacher_messages m where m.thread_id = t.id order by m.created_at desc limit 1),
         case when auth.uid() = t.student_id then t.last_message_at > coalesce(t.student_read_at, '-infinity')
              when auth.uid() = t.teacher_id then t.last_message_at > coalesce(t.teacher_read_at, '-infinity')
              else false end
  from teacher_threads t join profiles s on s.id = t.student_id join profiles p on p.id = t.teacher_id
  where app.reads_teacher_thread(t.student_id, t.teacher_id) and (p_student is null or t.student_id = p_student)
    and t.last_message_at is not null
  order by t.last_message_at desc
$$;

/** For a student: each of their teachers, the classes they teach them, and the conversation (if any). */
create function public.my_teachers()
returns table (teacher_id uuid, teacher_name text, classes text, thread_id uuid, last_message_at timestamptz, last_body text, unread boolean)
language sql stable security definer set search_path = public as $$
  select x.lead_id, trim(p.first_name || ' ' || p.last_name), string_agg(x.name, ', ' order by x.name),
         t.id, t.last_message_at,
         (select m.body from teacher_messages m where m.thread_id = t.id order by m.created_at desc limit 1),
         coalesce(t.last_message_at > coalesce(t.student_read_at, '-infinity'), false)
  from (select r.lead_id, r.name from rosters r join roster_members m on m.roster_id = r.id
        where r.kind = 'section' and m.profile_id = auth.uid() and r.lead_id in (select app.teachers_of(auth.uid()))) x
  join profiles p on p.id = x.lead_id
  left join teacher_threads t on t.student_id = auth.uid() and t.teacher_id = x.lead_id
  group by x.lead_id, p.first_name, p.last_name, t.id, t.last_message_at, t.student_read_at
  order by p.last_name, p.first_name
$$;

/** For a teacher: the students (with their own login) in the class sections they lead. */
create function public.my_class_students()
returns table (student_id uuid, student_name text, grade int, classes text)
language sql stable security definer set search_path = public as $$
  select p.id, trim(p.first_name || ' ' || p.last_name), p.grade, string_agg(r.name, ', ' order by r.name)
  from rosters r join roster_members m on m.roster_id = r.id join profiles p on p.id = m.profile_id
  where r.kind = 'section' and r.lead_id = auth.uid() and app.is_staff() and p.school_role = 'student' and not p.managed
  group by p.id, p.first_name, p.last_name, p.grade
  order by p.last_name, p.first_name
$$;

/** One conversation, if this person can read it: who's in it, whether they can write, and the messages. */
create function public.teacher_thread(p_thread uuid) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'id', t.id, 'studentId', t.student_id, 'teacherId', t.teacher_id,
    'studentName', trim(s.first_name || ' ' || s.last_name), 'teacherName', trim(p.first_name || ' ' || p.last_name),
    'canWrite', auth.uid() in (t.student_id, t.teacher_id) and app.teaches(t.teacher_id, t.student_id),
    'messages', coalesce((select jsonb_agg(jsonb_build_object('id', m.id, 'authorId', m.author_id, 'body', m.body, 'createdAt', m.created_at)
                                           order by m.created_at)
                          from teacher_messages m where m.thread_id = t.id), '[]'::jsonb))
  from teacher_threads t join profiles s on s.id = t.student_id join profiles p on p.id = t.teacher_id
  where t.id = p_thread and app.reads_teacher_thread(t.student_id, t.teacher_id)
$$;

/** The conversation between this student and teacher (started on the first message), for opening it from a list. */
create function public.teacher_thread_for(p_student uuid, p_teacher uuid) returns uuid
language sql stable security definer set search_path = public as $$
  select id from teacher_threads where student_id = p_student and teacher_id = p_teacher
    and app.reads_teacher_thread(student_id, teacher_id)
$$;

-- ======================================================================
-- Assignments
-- ======================================================================

create table public.assignments (
  id         uuid primary key default gen_random_uuid(),
  roster_id  text references public.rosters (id) on delete cascade,   -- a class assignment; null = a student's own
  owner_id   uuid not null references public.profiles (id) on delete cascade,
  title      text not null check (char_length(trim(title)) between 1 and 120),
  details    text not null default '' check (char_length(details) <= 2000),
  due_on     date,
  created_at timestamptz not null default now()
);
create index on public.assignments (roster_id, due_on);
create index on public.assignments (owner_id);

create table public.assignment_done (
  assignment_id uuid not null references public.assignments (id) on delete cascade,
  student_id    uuid not null references public.profiles (id) on delete cascade,
  done_at       timestamptz not null default now(),
  primary key (assignment_id, student_id)
);

/** A student sees their own assignments and their sections'; a teacher sees the ones they gave. */
create function app.sees_assignment(p_owner uuid, p_roster text, u uuid default auth.uid()) returns boolean
language sql stable security definer set search_path = public as $$
  select p_owner = u
      or (p_roster is not null and exists (select 1 from roster_members where roster_id = p_roster and profile_id = u))
      or (p_roster is not null and exists (select 1 from rosters where id = p_roster and lead_id = u))
$$;

alter table public.assignments enable row level security;
alter table public.assignment_done enable row level security;
create policy "students in the class, and whoever made it" on public.assignments for select to authenticated
  using (app.sees_assignment(owner_id, roster_id));
create policy "only the student" on public.assignment_done for select to authenticated
  using (student_id = auth.uid());

/**
 * Add an assignment: with a class (`p_roster`), the class's teacher assigns it to its
 * students, who are notified; without one, a student adds their own.
 */
create function public.assignment_add(p_title text, p_details text default '', p_due_on date default null, p_roster text default null)
returns public.assignments
language plpgsql security definer set search_path = public as $$
declare r rosters%rowtype; a assignments%rowtype; st record;
begin
  if p_roster is not null then
    select * into r from rosters where id = p_roster and kind = 'section';
    if not found or r.lead_id is distinct from auth.uid() or not app.is_staff() then
      raise exception 'You can give assignments to the classes you teach.' using errcode = '42501';
    end if;
  elsif app.school_role() is distinct from 'student' then
    raise exception 'Assignments you add yourself are for students.' using errcode = '42501';
  end if;
  if nullif(trim(p_title), '') is null then raise exception 'Add a title.'; end if;
  insert into assignments (roster_id, owner_id, title, details, due_on)
  values (p_roster, auth.uid(), trim(p_title), coalesce(trim(p_details), ''), p_due_on)
  returning * into a;
  if p_roster is not null then
    for st in select m.profile_id from roster_members m join profiles p on p.id = m.profile_id
              where m.roster_id = p_roster and p.school_role = 'student' and not p.managed loop
      perform app.notify_user(st.profile_id, '📝 ' || r.name,
        a.title || coalesce(' · due ' || to_char(a.due_on, 'Dy, Mon FMDD'), '') || '.', jsonb_build_object('assignmentId', a.id));
    end loop;
  end if;
  return a;
end $$;

/** Whoever made an assignment removes it. */
create function public.assignment_delete(p_assignment uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  delete from assignments where id = p_assignment and owner_id = auth.uid();
  if not found then raise exception 'Only whoever added an assignment can remove it.' using errcode = '42501'; end if;
end $$;

/** A student checks an assignment off (or back on). Only they see it. */
create function public.assignment_check(p_assignment uuid, p_done boolean) returns void
language plpgsql security definer set search_path = public as $$
declare a assignments%rowtype;
begin
  select * into a from assignments where id = p_assignment;
  if not found or not app.sees_assignment(a.owner_id, a.roster_id) or app.school_role() is distinct from 'student' then
    raise exception 'This assignment isn''t yours.' using errcode = '42501';
  end if;
  if p_done then insert into assignment_done (assignment_id, student_id) values (a.id, auth.uid()) on conflict do nothing;
  else delete from assignment_done where assignment_id = a.id and student_id = auth.uid(); end if;
end $$;

/** For a teacher: the class sections they lead, to assign work to. */
create function public.my_sections() returns table (id text, name text, students bigint)
language sql stable security definer set search_path = public as $$
  select r.id, r.name, (select count(*) from roster_members m join profiles p on p.id = m.profile_id
                         where m.roster_id = r.id and p.school_role = 'student')
  from rosters r where r.kind = 'section' and r.lead_id = auth.uid() and app.is_staff()
  order by r.name
$$;

-- ======================================================================
-- Classes in the admin portal (people.family)
-- ======================================================================

/** Every class section with its teacher and how many students. */
create function public.admin_list_sections() returns table (id text, name text, lead_id uuid, lead_name text, students bigint)
language plpgsql stable security definer set search_path = public as $$
begin
  perform app.require_permission('people.family');
  return query
    select r.id, r.name, r.lead_id, trim(p.first_name || ' ' || p.last_name),
           (select count(*) from roster_members m join profiles q on q.id = m.profile_id where m.roster_id = r.id and q.school_role = 'student')
    from rosters r left join profiles p on p.id = r.lead_id
    where r.kind = 'section'
    order by r.name;
end $$;

/** A class section's students. */
create function public.admin_section_students(p_roster text) returns table (id uuid, first_name text, last_name text, grade int, has_login boolean)
language plpgsql stable security definer set search_path = public as $$
begin
  perform app.require_permission('people.family');
  return query
    select p.id, p.first_name, p.last_name, p.grade, not p.managed
    from roster_members m join profiles p on p.id = m.profile_id
    where m.roster_id = p_roster and p.school_role = 'student'
    order by p.last_name, p.first_name;
end $$;

/** Remove a class section (its assignments and memberships go with it; conversations stay). */
create function public.admin_delete_roster(p_roster text) returns void
language plpgsql security definer set search_path = public as $$
declare r rosters%rowtype;
begin
  perform app.require_permission('people.family');
  delete from rosters where id = p_roster returning * into r;
  if not found then raise exception 'No such class.'; end if;
  perform app.audit(null, 'roster.deleted', p_roster, jsonb_build_object('name', r.name, 'kind', r.kind));
end $$;

-- ======================================================================
-- The messages.review permission
-- ======================================================================

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
    ('alerts.send',      'Send critical alerts',  'Send critical alerts (severe weather, an active threat, a dangerous situation) to every teacher and staff member, see who''s safe, and give the all clear.'),
    ('questions.manage', 'Route questions',       'See every question sent to the school, assign it to faculty or staff, and answer it.'),
    ('messages.review',  'Student messages',      'Read every Ask the Teacher conversation between students and teachers, for safety.'),
    ('sports.manage',    'Manage activities',     'Add activities (sports, theater, music, art, clubs) and seasons, set schedules, assign coaches and directors, and approve sign-ups.'),
    ('audit.view',       'Activity log',          'Review the school-wide activity log.')
$$;

update public.admin_roles set permissions = permissions || 'messages.review'::text
where id in ('director', 'administrator') and not ('messages.review' = any (permissions));

-- ======================================================================
-- Privileges
-- ======================================================================

revoke all on function app.teachers_of(uuid), app.teaches(uuid, uuid), app.reads_teacher_thread(uuid, uuid, uuid),
  app.sees_assignment(uuid, text, uuid) from public, anon;
grant execute on function app.teachers_of(uuid), app.teaches(uuid, uuid), app.reads_teacher_thread(uuid, uuid, uuid),
  app.sees_assignment(uuid, text, uuid) to authenticated, service_role;

revoke all on function public.teacher_send(uuid, uuid, text), public.teacher_thread_read(uuid), public.teacher_conversations(uuid),
  public.my_teachers(), public.my_class_students(), public.teacher_thread(uuid), public.teacher_thread_for(uuid, uuid),
  public.assignment_add(text, text, date, text), public.assignment_delete(uuid), public.assignment_check(uuid, boolean),
  public.my_sections(), public.admin_list_sections(), public.admin_section_students(text), public.admin_delete_roster(text)
  from public, anon;
grant execute on function public.teacher_send(uuid, uuid, text), public.teacher_thread_read(uuid), public.teacher_conversations(uuid),
  public.my_teachers(), public.my_class_students(), public.teacher_thread(uuid), public.teacher_thread_for(uuid, uuid),
  public.assignment_add(text, text, date, text), public.assignment_delete(uuid), public.assignment_check(uuid, boolean),
  public.my_sections(), public.admin_list_sections(), public.admin_section_students(text), public.admin_delete_roster(text)
  to authenticated, service_role;

-- Reads go through row-level security; writes only through the functions above.
revoke all on public.teacher_threads, public.teacher_messages, public.assignments, public.assignment_done from anon;
revoke insert, update, delete on public.teacher_threads, public.teacher_messages, public.assignments, public.assignment_done from authenticated;
grant select on public.teacher_threads, public.teacher_messages, public.assignments, public.assignment_done to authenticated;
grant all on public.teacher_threads, public.teacher_messages, public.assignments, public.assignment_done to service_role;

alter publication supabase_realtime add table public.teacher_threads, public.teacher_messages, public.assignments, public.assignment_done;
