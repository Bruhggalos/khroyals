-- Ask the School (Apps → Ask the School).
--
-- Anyone with an approved account sends the school a question; it stays in their
-- log with the whole conversation, so they can come back for the answer and ask
-- a follow-up. People who route questions (the new questions.manage permission,
-- part of the Office, Administrator and Director tiers) see every question, how
-- long it has waited, and assign it to a faculty or staff member, who can then
-- see and answer it. A question is visible only to whoever asked it, whoever it's
-- assigned to, and the routers. Each step notifies the people involved.
--
-- Status: new (waiting, unassigned), assigned (waiting, with someone), answered
-- (the school replied last), closed. waiting_since is when the asker's oldest
-- unanswered message arrived; it's what "age" means in the routing view.

-- ======================================================================
-- The "Route questions" permission
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
    ('audit.view',       'Activity log',          'Review the school-wide activity log.')
$$;

create or replace function app.tier_permissions(tier text) returns text[]
language sql immutable as $$
  select case tier
    when 'director' then array['admins.manage', 'people.view', 'people.approve', 'people.roles', 'people.family',
                               'groups.manage', 'calendar.school', 'push.send', 'questions.manage', 'audit.view']
    when 'administrator' then array['people.view', 'people.approve', 'people.roles', 'people.family',
                                    'groups.manage', 'calendar.school', 'push.send', 'questions.manage', 'audit.view']
    when 'office' then array['people.view', 'people.approve', 'people.family', 'calendar.school', 'push.send',
                             'questions.manage', 'audit.view']
    else array[]::text[] end
$$;

-- ======================================================================
-- Tables
-- ======================================================================

create table public.school_questions (
  id            uuid primary key default gen_random_uuid(),
  asker_id      uuid not null references public.profiles (id) on delete cascade,
  topic         text not null default 'Other' check (topic in (
                  'Academics', 'Attendance', 'Athletics', 'Fine Arts', 'Car Line', 'Health',
                  'Tuition & Billing', 'Uniforms', 'Technology', 'Other')),
  subject       text not null check (char_length(trim(subject)) between 1 and 120),
  status        text not null default 'new' check (status in ('new', 'assigned', 'answered', 'closed')),
  assignee_id   uuid references public.profiles (id) on delete set null,
  assigned_by   uuid references public.profiles (id) on delete set null,
  assigned_at   timestamptz,
  waiting_since timestamptz default now(),
  answered_at   timestamptz,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index on public.school_questions (asker_id, updated_at desc);
create index on public.school_questions (assignee_id, updated_at desc);
create index on public.school_questions (status, waiting_since);

create table public.school_question_messages (
  id          uuid primary key default gen_random_uuid(),
  question_id uuid not null references public.school_questions (id) on delete cascade,
  author_id   uuid references public.profiles (id) on delete set null,
  from_school boolean not null,
  body        text not null check (char_length(trim(body)) between 1 and 4000),
  created_at  timestamptz not null default now()
);
create index on public.school_question_messages (question_id, created_at);

alter table public.school_questions enable row level security;
alter table public.school_question_messages enable row level security;

/** Whoever asked it, whoever it's assigned to, and routers. */
create function app.can_see_question(q uuid, u uuid default auth.uid()) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from school_questions where id = q and (asker_id = u or assignee_id = u))
      or app.has_permission('questions.manage', u)
$$;

create policy "your questions, ones assigned to you, or all for routers" on public.school_questions for select to authenticated
  using (asker_id = auth.uid() or assignee_id = auth.uid() or app.has_permission('questions.manage'));
create policy "messages of questions you can see" on public.school_question_messages for select to authenticated
  using (app.can_see_question(question_id));

-- ======================================================================
-- API
-- ======================================================================

/** Everyone who routes questions (tier or granted), for notifications. */
create function app.question_routers() returns setof uuid
language sql stable security definer set search_path = public as $$
  select id from profiles
  where school_role is not null and (admin_tier is not null or cardinality(permissions) > 0)
    and 'questions.manage' = any (app.permissions(id))
$$;

create function app.question_note(u uuid, title text, body text, q uuid) returns void
language sql security definer set search_path = public as $$
  select app.notify_user(u, title, body, jsonb_build_object('questionId', q)) where u is not null
$$;

/** Send the school a question. */
create function public.ask_school(p_topic text, p_subject text, p_body text) returns public.school_questions
language plpgsql security definer set search_path = public as $$
declare q school_questions%rowtype; r uuid;
begin
  if app.school_role() is null then raise exception 'Sign in with an approved account to ask the school.' using errcode = '42501'; end if;
  insert into school_questions (asker_id, topic, subject) values (auth.uid(), coalesce(p_topic, 'Other'), trim(p_subject)) returning * into q;
  insert into school_question_messages (question_id, author_id, from_school, body) values (q.id, auth.uid(), false, trim(p_body));
  for r in select app.question_routers() loop
    perform app.question_note(r, '❓ New question: ' || q.subject, app.short_name(auth.uid()) || ' · ' || q.topic, q.id);
  end loop;
  return q;
