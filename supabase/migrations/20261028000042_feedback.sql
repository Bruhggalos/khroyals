-- Feedback: anyone with an approved account reports a bug or suggests a feature from inside the
-- app (the Feedback app, or My profile → Send feedback), and sees their own reports, what became
-- of them and the team's reply. Triage (the new feedback.triage permission: the IT role, directors
-- and administrators) sees everything, sets each report's status and priority, replies to the
-- sender, and groups reports into workshops: sessions where students learn by working on the
-- app's real bugs and feature requests.
--
-- Kinds, areas and statuses are listed in both src/feedback/kinds.ts and the checks below.

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
    ('forms.send',       'Send forms',            'Send forms (permission slips, releases, acknowledgments) to any class, activity, grade or the whole school, and see every form''s signatures.'),
    ('people.delete',    'Delete accounts',       'Permanently delete someone''s account, with their posts and comments. Deleting an admin also needs Manage admins.'),
    ('gallery.manage',   'Manage photo gallery',  'Change or remove any photo album or photo, not just your own.'),
    ('feedback.triage',  'Triage feedback',       'See every bug report and feature request sent from the app, set its status and priority, reply, and plan student workshops from them.'),
    ('audit.view',       'Activity log',          'Review the school-wide activity log.')
$$;

update public.admin_roles set permissions = permissions || 'feedback.triage'::text
where id in ('director', 'administrator') and not ('feedback.triage' = any (permissions));

-- A ready-made role for the school's IT people; directors give it to someone in the admin portal.
insert into public.admin_roles (id, name, description, permissions) values
  ('it', 'IT', 'Triages bug reports and feature requests sent from the app, and plans student workshops from them.',
   array['feedback.triage'])
on conflict (id) do nothing;

