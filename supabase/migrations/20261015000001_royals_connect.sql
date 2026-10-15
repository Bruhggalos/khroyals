-- Royals Connect + calendar backend for the KH Royals app.
--
-- Mirrors src/comms (types.ts, permissions.ts, assignment.ts) on the server:
-- every write goes through a SECURITY DEFINER function that re-runs the same
-- permission checks as the app, and row-level security limits what each
-- signed-in person can read. Group settings are stored as JSON in exactly the
-- app's GroupSettings shape.

create schema if not exists app;
grant usage on schema app to anon, authenticated, service_role;

-- ======================================================================
-- People and roster
-- ======================================================================

create table public.profiles (
  id          uuid primary key references auth.users (id) on delete cascade,
  first_name  text not null default '',
  last_name   text not null default '',
  -- null = signed up but not yet approved by a school admin (no access).
  school_role text check (school_role in ('admin', 'teacher', 'staff', 'parent', 'student')),
  grade       int,
  avatar_url  text,
  created_at  timestamptz not null default now()
);

-- Contact details only the person and admins can read.
create table public.profile_private (
  id    uuid primary key references public.profiles (id) on delete cascade,
  email text
);

create table public.guardians (
  guardian_id uuid not null references public.profiles (id) on delete cascade,
  student_id  uuid not null references public.profiles (id) on delete cascade,
  primary key (guardian_id, student_id)
);

-- Class sections, teams and clubs.
create table public.rosters (
  id      text primary key,
  kind    text not null check (kind in ('section', 'team', 'club')),
  name    text not null,
  lead_id uuid references public.profiles (id) on delete set null
);

create table public.roster_members (
  roster_id  text not null references public.rosters (id) on delete cascade,
  profile_id uuid not null references public.profiles (id) on delete cascade,
  primary key (roster_id, profile_id)
);

-- ======================================================================
-- Groups
-- ======================================================================

create table public.groups (
  id              uuid primary key default gen_random_uuid(),
  slug            text unique,
  name            text not null,
  description     text not null default '',
  icon            text not null default '💬',
  color           text not null default '#00239C',
  category        text not null default 'class'
                  check (category in ('school-wide', 'class', 'grade', 'athletics', 'club', 'staff', 'parents', 'district')),
  parent_group_id uuid references public.groups (id) on delete set null,
  tags            text[] not null default '{}',
  settings        jsonb not null,
  created_by      uuid references public.profiles (id) on delete set null,
  created_at      timestamptz not null default now()
);

create table public.assignment_rules (
  id                   uuid primary key default gen_random_uuid(),
  group_id             uuid not null references public.groups (id) on delete cascade,
  school_roles         text[],
  grades               int[],
  roster_ids           text[],  -- sections / teams / clubs (any match)
  include_guardians_as text check (include_guardians_as in ('owner', 'moderator', 'member', 'subscriber')),
  assign_as            text not null check (assign_as in ('owner', 'moderator', 'member', 'subscriber'))
);

create table public.memberships (
  group_id     uuid not null references public.groups (id) on delete cascade,
  user_id      uuid not null references public.profiles (id) on delete cascade,
  role         text not null check (role in ('owner', 'moderator', 'member', 'subscriber')),
  source       text not null default 'manual' check (source in ('manual', 'rule', 'invite', 'request', 'self')),
  rule_id      uuid references public.assignment_rules (id) on delete set null,
  muted_until  timestamptz,
  can_post     boolean not null default true,
  notification text check (notification in ('all', 'mentions', 'digest', 'none')),
  joined_at    timestamptz not null default now(),
  primary key (group_id, user_id)
);
create index on public.memberships (user_id);

-- ======================================================================
-- Posts, replies, reactions, votes, polls
-- ======================================================================

create table public.posts (
  id               uuid primary key default gen_random_uuid(),
  group_id         uuid not null references public.groups (id) on delete cascade,
  author_id        uuid references public.profiles (id) on delete set null,  -- null when anonymous
  kind             text not null check (kind in ('message', 'thread', 'announcement', 'question', 'poll')),
  title            text,
  body             text not null default '',
  attachments      jsonb not null default '[]',
  status           text not null default 'published'
                   check (status in ('published', 'pending', 'rejected', 'removed', 'scheduled')),
  pinned           boolean not null default false,
  comments_locked  boolean not null default false,
  score            int not null default 0,
  created_at       timestamptz not null default now(),
  edited_at        timestamptz
);
create index on public.posts (group_id, created_at desc);