end $$;

/**
 * Add to a question's conversation. From the asker it's a follow-up (the
 * question is waiting again); from the assignee or a router it's the school's
 * answer.
 */
create function public.question_reply(p_question uuid, p_body text) returns public.school_question_messages
language plpgsql security definer set search_path = public as $$
declare q school_questions%rowtype; m school_question_messages%rowtype; school boolean; r uuid;
begin
  select * into q from school_questions where id = p_question for update;
  if not found then raise exception 'No such question.'; end if;
  school := q.asker_id <> auth.uid();
  if school and q.assignee_id is distinct from auth.uid() and not app.has_permission('questions.manage') then
    raise exception 'Only the person who asked, the staff member it''s assigned to, or the office can reply.' using errcode = '42501';
  end if;
  insert into school_question_messages (question_id, author_id, from_school, body)
  values (q.id, auth.uid(), school, trim(p_body)) returning * into m;
  if school then
    update school_questions set status = 'answered', answered_at = now(), waiting_since = null, updated_at = now() where id = q.id;
    perform app.question_note(q.asker_id, '💬 The school answered: ' || q.subject,
      app.short_name(auth.uid()) || ': ' || left(m.body, 140), q.id);
  else
    update school_questions
    set status = case when assignee_id is null then 'new' else 'assigned' end,
        waiting_since = coalesce(waiting_since, now()), updated_at = now()
    where id = q.id;
    if q.assignee_id is not null then
      perform app.question_note(q.assignee_id, 'Follow-up: ' || q.subject, app.short_name(auth.uid()) || ': ' || left(m.body, 140), q.id);
    else
      for r in select app.question_routers() loop
        perform app.question_note(r, 'Follow-up: ' || q.subject, app.short_name(auth.uid()) || ': ' || left(m.body, 140), q.id);
      end loop;
    end if;
  end if;
  return m;
end $$;

/** A router assigns a question to a faculty or staff member (null to unassign). */
create function public.question_assign(p_question uuid, p_assignee uuid) returns public.school_questions
language plpgsql security definer set search_path = public as $$
declare q school_questions%rowtype;
begin
  perform app.require_permission('questions.manage');
  if p_assignee is not null and not app.is_staff(p_assignee) then
    raise exception 'Questions can only be assigned to faculty or staff.';
  end if;
  update school_questions set
    assignee_id = p_assignee, assigned_by = auth.uid(), assigned_at = now(), updated_at = now(),
    status = case when status in ('new', 'assigned') then case when p_assignee is null then 'new' else 'assigned' end else status end
  where id = p_question returning * into q;
  if not found then raise exception 'No such question.'; end if;
  perform app.audit(null, 'question.assigned', p_question::text, jsonb_build_object('assignee', p_assignee));
  if p_assignee is not null and p_assignee <> auth.uid() then
    perform app.question_note(p_assignee, '📥 Question for you: ' || q.subject,
      'From ' || app.short_name(q.asker_id) || ' · ' || q.topic || ' · assigned by ' || app.short_name(auth.uid()), q.id);
  end if;
  return q;
end $$;

/** Close a question (the asker, its assignee or a router). */
create function public.question_close(p_question uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  update school_questions set status = 'closed', waiting_since = null, updated_at = now()
  where id = p_question
    and (asker_id = auth.uid() or assignee_id = auth.uid() or app.has_permission('questions.manage'));
  if not found then raise exception 'You can''t close this question.' using errcode = '42501'; end if;
end $$;

-- ======================================================================
-- Privileges
-- ======================================================================

revoke all on function app.can_see_question(uuid, uuid), app.question_routers(), app.question_note(uuid, text, text, uuid) from public, anon;
grant execute on function app.can_see_question(uuid, uuid) to authenticated, service_role;
revoke all on function public.ask_school(text, text, text), public.question_reply(uuid, text),
  public.question_assign(uuid, uuid), public.question_close(uuid) from public, anon;
grant execute on function public.ask_school(text, text, text), public.question_reply(uuid, text),
  public.question_assign(uuid, uuid), public.question_close(uuid) to authenticated, service_role;

revoke all on public.school_questions, public.school_question_messages from anon;
revoke insert, update, delete on public.school_questions, public.school_question_messages from authenticated;
grant select on public.school_questions, public.school_question_messages to authenticated;
grant all on public.school_questions, public.school_question_messages to service_role;

alter publication supabase_realtime add table public.school_questions, public.school_question_messages;