create table public.feedback_workshops (
  id          uuid primary key default gen_random_uuid(),
  title       text not null check (char_length(trim(title)) between 1 and 100),
  description text not null default '' check (char_length(description) <= 2000),
  held_on     date,
  created_by  uuid references public.profiles (id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create table public.feedback (
  id          uuid primary key default gen_random_uuid(),
  author_id   uuid not null references public.profiles (id) on delete cascade,
  kind        text not null check (kind in ('bug', 'idea')),
  area        text not null default 'other' check (area in (
                'planner', 'connect', 'carline', 'calendar', 'activities', 'volunteer', 'market', 'forms',
                'students', 'questions', 'photos', 'news', 'alerts', 'profile', 'admin', 'other')),
  title       text not null check (char_length(trim(title)) between 1 and 120),
  details     text not null default '' check (char_length(details) <= 4000),
  device      text not null default '' check (char_length(device) <= 200),   -- "ios 27.0 · app 0.1.0"
  status      text not null default 'new' check (status in ('new', 'reviewing', 'planned', 'in_progress', 'done', 'declined')),
  priority    text check (priority in ('low', 'medium', 'high')),
  reply       text not null default '' check (char_length(reply) <= 2000),   -- shown to the sender
  workshop_id uuid references public.feedback_workshops (id) on delete set null,
  triaged_by  uuid references public.profiles (id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index on public.feedback (author_id, created_at desc);
create index on public.feedback (status, created_at desc);
create index on public.feedback (workshop_id);

alter table public.feedback enable row level security;
alter table public.feedback_workshops enable row level security;
create policy "your own, or triage" on public.feedback for select to authenticated
  using (author_id = auth.uid() or app.has_permission('feedback.triage'));
create policy "triage" on public.feedback_workshops for select to authenticated using (app.has_permission('feedback.triage'));
grant select on public.feedback, public.feedback_workshops to authenticated;
revoke insert, update, delete on public.feedback, public.feedback_workshops from anon, authenticated;
grant all on public.feedback, public.feedback_workshops to service_role;

/** Who triages feedback (for new-report notifications). */
create function app.feedback_team() returns setof uuid
language sql stable security definer set search_path = public as $$
  select id from profiles
  where school_role is not null and (admin_tier is not null or cardinality(permissions) > 0)
    and 'feedback.triage' = any (app.permissions(id))
$$;

create function app.feedback_status_label(s text) returns text
language sql immutable as $$
  select case s when 'new' then 'New' when 'reviewing' then 'Being reviewed' when 'planned' then 'Planned'
    when 'in_progress' then 'Being worked on' when 'done' then 'Done' when 'declined' then 'Not planned' else s end
$$;

/** Send a bug report or feature idea. The triage team is told. */
create function public.feedback_send(p_kind text, p_area text, p_title text, p_details text default '', p_device text default '')
returns public.feedback
language plpgsql security definer set search_path = public as $$
declare row feedback%rowtype; t text := trim(coalesce(p_title, '')); x uuid;
begin
  if app.school_role() is null then raise exception 'Sign in with an approved account to send feedback.' using errcode = '42501'; end if;
  if p_kind is null or p_kind not in ('bug', 'idea') then raise exception 'Choose a bug or an idea.'; end if;
  if t = '' then raise exception 'Give it a short title.'; end if;
  if char_length(t) > 120 then raise exception 'Keep the title to 120 characters.'; end if;
  if char_length(coalesce(p_details, '')) > 4000 then raise exception 'Keep the details to 4000 characters.'; end if;
  if (select count(*) from feedback where author_id = auth.uid() and created_at > now() - interval '1 day') >= 20 then
    raise exception 'That''s a lot of feedback for one day. Thank you! Send more tomorrow.';
  end if;
  insert into feedback (author_id, kind, area, title, details, device)
  values (auth.uid(), p_kind, coalesce(nullif(p_area, ''), 'other'), t, trim(coalesce(p_details, '')), left(trim(coalesce(p_device, '')), 200))
  returning * into row;
  for x in select app.feedback_team() loop
    if x <> auth.uid() then
      perform app.notify_user(x, case when p_kind = 'bug' then '🐞 Bug report: ' else '💡 Feature idea: ' end || t,
        app.short_name(auth.uid()) || coalesce(' · ' || nullif(left(row.details, 120), ''), ''), jsonb_build_object('feedbackId', row.id));
    end if;
  end loop;
  return row;
end $$;

/**
 * For triage: set a report's status, priority, reply to the sender and workshop (null clears
 * priority and workshop). The sender hears when the status or the reply changes.
 */
create function public.feedback_triage(p_id uuid, p_status text, p_priority text default null, p_reply text default '', p_workshop uuid default null)
returns public.feedback
language plpgsql security definer set search_path = public as $$
declare old feedback%rowtype; row feedback%rowtype; r text := trim(coalesce(p_reply, ''));
begin
  perform app.require_permission('feedback.triage');
  select * into old from feedback where id = p_id for update;
  if not found then raise exception 'That feedback is gone.'; end if;
  if p_status is null or p_status not in ('new', 'reviewing', 'planned', 'in_progress', 'done', 'declined') then raise exception 'Choose a status.'; end if;
  if p_priority is not null and p_priority not in ('low', 'medium', 'high') then raise exception 'Choose low, medium or high.'; end if;
  if char_length(r) > 2000 then raise exception 'Keep the reply to 2000 characters.'; end if;
  if p_workshop is not null and not exists (select 1 from feedback_workshops where id = p_workshop) then raise exception 'That workshop is gone.'; end if;
  update feedback set status = p_status, priority = p_priority, reply = r, workshop_id = p_workshop,
    triaged_by = auth.uid(), updated_at = now()
  where id = p_id returning * into row;
  if (row.status is distinct from old.status or row.reply is distinct from old.reply) and row.author_id <> auth.uid() then
    perform app.notify_user(row.author_id, '🛠️ ' || row.title,
      app.feedback_status_label(row.status) || coalesce(' · ' || nullif(left(row.reply, 140), ''), ''), jsonb_build_object('feedbackId', row.id));
  end if;
  return row;
end $$;

/**
 * Feedback this person may see, newest first: their own, or (triage) everyone's, with the
 * sender's name and role and the workshop's title.
 */
create function public.feedback_list()
returns table (
  id uuid, author_id uuid, author_name text, author_role text, kind text, area text, title text, details text, device text,
  status text, priority text, reply text, workshop_id uuid, workshop_title text, created_at timestamptz, updated_at timestamptz
)
language sql stable security definer set search_path = public as $$
  select f.id, f.author_id, trim(p.first_name || ' ' || p.last_name), p.school_role, f.kind, f.area, f.title, f.details, f.device,
         f.status, f.priority, f.reply, f.workshop_id, w.title, f.created_at, f.updated_at
  from feedback f
  join profiles p on p.id = f.author_id
  left join feedback_workshops w on w.id = f.workshop_id
  where f.author_id = auth.uid() or app.has_permission('feedback.triage')
  order by f.created_at desc
$$;

/** Triage: add (no `p_id`) or change a workshop. */
create function public.feedback_workshop_save(p_id uuid, p_title text, p_description text default '', p_held_on date default null)
returns public.feedback_workshops
language plpgsql security definer set search_path = public as $$
declare row feedback_workshops%rowtype; t text := trim(coalesce(p_title, ''));
begin
  perform app.require_permission('feedback.triage');
  if t = '' then raise exception 'Give the workshop a title.'; end if;
  if char_length(t) > 100 then raise exception 'Keep the title to 100 characters.'; end if;
  if char_length(coalesce(p_description, '')) > 2000 then raise exception 'Keep the description to 2000 characters.'; end if;
  if p_id is null then
    insert into feedback_workshops (title, description, held_on, created_by)
    values (t, trim(coalesce(p_description, '')), p_held_on, auth.uid()) returning * into row;
  else
    update feedback_workshops set title = t, description = trim(coalesce(p_description, '')), held_on = p_held_on, updated_at = now()
    where id = p_id returning * into row;
    if not found then raise exception 'That workshop is gone.'; end if;
  end if;
  return row;
end $$;

/** Triage: remove a workshop; its feedback stays, no longer in a workshop. */
create function public.feedback_workshop_delete(p_id uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  perform app.require_permission('feedback.triage');
  delete from feedback_workshops where id = p_id;
  if not found then raise exception 'That workshop is gone.'; end if;
end $$;

revoke all on function public.feedback_send(text, text, text, text, text), public.feedback_triage(uuid, text, text, text, uuid),
  public.feedback_list(), public.feedback_workshop_save(uuid, text, text, date), public.feedback_workshop_delete(uuid) from public, anon;
grant execute on function public.feedback_send(text, text, text, text, text), public.feedback_triage(uuid, text, text, text, uuid),
  public.feedback_list(), public.feedback_workshop_save(uuid, text, text, date), public.feedback_workshop_delete(uuid)
  to authenticated, service_role;