-- Who wrote an anonymous question; visible to moderators only (via functions).
create table app.anonymous_authors (
  post_id   uuid primary key references public.posts (id) on delete cascade,
  author_id uuid not null references public.profiles (id) on delete cascade
);

create table public.comments (
  id                uuid primary key default gen_random_uuid(),
  post_id           uuid not null references public.posts (id) on delete cascade,
  parent_comment_id uuid references public.comments (id) on delete cascade,
  author_id         uuid references public.profiles (id) on delete set null,
  body              text not null,
  status            text not null default 'published'
                    check (status in ('published', 'pending', 'rejected', 'removed')),
  is_answer         boolean not null default false,
  score             int not null default 0,
  created_at        timestamptz not null default now()
);
create index on public.comments (post_id, created_at);

create table public.reactions (
  post_id uuid not null references public.posts (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  emoji   text not null,
  primary key (post_id, user_id, emoji)
);

create table public.post_votes (
  post_id uuid not null references public.posts (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  value   smallint not null check (value in (-1, 1)),
  primary key (post_id, user_id)
);

create table public.poll_options (
  id       uuid primary key default gen_random_uuid(),
  post_id  uuid not null references public.posts (id) on delete cascade,
  label    text not null,
  position int not null default 0
);

create table public.poll_votes (
  option_id uuid not null references public.poll_options (id) on delete cascade,
  post_id   uuid not null references public.posts (id) on delete cascade,
  user_id   uuid not null references public.profiles (id) on delete cascade,
  primary key (post_id, user_id)  -- one vote per poll
);

create table public.audit_log (
  id        bigint generated always as identity primary key,
  group_id  uuid references public.groups (id) on delete cascade,
  actor_id  uuid references public.profiles (id) on delete set null,
  action    text not null,
  target_id text,
  detail    jsonb,
  at        timestamptz not null default now()
);
create index on public.audit_log (group_id, at desc);

-- ======================================================================
-- Calendar: school-wide (group_id null) and per-group events
-- ======================================================================

create table public.events (
  id          uuid primary key default gen_random_uuid(),
  group_id    uuid references public.groups (id) on delete cascade,
  title       text not null,
  description text,
  starts_on   date not null,
  ends_on     date,
  start_time  time,
  end_time    time,
  all_day     boolean not null default true,
  location    text,
  category    text not null default 'Event',
  created_by  uuid references public.profiles (id) on delete set null,
  created_at  timestamptz not null default now(),
  check (ends_on is null or ends_on >= starts_on)
);
create index on public.events (starts_on);

-- ======================================================================
-- Permission helpers (port of src/comms/permissions.ts)
-- ======================================================================

create function app.school_role(u uuid default auth.uid()) returns text
language sql stable security definer set search_path = public as $$
  select school_role from public.profiles where id = u
$$;

create function app.is_admin(u uuid default auth.uid()) returns boolean
language sql stable as $$ select coalesce(app.school_role(u) = 'admin', false) $$;

create function app.is_staff(u uuid default auth.uid()) returns boolean
language sql stable as $$ select coalesce(app.school_role(u) in ('admin', 'teacher', 'staff'), false) $$;

create function app.role_rank(r text) returns int
language sql immutable as $$
  select case r when 'owner' then 0 when 'moderator' then 1 when 'member' then 2 when 'subscriber' then 3 else 99 end
$$;

create function app.audience_rank(a text) returns int
language sql immutable as $$
  select case a when 'owners' then 0 when 'moderators' then 1 when 'members' then 2 when 'subscribers' then 3 else -1 end
$$;

create function app.audience_includes(audience text, role text) returns boolean
language sql immutable as $$ select role is not null and app.role_rank(role) <= app.audience_rank(audience) $$;

/** Effective role in a group. School admins act as owners everywhere. */
create function app.effective_role(g uuid, u uuid default auth.uid()) returns text
language plpgsql stable security definer set search_path = public as $$
declare sr text; r text; vis text;
begin
  sr := app.school_role(u);
  if sr is null then return null; end if;            -- signed out or awaiting approval
  if sr = 'admin' then return 'owner'; end if;
  select role into r from memberships where group_id = g and user_id = u;
  if r is not null then return r; end if;
  select settings->>'visibility' into vis from groups where id = g;
  if vis in ('public', 'school') then return 'subscriber'; end if;
  return null;
end $$;

create function app.is_moderator(g uuid, u uuid default auth.uid()) returns boolean
language sql stable as $$ select app.role_rank(app.effective_role(g, u)) <= 1 $$;

create function app.can_view_content(g uuid, u uuid default auth.uid()) returns boolean
language sql stable security definer set search_path = public as $$
  select app.audience_includes(settings->'permissions'->>'viewContent', app.effective_role(g, u))
  from groups where id = g
$$;

create function app.is_member(g uuid, u uuid default auth.uid()) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from memberships where group_id = g and user_id = u)
$$;

create function app.can_see_members(g uuid, u uuid default auth.uid()) returns boolean
language sql stable security definer set search_path = public as $$
  select app.audience_includes(settings->'permissions'->>'seeMemberList', app.effective_role(g, u)) from groups where id = g
$$;

create function app.post_group(p uuid) returns uuid
language sql stable security definer set search_path = public as $$ select group_id from posts where id = p $$;

create function app.deny(reason text) returns jsonb
language sql immutable as $$ select jsonb_build_object('allowed', false, 'reason', reason) $$;

/** The single source of truth for "can this person do X in this group?" */
create function app.can(g uuid, action text, u uuid default auth.uid(), now_ts timestamptz default now())
returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  s jsonb; aud text; role text; m memberships%rowtype; has_m boolean;
  q jsonb; local_ts timestamp; mins int; st int; en int; last_post timestamptz; wait numeric;
begin
  select settings into s from groups where id = g;
  if s is null then return app.deny('Group not found.'); end if;
  role := app.effective_role(g, u);
  if role is null then return app.deny('Not a member of this group.'); end if;
  aud := s->'permissions'->>action;
  if aud is null then return app.deny('Unknown action.'); end if;
  if not app.audience_includes(aud, role) then
    return app.deny('Only ' || aud || ' can do this here.');
  end if;

  if action in ('post', 'comment', 'askQuestion', 'answerQuestion', 'attachFiles', 'createPolls', 'react')
     and app.role_rank(role) > 1 then
    if coalesce((s->>'locked')::boolean, false) then
      return app.deny(coalesce(nullif(s->>'lockReason', ''), 'This group is locked.'));
    end if;
    select * into m from memberships where group_id = g and user_id = u;
    has_m := found;
    if has_m and not m.can_post and action <> 'react' then
      return app.deny('Posting has been turned off for you in this group.');
    end if;
    if has_m and m.muted_until is not null and m.muted_until > now_ts and action <> 'react' then
      return app.deny('You are muted in this group.');
    end if;
    q := s->'quietHours';
    if action <> 'react' and jsonb_typeof(q) = 'object' and (q->'appliesTo') ? role then
      local_ts := now_ts at time zone 'America/Chicago';
      mins := extract(hour from local_ts)::int * 60 + extract(minute from local_ts)::int;
      st := split_part(q->>'start', ':', 1)::int * 60 + split_part(q->>'start', ':', 2)::int;
      en := split_part(q->>'end', ':', 1)::int * 60 + split_part(q->>'end', ':', 2)::int;
      if (st <= en and mins >= st and mins < en) or (st > en and (mins >= st or mins < en)) then
        return app.deny('Quiet hours (' || (q->>'start') || '–' || (q->>'end') || ').');
      end if;
    end if;
    if action = 'post' and coalesce((s->>'slowModeSeconds')::int, 0) > 0 and not app.is_staff(u) then
      select max(created_at) into last_post from posts where group_id = g and author_id = u;
      if last_post is not null then
        wait := (s->>'slowModeSeconds')::int - extract(epoch from now_ts - last_post);
        if wait > 0 then return app.deny('Slow mode: wait ' || ceil(wait)::int || 's.'); end if;
      end if;
    end if;
    if action = 'post' and coalesce((s->>'requirePostApproval')::boolean, false) then
      return jsonb_build_object('allowed', true, 'needsApproval', true);
    end if;
    if action = 'askQuestion' and coalesce((s->>'requireQuestionApproval')::boolean, false) then
      return jsonb_build_object('allowed', true, 'needsApproval', true);
    end if;
  end if;
  return jsonb_build_object('allowed', true);
end $$;

/** Per-post check: comments can be closed on one post or by age. */
create function app.can_comment(p uuid, u uuid default auth.uid(), now_ts timestamptz default now())
returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare post posts%rowtype; base jsonb; days int;
begin
  select * into post from posts where id = p;
  if not found then return app.deny('Post not found.'); end if;
  base := app.can(post.group_id, 'comment', u, now_ts);
  if not (base->>'allowed')::boolean or app.is_moderator(post.group_id, u) then return base; end if;
  if post.status <> 'published' then return app.deny('This post is not published.'); end if;
  if post.comments_locked then return app.deny('Comments are closed on this post.'); end if;
  select (settings->>'autoCloseCommentsAfterDays')::int into days from groups where id = post.group_id;
  if days is not null and now_ts - post.created_at > make_interval(days => days) then
    return app.deny('Comments close after ' || days || ' days.');
  end if;
  return base;
end $$;

create function app.can_read_post(p uuid, u uuid default auth.uid()) returns boolean
language sql stable security definer set search_path = public as $$
  select app.can_view_content(po.group_id, u)
     and (po.status = 'published' or po.author_id = u or app.is_moderator(po.group_id, u)
          or exists (select 1 from app.anonymous_authors a where a.post_id = po.id and a.author_id = u))
  from posts po where po.id = p
$$;

create function app.require(decision jsonb) returns void
language plpgsql immutable as $$
begin
  if not coalesce((decision->>'allowed')::boolean, false) then
    raise exception '%', coalesce(decision->>'reason', 'Not allowed.') using errcode = '42501';
  end if;
end $$;

create function app.audit(g uuid, action text, target text default null, detail jsonb default null) returns void
language sql security definer set search_path = public as $$
  insert into audit_log (group_id, actor_id, action, target_id, detail) values (g, auth.uid(), action, target, detail)
$$;

-- ======================================================================
-- Rule-based membership (port of src/comms/assignment.ts)
-- ======================================================================

create function app.rule_targets(g uuid) returns table (user_id uuid, role text, rule_id uuid)
language sql stable security definer set search_path = public as $$
  with matched as (
    select r.id as rule_id, p.id as user_id, r.assign_as as role
    from assignment_rules r
    join profiles p on p.school_role is not null
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

/** Keep rule memberships in step with the roster; manual memberships are never touched. */
create function app.sync_rule_memberships(g uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  delete from memberships m
  where m.group_id = g and m.source = 'rule'
    and not exists (select 1 from app.rule_targets(g) t where t.user_id = m.user_id);
  insert into memberships (group_id, user_id, role, source, rule_id)
  select g, t.user_id, t.role, 'rule', t.rule_id from app.rule_targets(g) t
  on conflict (group_id, user_id) do update
    set role = excluded.role, rule_id = excluded.rule_id
    where memberships.source = 'rule';
end $$;

create function app.sync_all_rule_groups() returns trigger
language plpgsql security definer set search_path = public as $$
declare g uuid;
begin
  for g in select distinct group_id from assignment_rules loop
    perform app.sync_rule_memberships(g);
  end loop;
  return null;
end $$;

create trigger resync_on_roster after insert or update or delete on public.roster_members
  for each statement execute function app.sync_all_rule_groups();
create trigger resync_on_guardians after insert or update or delete on public.guardians
  for each statement execute function app.sync_all_rule_groups();
create trigger resync_on_profiles after insert or update of school_role, grade or delete on public.profiles
  for each statement execute function app.sync_all_rule_groups();
create trigger resync_on_rules after insert or update or delete on public.assignment_rules
  for each statement execute function app.sync_all_rule_groups();

-- New sign-ups get a profile awaiting admin approval (school_role null).
create function app.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into profiles (id, first_name, last_name)
  values (new.id, coalesce(new.raw_user_meta_data->>'first_name', ''), coalesce(new.raw_user_meta_data->>'last_name', ''));
  insert into profile_private (id, email) values (new.id, new.email);
  return new;
end $$;

create trigger on_auth_user_created after insert on auth.users
  for each row execute function app.handle_new_user();

-- Accounts created before this migration ran.
insert into public.profiles (id, first_name, last_name)
select id, coalesce(raw_user_meta_data->>'first_name', ''), coalesce(raw_user_meta_data->>'last_name', '') from auth.users
on conflict (id) do nothing;
insert into public.profile_private (id, email) select id, email from auth.users on conflict (id) do nothing;

-- ======================================================================
-- Row-level security: reads. All writes go through the functions below.
-- ======================================================================

alter table public.profiles         enable row level security;
alter table public.profile_private  enable row level security;
alter table public.guardians        enable row level security;
alter table public.rosters          enable row level security;
alter table public.roster_members   enable row level security;
alter table public.groups           enable row level security;
alter table public.assignment_rules enable row level security;
alter table public.memberships      enable row level security;
alter table public.posts            enable row level security;
alter table public.comments         enable row level security;
alter table public.reactions        enable row level security;
alter table public.post_votes       enable row level security;
alter table public.poll_options     enable row level security;
alter table public.poll_votes       enable row level security;
alter table public.audit_log        enable row level security;
alter table public.events           enable row level security;

create policy "approved users see the directory" on public.profiles for select to authenticated
  using (id = auth.uid() or app.school_role() is not null);
create policy "own or admin" on public.profile_private for select to authenticated
  using (id = auth.uid() or app.is_admin());
create policy "family links: own, staff" on public.guardians for select to authenticated
  using (guardian_id = auth.uid() or student_id = auth.uid() or app.is_staff());
create policy "approved users" on public.rosters for select to authenticated
  using (app.school_role() is not null);
create policy "own or staff" on public.roster_members for select to authenticated
  using (profile_id = auth.uid() or app.is_staff());

create policy "discoverable groups" on public.groups for select to authenticated
  using (app.is_admin()
         or (app.school_role() is not null and settings->>'visibility' <> 'hidden')
         or app.is_member(id));
create policy "moderators" on public.assignment_rules for select to authenticated
  using (app.is_moderator(group_id));
create policy "own, or whoever may see the member list" on public.memberships for select to authenticated
  using (user_id = auth.uid() or app.can_see_members(group_id));

create policy "readable posts" on public.posts for select to authenticated
  using (app.can_read_post(id));
create policy "readable comments" on public.comments for select to authenticated
  using (app.can_read_post(post_id)
         and (status = 'published' or author_id = auth.uid()
              or app.is_moderator(app.post_group(post_id))));
create policy "readable posts" on public.reactions for select to authenticated using (app.can_read_post(post_id));
create policy "own votes" on public.post_votes for select to authenticated using (user_id = auth.uid());
create policy "readable posts" on public.poll_options for select to authenticated using (app.can_read_post(post_id));
create policy "readable posts" on public.poll_votes for select to authenticated using (app.can_read_post(post_id));
create policy "moderators" on public.audit_log for select to authenticated
  using (app.is_admin() or (group_id is not null and app.is_moderator(group_id)));

create policy "school calendar is public; group calendars follow the group" on public.events for select to anon, authenticated
  using (group_id is null or app.can_view_content(group_id));
create policy "calendar editors can insert" on public.events for insert to authenticated
  with check ((group_id is null and app.is_admin()) or (group_id is not null and app.is_moderator(group_id)));
create policy "calendar editors can update" on public.events for update to authenticated
  using ((group_id is null and app.is_admin()) or (group_id is not null and app.is_moderator(group_id)))
  with check ((group_id is null and app.is_admin()) or (group_id is not null and app.is_moderator(group_id)));
create policy "calendar editors can delete" on public.events for delete to authenticated
  using ((group_id is null and app.is_admin()) or (group_id is not null and app.is_moderator(group_id)));

-- ======================================================================
-- API: functions the app calls (supabase.rpc)
-- ======================================================================

/** What the signed-in person may do in a group (drives the app's UI). */
create function public.group_abilities(p_group uuid) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'role', app.effective_role(p_group),
    'post', app.can(p_group, 'post'),
    'askQuestion', app.can(p_group, 'askQuestion'),
    'comment', app.can(p_group, 'comment'),
    'react', app.can(p_group, 'react'),
    'createPolls', app.can(p_group, 'createPolls'),
    'attachFiles', app.can(p_group, 'attachFiles'),
    'pin', app.can(p_group, 'pin'),
    'moderate', app.is_moderator(p_group),
    'editSettings', app.effective_role(p_group) = 'owner',
    'createEvents', app.is_moderator(p_group)
  )
$$;

create function public.my_groups() returns setof public.groups
language sql stable security definer set search_path = public as $$
  select g.* from groups g
  where app.is_admin() or exists (select 1 from memberships m where m.group_id = g.id and m.user_id = auth.uid())
  order by g.name
$$;

create function public.create_post(
  p_group uuid, p_kind text, p_body text, p_title text default null, p_anonymous boolean default false,
  p_attachments jsonb default '[]', p_poll_options text[] default null
) returns public.posts
language plpgsql security definer set search_path = public as $$
declare d jsonb; s jsonb; anon boolean; row posts%rowtype; i int;
begin
  if coalesce(trim(p_body), '') = '' and coalesce(trim(p_title), '') = '' then raise exception 'Write something first.'; end if;
  d := app.can(p_group, case when p_kind = 'question' then 'askQuestion' else 'post' end);
  perform app.require(d);
  if jsonb_array_length(coalesce(p_attachments, '[]')) > 0 then perform app.require(app.can(p_group, 'attachFiles')); end if;
  if p_poll_options is not null then perform app.require(app.can(p_group, 'createPolls')); end if;
  select settings into s from groups where id = p_group;
  anon := p_anonymous and p_kind = 'question' and coalesce((s->>'allowAnonymousQuestions')::boolean, false);
  insert into posts (group_id, author_id, kind, title, body, attachments, status)
  values (p_group, case when anon then null else auth.uid() end,
          case when p_poll_options is not null then 'poll' else p_kind end,
          nullif(trim(p_title), ''), coalesce(p_body, ''), coalesce(p_attachments, '[]'),
          case when coalesce((d->>'needsApproval')::boolean, false) then 'pending' else 'published' end)
  returning * into row;
  if anon then insert into app.anonymous_authors values (row.id, auth.uid()); end if;
  if p_poll_options is not null then
    for i in 1 .. array_length(p_poll_options, 1) loop
      insert into poll_options (post_id, label, position) values (row.id, p_poll_options[i], i);
    end loop;
  end if;
  return row;
end $$;

create function public.add_comment(p_post uuid, p_body text, p_parent uuid default null) returns public.comments
language plpgsql security definer set search_path = public as $$
declare row comments%rowtype; post posts%rowtype;
begin
  if coalesce(trim(p_body), '') = '' then raise exception 'Write something first.'; end if;
  select * into post from posts where id = p_post;
  if not app.can_read_post(p_post) then raise exception 'Post not found.'; end if;
  perform app.require(app.can_comment(p_post));
  insert into comments (post_id, parent_comment_id, author_id, body, is_answer)
  values (p_post, p_parent, auth.uid(), trim(p_body),
          post.kind = 'question' and coalesce((app.can(post.group_id, 'answerQuestion')->>'allowed')::boolean, false)
            and app.is_moderator(post.group_id))
  returning * into row;
  return row;
end $$;

create function public.moderate_post(p_post uuid, p_action text) returns public.posts
language plpgsql security definer set search_path = public as $$
declare row posts%rowtype;
begin
  select * into row from posts where id = p_post;
  if not found or not app.is_moderator(row.group_id) then raise exception 'Not a moderator.' using errcode = '42501'; end if;
  update posts set
    status = case p_action when 'approve' then 'published' when 'reject' then 'rejected' when 'remove' then 'removed' else status end,
    pinned = case when p_action = 'pin' then not pinned else pinned end,
    comments_locked = case when p_action = 'lockComments' then not comments_locked else comments_locked end
  where id = p_post returning * into row;
  perform app.audit(row.group_id, 'post.' || p_action, p_post::text);
  return row;
end $$;

create function public.toggle_reaction(p_post uuid, p_emoji text) returns void
language plpgsql security definer set search_path = public as $$
declare g uuid;
begin
  select group_id into g from posts where id = p_post;
  if not app.can_read_post(p_post) then raise exception 'Post not found.'; end if;
  perform app.require(app.can(g, 'react'));
  delete from reactions where post_id = p_post and user_id = auth.uid() and emoji = p_emoji;
  if not found then insert into reactions values (p_post, auth.uid(), p_emoji); end if;
end $$;

create function public.vote_post(p_post uuid, p_value int) returns int
language plpgsql security definer set search_path = public as $$
declare g uuid; total int;
begin
  select group_id into g from posts where id = p_post;
  if not app.can_read_post(p_post) then raise exception 'Post not found.'; end if;
  perform app.require(app.can(g, 'react'));
  if p_value = 0 then delete from post_votes where post_id = p_post and user_id = auth.uid();
  else insert into post_votes values (p_post, auth.uid(), sign(p_value)) on conflict (post_id, user_id) do update set value = excluded.value;
  end if;
  select coalesce(sum(value), 0) into total from post_votes where post_id = p_post;
  update posts set score = total where id = p_post;
  return total;
end $$;

create function public.vote_poll(p_option uuid) returns void
language plpgsql security definer set search_path = public as $$
declare p uuid; g uuid;
begin
  select o.post_id, po.group_id into p, g from poll_options o join posts po on po.id = o.post_id where o.id = p_option;
  if p is null or not app.can_read_post(p) then raise exception 'Poll not found.'; end if;
  perform app.require(app.can(g, 'react'));
  insert into poll_votes values (p_option, p, auth.uid()) on conflict (post_id, user_id) do update set option_id = excluded.option_id;
end $$;

create function public.create_group(
  p_name text, p_description text, p_icon text, p_color text, p_category text, p_settings jsonb,
  p_rules jsonb default '[]', p_parent uuid default null
) returns public.groups
language plpgsql security definer set search_path = public as $$
declare row groups%rowtype; r jsonb;
begin
  if not app.is_staff() then raise exception 'Only staff can create groups.' using errcode = '42501'; end if;
  insert into groups (name, description, icon, color, category, settings, parent_group_id, created_by)
  values (p_name, coalesce(p_description, ''), coalesce(p_icon, '💬'), coalesce(p_color, '#00239C'),
          coalesce(p_category, 'class'), p_settings, p_parent, auth.uid())
  returning * into row;
  insert into memberships (group_id, user_id, role, source) values (row.id, auth.uid(), 'owner', 'manual');
  for r in select * from jsonb_array_elements(coalesce(p_rules, '[]')) loop
    insert into assignment_rules (group_id, school_roles, grades, roster_ids, include_guardians_as, assign_as)
    values (row.id,
            (select array_agg(x) from jsonb_array_elements_text(r->'schoolRoles') x),
            (select array_agg(x::int) from jsonb_array_elements_text(r->'grades') x),
            (select array_agg(x) from jsonb_array_elements_text(coalesce(r->'rosterIds', '[]') || coalesce(r->'sectionIds', '[]') || coalesce(r->'teamIds', '[]') || coalesce(r->'clubIds', '[]')) x),
            r->>'includeGuardiansAs', coalesce(r->>'assignAs', 'member'));
  end loop;
  return row;
end $$;

create function public.update_group_settings(p_group uuid, p_patch jsonb) returns public.groups
language plpgsql security definer set search_path = public as $$
declare row groups%rowtype; s jsonb;
begin
  if app.effective_role(p_group) is distinct from 'owner' then
    raise exception 'Only owners can change settings.' using errcode = '42501';
  end if;
  select settings into s from groups where id = p_group;
  update groups
     set settings = s || (p_patch - 'permissions')
                    || jsonb_build_object('permissions', coalesce(s->'permissions', '{}') || coalesce(p_patch->'permissions', '{}'))
   where id = p_group returning * into row;
  perform app.audit(p_group,
    case when p_patch ? 'locked' and (p_patch->>'locked')::boolean is distinct from (s->>'locked')::boolean
         then case when (p_patch->>'locked')::boolean then 'group.locked' else 'group.unlocked' end
         else 'settings.updated' end,
    null, p_patch);
  return row;
end $$;

create function public.set_membership(
  p_group uuid, p_user uuid, p_role text default null, p_muted_until timestamptz default null,
  p_can_post boolean default null, p_remove boolean default false
) returns void
language plpgsql security definer set search_path = public as $$
declare mine text; theirs text;
begin
  mine := app.effective_role(p_group);
  if app.role_rank(mine) > 1 then raise exception 'Not a moderator.' using errcode = '42501'; end if;
  select role into theirs from memberships where group_id = p_group and user_id = p_user;
  -- Moderators can't change owners or hand out ranks above their own.
  if mine <> 'owner' and (theirs = 'owner' or app.role_rank(p_role) < app.role_rank(mine)) then
    raise exception 'Only owners can do that.' using errcode = '42501';
  end if;
  if p_remove then
    delete from memberships where group_id = p_group and user_id = p_user;
    perform app.audit(p_group, 'member.removed', p_user::text);
    return;
  end if;
  insert into memberships (group_id, user_id, role, source)
  values (p_group, p_user, coalesce(p_role, 'member'), 'manual')
  on conflict (group_id, user_id) do update
    set role = coalesce(p_role, memberships.role),
        source = case when p_role is not null then 'manual' else memberships.source end,
        muted_until = case when p_muted_until is not null then nullif(p_muted_until, '-infinity') else memberships.muted_until end,
        can_post = coalesce(p_can_post, memberships.can_post);
  perform app.audit(p_group,
    case when theirs is null then 'member.added' when p_muted_until is not null then 'member.muted'
         when p_role is not null and p_role <> theirs then 'member.role_changed' else 'member.updated' end,
    p_user::text, jsonb_build_object('role', p_role, 'mutedUntil', p_muted_until, 'canPost', p_can_post));
end $$;

create function public.join_group(p_group uuid) returns void
language plpgsql security definer set search_path = public as $$
declare s jsonb;
begin
  select settings into s from groups where id = p_group;
  if app.school_role() is null or s is null or s->>'joinPolicy' <> 'open' or s->>'visibility' = 'hidden' then
    raise exception 'This group is not open to join.' using errcode = '42501';
  end if;
  insert into memberships (group_id, user_id, role, source)
  values (p_group, auth.uid(), case when s->>'mode' = 'broadcast' then 'subscriber' else 'member' end, 'self')
  on conflict do nothing;
end $$;

create function public.leave_group(p_group uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not coalesce((select (settings->>'membersCanLeave')::boolean from groups where id = p_group), false) then
    raise exception 'Members can''t leave this group.' using errcode = '42501';
  end if;
  delete from memberships where group_id = p_group and user_id = auth.uid() and role <> 'owner';
end $$;

/** Moderators can see who asked an anonymous question. */
create function public.anonymous_author(p_post uuid) returns uuid
language sql stable security definer set search_path = public as $$
  select a.author_id from app.anonymous_authors a join posts p on p.id = a.post_id
  where a.post_id = p_post and app.is_moderator(p.group_id)
$$;

create function public.update_my_profile(p_first text, p_last text, p_avatar text default null) returns void
language sql security definer set search_path = public as $$
  update profiles set first_name = p_first, last_name = p_last, avatar_url = coalesce(p_avatar, avatar_url) where id = auth.uid()
$$;

-- ----- Admin -----------------------------------------------------------

create function app.require_admin() returns void
language plpgsql stable as $$
begin
  if not app.is_admin() then raise exception 'Admins only.' using errcode = '42501'; end if;
end $$;

/** Approve a sign-up or change someone's role/grade. */
create function public.admin_update_profile(
  p_user uuid, p_role text, p_grade int default null, p_first text default null, p_last text default null
) returns void
language plpgsql security definer set search_path = public as $$
begin
  perform app.require_admin();
  if p_user = auth.uid() and p_role is distinct from 'admin' then raise exception 'You can''t remove your own admin role.'; end if;
  update profiles set school_role = p_role, grade = p_grade,
         first_name = coalesce(p_first, first_name), last_name = coalesce(p_last, last_name)
   where id = p_user;
  perform app.audit(null, 'profile.updated', p_user::text, jsonb_build_object('role', p_role, 'grade', p_grade));
end $$;

create function public.admin_link_guardian(p_guardian uuid, p_student uuid, p_link boolean default true) returns void
language plpgsql security definer set search_path = public as $$
begin
  perform app.require_admin();
  if p_link then insert into guardians values (p_guardian, p_student) on conflict do nothing;
  else delete from guardians where guardian_id = p_guardian and student_id = p_student; end if;
end $$;

create function public.admin_set_roster(p_roster text, p_kind text, p_name text, p_lead uuid default null) returns void
language plpgsql security definer set search_path = public as $$
begin
  perform app.require_admin();
  insert into rosters values (p_roster, p_kind, p_name, p_lead)
  on conflict (id) do update set kind = excluded.kind, name = excluded.name, lead_id = excluded.lead_id;
end $$;

create function public.admin_roster_member(p_roster text, p_user uuid, p_add boolean default true) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not (app.is_admin() or exists (select 1 from rosters where id = p_roster and lead_id = auth.uid())) then
    raise exception 'Admins or the roster''s teacher/coach only.' using errcode = '42501';
  end if;
  if p_add then insert into roster_members values (p_roster, p_user) on conflict do nothing;
  else delete from roster_members where roster_id = p_roster and profile_id = p_user; end if;
end $$;

/** Profiles with emails, for the admin console. */
create function public.admin_list_people() returns table (
  id uuid, first_name text, last_name text, school_role text, grade int, email text, created_at timestamptz
)
language plpgsql stable security definer set search_path = public as $$
begin
  perform app.require_admin();
  return query
    select p.id, p.first_name, p.last_name, p.school_role, p.grade, pp.email, p.created_at
    from profiles p left join profile_private pp on pp.id = p.id
    order by p.school_role nulls first, p.last_name, p.first_name;
end $$;

-- ======================================================================
-- Privileges
-- ======================================================================

revoke all on all functions in schema public from public, anon;
revoke all on all functions in schema app from public, anon;
grant execute on all functions in schema public to authenticated, service_role;
grant execute on all functions in schema app to authenticated, service_role;
-- Signed-out visitors may read the school calendar.
grant execute on function app.can_view_content(uuid, uuid) to anon;
grant execute on function app.effective_role(uuid, uuid) to anon;
grant execute on function app.school_role(uuid) to anon;
grant execute on function app.audience_includes(text, text) to anon;
grant execute on function app.role_rank(text) to anon;
grant execute on function app.audience_rank(text) to anon;

-- Reads go through RLS; writes only through the functions above.
revoke insert, update, delete on all tables in schema public from anon, authenticated;
grant select on all tables in schema public to anon, authenticated;
grant insert, update, delete on public.events to authenticated;
grant all on all tables in schema public to service_role;
grant all on all tables in schema app to service_role;
