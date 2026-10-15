-- Admin tiers, granular permissions, authenticator-app (MFA) enforcement and
-- push notifications.
--
-- Tiers: exactly one DIRECTOR (all powers, only one who manages admins),
-- ADMINISTRATORS (everything except managing admins) and OFFICE staff
-- (approvals, families, school calendar, notifications, activity log).
-- The director can also grant individual permissions to anyone.
-- Admin powers only count in a session verified with an authenticator app
-- (Supabase MFA, aal2) while app.settings.require_admin_mfa is on.

-- ======================================================================
-- Settings
-- ======================================================================

create table app.settings (key text primary key, value text);
insert into app.settings values ('require_admin_mfa', 'true'), ('functions_url', null)
on conflict (key) do nothing;

create function app.setting(k text) returns text
language sql stable security definer set search_path = app as $$ select value from app.settings where key = k $$;

-- ======================================================================
-- Tiers and permissions
-- ======================================================================

alter table public.profiles
  add column admin_tier text check (admin_tier in ('director', 'administrator', 'office')),
  add column permissions text[] not null default '{}';
create unique index profiles_one_director on public.profiles ((true)) where admin_tier = 'director';

/** Every permission, with a description for the admin portal. */
create function public.permission_catalog() returns table (key text, label text, description text)
language sql immutable as $$
  values
    ('admins.manage',   'Manage admins',         'Make or remove admins, set tiers and grant permissions (director only).'),
    ('people.view',     'View people',           'See everyone''s contact email in the admin portal.'),
    ('people.approve',  'Approve sign-ups',      'Approve new accounts as parents or students.'),
    ('people.roles',    'Change roles',          'Set anyone''s school role, including teachers and staff.'),
    ('people.family',   'Families & rosters',    'Link parents to students, set grades, manage class/team rosters.'),
    ('groups.manage',   'Manage all groups',     'Act as owner of every group: settings, members, moderation.'),
    ('calendar.school', 'School calendar',       'Add, change and remove school-wide calendar events.'),
    ('push.send',       'Send notifications',    'Send push notifications to everyone, a role or any group.'),
    ('audit.view',      'Activity log',          'Review the school-wide activity log.')
$$;

create function app.tier_permissions(tier text) returns text[]
language sql immutable as $$
  select case tier
    when 'director' then array['admins.manage', 'people.view', 'people.approve', 'people.roles', 'people.family',
                               'groups.manage', 'calendar.school', 'push.send', 'audit.view']
    when 'administrator' then array['people.view', 'people.approve', 'people.roles', 'people.family',
                                    'groups.manage', 'calendar.school', 'push.send', 'audit.view']
    when 'office' then array['people.view', 'people.approve', 'people.family', 'calendar.school', 'push.send', 'audit.view']
    else array[]::text[] end
$$;

/** Has the current session been verified with an authenticator app (or is that not required)? */
create function app.mfa_ok() returns boolean
language sql stable as $$
  select coalesce(app.setting('require_admin_mfa'), 'true') <> 'true'
      or coalesce(auth.jwt()->>'aal', '') = 'aal2'
$$;

/**
 * Effective permissions. For the signed-in person they only apply in an
 * MFA-verified session; when the server evaluates someone else (rule sync,
 * permission checks for another user) they apply as granted.
 */
create function app.permissions(u uuid default auth.uid()) returns text[]
language plpgsql stable security definer set search_path = public as $$
declare tier text; extra text[]; role text;
begin
  select admin_tier, permissions, school_role into tier, extra, role from profiles where id = u;
  if role is null then return array[]::text[]; end if;
  if u = auth.uid() and not app.mfa_ok() then return array[]::text[]; end if;
  return array(select distinct x from unnest(app.tier_permissions(tier) || array_remove(extra, 'admins.manage')) x);
end $$;

create function app.has_permission(p text, u uuid default auth.uid()) returns boolean
language sql stable as $$ select p = any (app.permissions(u)) $$;

/** Raise unless the signed-in person has a permission (and has verified with MFA if they're an admin). */
create function app.require_permission(p text) returns void
language plpgsql stable security definer set search_path = public as $$
declare tier text; extra text[];
begin
  if app.has_permission(p) then return; end if;
  select admin_tier, permissions into tier, extra from profiles where id = auth.uid();
  if (p = any (app.tier_permissions(tier)) or p = any (extra)) and not app.mfa_ok() then
    raise exception 'MFA_REQUIRED: Verify with your authenticator app to use admin tools.' using errcode = '42501';
  end if;
  raise exception 'You don''t have permission to do that.' using errcode = '42501';
end $$;

-- "Admin" now means "manages every group"; school_role 'admin' is only a label.
create or replace function app.is_admin(u uuid default auth.uid()) returns boolean
language sql stable as $$ select app.has_permission('groups.manage', u) $$;

create or replace function app.effective_role(g uuid, u uuid default auth.uid()) returns text
language plpgsql stable security definer set search_path = public as $$
declare sr text; r text; vis text;
begin
  sr := app.school_role(u);
  if sr is null then return null; end if;            -- signed out or awaiting approval
  if app.has_permission('groups.manage', u) then return 'owner'; end if;
  select role into r from memberships where group_id = g and user_id = u;
  if r is not null then return r; end if;
  select settings->>'visibility' into vis from groups where id = g;
  if vis in ('public', 'school') then return 'subscriber'; end if;
  return null;
end $$;

-- Policies that used the old blanket admin check.
drop policy "own or admin" on public.profile_private;
create policy "own, or people with people.view" on public.profile_private for select to authenticated
  using (id = auth.uid() or app.has_permission('people.view'));

drop policy "moderators" on public.audit_log;
create policy "activity log: group moderators, audit.view" on public.audit_log for select to authenticated
  using (app.has_permission('audit.view') or (group_id is not null and app.is_moderator(group_id)));

drop policy "calendar editors can insert" on public.events;
drop policy "calendar editors can update" on public.events;
drop policy "calendar editors can delete" on public.events;
create function app.can_edit_calendar(g uuid) returns boolean
language sql stable as $$
  select case when g is null then app.has_permission('calendar.school') else app.is_moderator(g) end
$$;
create policy "calendar editors can insert" on public.events for insert to authenticated
  with check (app.can_edit_calendar(group_id));
create policy "calendar editors can update" on public.events for update to authenticated
  using (app.can_edit_calendar(group_id)) with check (app.can_edit_calendar(group_id));
create policy "calendar editors can delete" on public.events for delete to authenticated
  using (app.can_edit_calendar(group_id));

-- ======================================================================
-- Admin API (replaces the single-admin versions)
-- ======================================================================

drop function public.admin_list_people();
drop function public.admin_update_profile(uuid, text, int, text, text);
drop function app.require_admin();

/** The signed-in person's access, for the app to show the right tools. */
create function public.my_access() returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'tier', p.admin_tier,
    'granted', p.permissions,
    'permissions', app.permissions(),
    'mfaRequired', coalesce(app.setting('require_admin_mfa'), 'true') = 'true'
                   and (p.admin_tier is not null or cardinality(p.permissions) > 0),
    'mfaVerified', app.mfa_ok() and coalesce(app.setting('require_admin_mfa'), 'true') = 'true')
  from profiles p where p.id = auth.uid()
$$;

create function public.admin_list_people() returns table (
  id uuid, first_name text, last_name text, school_role text, grade int, email text,
  admin_tier text, permissions text[], created_at timestamptz
)
language plpgsql stable security definer set search_path = public as $$
begin
  perform app.require_permission('people.view');
  return query
    select p.id, p.first_name, p.last_name, p.school_role, p.grade, pp.email, p.admin_tier, p.permissions, p.created_at
    from profiles p left join profile_private pp on pp.id = p.id
    order by p.school_role nulls first, p.last_name, p.first_name;
end $$;

/** Approve a sign-up, change someone's school role, or set a student's grade. */
create function public.admin_update_profile(
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
    elsif cur.school_role is null and p_role in ('parent', 'student') then
      perform app.require_permission('people.approve');
    else
      perform app.require_permission('people.roles');
    end if;
    if cur.admin_tier = 'director' then raise exception 'Transfer the director role before changing the director''s access.'; end if;
  end if;
  if p_grade is distinct from cur.grade then perform app.require_permission('people.family'); end if;
  update profiles set school_role = p_role, grade = p_grade,
         first_name = coalesce(p_first, first_name), last_name = coalesce(p_last, last_name),
         -- Losing access also removes admin powers.
         admin_tier = case when p_role is null or p_role in ('parent', 'student') then null else admin_tier end,
         permissions = case when p_role is null then '{}' else permissions end
   where id = p_user;
  perform app.audit(null, 'profile.updated', p_user::text, jsonb_build_object('role', p_role, 'grade', p_grade));
end $$;

/** Director only: set someone's admin tier and extra permissions. */
create function public.admin_set_access(p_user uuid, p_tier text, p_permissions text[] default '{}') returns void
language plpgsql security definer set search_path = public as $$
declare cur profiles%rowtype; bad text;
begin
  perform app.require_permission('admins.manage');
  select * into cur from profiles where id = p_user;
  if not found then raise exception 'No such person.'; end if;
  if cur.admin_tier = 'director' then raise exception 'Use "transfer director" to change the director.'; end if;
  if p_tier = 'director' then raise exception 'Use "transfer director" to name a new director.'; end if;
  if p_tier is not null and coalesce(cur.school_role, '') not in ('admin', 'teacher', 'staff') then
    raise exception 'Admin tiers are for staff accounts. Change their role to staff first.';
  end if;
  if cur.school_role is null or (cur.school_role = 'student' and cardinality(coalesce(p_permissions, '{}')) > 0) then
    raise exception 'Students and unapproved accounts can''t be given admin permissions.';
  end if;
  select x into bad from unnest(coalesce(p_permissions, '{}')) x
  where x = 'admins.manage' or x not in (select key from permission_catalog()) limit 1;
  if bad is not null then raise exception 'Permission "%" can''t be granted.', bad; end if;
  update profiles set admin_tier = p_tier, permissions = coalesce(p_permissions, '{}') where id = p_user;
  perform app.audit(null, 'access.updated', p_user::text, jsonb_build_object('tier', p_tier, 'permissions', p_permissions));
end $$;

/** Director only: hand the director role to another staff member (you become an administrator). */
create function public.transfer_director(p_user uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  perform app.require_permission('admins.manage');
  if (select admin_tier from profiles where id = auth.uid()) is distinct from 'director' then
    raise exception 'Only the director can transfer the role.';
  end if;
  if coalesce((select school_role from profiles where id = p_user), '') not in ('admin', 'teacher', 'staff') then
    raise exception 'The new director must be a staff account.';
  end if;
  update profiles set admin_tier = 'administrator' where id = auth.uid();
  update profiles set admin_tier = 'director', school_role = 'admin' where id = p_user;
  perform app.audit(null, 'director.transferred', p_user::text);
end $$;

/** Setup only (not callable from the app): name the first director by email. */
create function app.bootstrap_director(p_email text) returns void
language plpgsql security definer set search_path = public as $$
declare uid uuid;
begin
  select id into uid from profile_private where lower(email) = lower(p_email);
  if uid is null then raise exception 'No account with email %; sign in once first.', p_email; end if;
  update profiles set admin_tier = null where admin_tier = 'director' and id <> uid;
  update profiles set admin_tier = 'director', school_role = 'admin' where id = uid;
end $$;

create or replace function public.admin_link_guardian(p_guardian uuid, p_student uuid, p_link boolean default true) returns void
language plpgsql security definer set search_path = public as $$
begin
  perform app.require_permission('people.family');
  if p_link then insert into guardians values (p_guardian, p_student) on conflict do nothing;
  else delete from guardians where guardian_id = p_guardian and student_id = p_student; end if;
  perform app.audit(null, case when p_link then 'family.linked' else 'family.unlinked' end, p_guardian::text,
                    jsonb_build_object('student', p_student));
end $$;

create or replace function public.admin_set_roster(p_roster text, p_kind text, p_name text, p_lead uuid default null) returns void
language plpgsql security definer set search_path = public as $$
begin
  perform app.require_permission('people.family');
  insert into rosters values (p_roster, p_kind, p_name, p_lead)
  on conflict (id) do update set kind = excluded.kind, name = excluded.name, lead_id = excluded.lead_id;
end $$;

create or replace function public.admin_roster_member(p_roster text, p_user uuid, p_add boolean default true) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not (app.has_permission('people.family') or exists (select 1 from rosters where id = p_roster and lead_id = auth.uid())) then
    raise exception 'Only family/roster admins or the roster''s teacher/coach can change it.' using errcode = '42501';
  end if;
  if p_add then insert into roster_members values (p_roster, p_user) on conflict do nothing;
  else delete from roster_members where roster_id = p_roster and profile_id = p_user; end if;
end $$;

-- Admins can't silently lose the director role through the old function.
create or replace function public.update_my_profile(p_first text, p_last text, p_avatar text default null) returns void
language sql security definer set search_path = public as $$
  update profiles set first_name = p_first, last_name = p_last, avatar_url = coalesce(p_avatar, avatar_url) where id = auth.uid()
$$;

-- ======================================================================
-- Push notifications
-- ======================================================================

create table public.push_tokens (
  token      text primary key,
  user_id    uuid not null references public.profiles (id) on delete cascade,
  platform   text,
  updated_at timestamptz not null default now()
);
create index on public.push_tokens (user_id);
alter table public.push_tokens enable row level security;
create policy "own devices" on public.push_tokens for select to authenticated using (user_id = auth.uid());

/** In-app inbox + delivery queue. A row per notification; recipients are computed when sending. */
create table public.notifications (
  id         uuid primary key default gen_random_uuid(),
  audience   text not null check (audience in ('group', 'everyone', 'roles')),
  group_id   uuid references public.groups (id) on delete cascade,
  roles      text[],
  post_id    uuid references public.posts (id) on delete cascade,
  title      text not null,
  body       text not null,
  data       jsonb not null default '{}',
  urgent     boolean not null default false,  -- announcements: ignore "mentions only" preferences
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  status     text not null default 'queued' check (status in ('queued', 'sending', 'sent', 'failed')),
  sent_count int not null default 0,
  error      text,
  check (audience <> 'group' or group_id is not null)
);
create index on public.notifications (created_at desc);
alter table public.notifications enable row level security;

/** Is this person among a notification's recipients? */
create function app.notification_for(n public.notifications, u uuid) returns boolean
language plpgsql stable security definer set search_path = public as $$
declare pref text; sr text;
begin
  sr := app.school_role(u);
  if sr is null or u = n.created_by then return false; end if;
  if n.audience = 'everyone' then return true; end if;
  if n.audience = 'roles' then return sr = any (n.roles); end if;
  if not app.can_view_content(n.group_id, u) then return false; end if;
  select notification into pref from memberships where group_id = n.group_id and user_id = u;
  if not found then return false; end if;  -- only members get group pushes
  pref := coalesce(pref, (select settings->>'notificationDefault' from groups where id = n.group_id), 'all');
  return pref = 'all' or (n.urgent and pref <> 'none');
end $$;

create policy "my notifications" on public.notifications for select to authenticated
  using (app.notification_for(notifications, auth.uid()) or created_by = auth.uid() or app.has_permission('push.send'));

/** Devices to deliver a notification to (used by the send-push Edge Function). */
create function app.push_targets(p_notification uuid) returns table (token text, user_id uuid)
language sql stable security definer set search_path = public as $$
  select t.token, t.user_id
  from notifications n, push_tokens t
  where n.id = p_notification and app.notification_for(n, t.user_id)
$$;
revoke all on function app.push_targets(uuid) from public, anon, authenticated;
grant execute on function app.push_targets(uuid) to service_role;
-- Expose to the service role through PostgREST.
create function public.push_targets(p_notification uuid) returns table (token text, user_id uuid)
language sql stable security definer set search_path = public as $$ select * from app.push_targets(p_notification) $$;
revoke all on function public.push_targets(uuid) from public, anon, authenticated;
grant execute on function public.push_targets(uuid) to service_role;

/** Ask the send-push Edge Function to deliver queued notifications (no-op until it's deployed). */
create function app.kick_push() returns trigger
language plpgsql security definer set search_path = public as $$
declare url text := app.setting('functions_url');
begin
  if url is not null then
    begin
      perform net.http_post(url := url || '/send-push', body := jsonb_build_object('id', new.id),
                            headers := '{"Content-Type": "application/json"}'::jsonb);
    exception when others then
      raise warning 'push kick failed: %', sqlerrm;
    end;
  end if;
  return new;
end $$;
create trigger deliver after insert on public.notifications for each row execute function app.kick_push();

/** New published posts notify the group (announcements override "mentions only"). */
create function app.notify_post() returns trigger
language plpgsql security definer set search_path = public as $$
declare g groups%rowtype; who text;
begin
  if new.status <> 'published' or (tg_op = 'UPDATE' and old.status = 'published') then return new; end if;
  select * into g from groups where id = new.group_id;
  select nullif(trim(first_name || ' ' || last_name), '') into who from profiles where id = new.author_id;
  insert into notifications (audience, group_id, post_id, title, body, data, urgent, created_by)
  values ('group', new.group_id, new.id,
          g.icon || ' ' || g.name,
          coalesce(who || ': ', '') || left(coalesce(nullif(new.title, ''), new.body), 160),
          jsonb_build_object('groupId', new.group_id, 'postId', new.id),
          new.kind = 'announcement',
          new.author_id);
  return new;
end $$;
create trigger notify_post after insert or update of status on public.posts
  for each row execute function app.notify_post();

create function public.register_push_token(p_token text, p_platform text) returns void
language sql security definer set search_path = public as $$
  insert into push_tokens (token, user_id, platform) values (p_token, auth.uid(), p_platform)
  on conflict (token) do update set user_id = auth.uid(), platform = excluded.platform, updated_at = now()
$$;

create function public.unregister_push_token(p_token text) returns void
language sql security definer set search_path = public as $$
  delete from push_tokens where token = p_token and user_id = auth.uid()
$$;

/** Per-group notification preference. */
create function public.set_notification_pref(p_group uuid, p_pref text) returns void
language sql security definer set search_path = public as $$
  update memberships set notification = p_pref where group_id = p_group and user_id = auth.uid()
$$;

/** Admins (push.send) or a group's moderators send a notification. */
create function public.send_notification(
  p_title text, p_body text, p_audience text, p_group uuid default null, p_roles text[] default null
) returns public.notifications
language plpgsql security definer set search_path = public as $$
declare row notifications%rowtype;
begin
  if coalesce(trim(p_title), '') = '' or coalesce(trim(p_body), '') = '' then raise exception 'Add a title and a message.'; end if;
  if not (app.has_permission('push.send') or (p_audience = 'group' and app.is_moderator(p_group))) then
    perform app.require_permission('push.send');
  end if;
  insert into notifications (audience, group_id, roles, title, body, data, urgent, created_by)
  values (p_audience, p_group, p_roles, trim(p_title), trim(p_body),
          case when p_group is null then '{}'::jsonb else jsonb_build_object('groupId', p_group) end, true, auth.uid())
  returning * into row;
  perform app.audit(p_group, 'notification.sent', row.id::text, jsonb_build_object('audience', p_audience, 'roles', p_roles, 'title', p_title));
  return row;
end $$;

-- ======================================================================
-- Privileges for the new objects
-- ======================================================================

revoke all on all functions in schema public from public, anon;
revoke all on all functions in schema app from public, anon;
grant execute on all functions in schema public to authenticated, service_role;
grant execute on all functions in schema app to authenticated, service_role;
revoke execute on function app.bootstrap_director(text) from authenticated;
revoke execute on function app.push_targets(uuid) from authenticated;
revoke execute on function public.push_targets(uuid) from authenticated;
grant execute on function app.can_view_content(uuid, uuid) to anon;
grant execute on function app.effective_role(uuid, uuid) to anon;
grant execute on function app.school_role(uuid) to anon;
grant execute on function app.audience_includes(text, text) to anon;
grant execute on function app.role_rank(text) to anon;
grant execute on function app.audience_rank(text) to anon;
grant execute on function app.has_permission(text, uuid) to anon;
grant execute on function app.permissions(uuid) to anon;
grant execute on function app.mfa_ok() to anon;
grant execute on function app.setting(text) to anon;
grant execute on function app.tier_permissions(text) to anon;
grant execute on function app.can_edit_calendar(uuid) to anon;

revoke insert, update, delete on public.push_tokens, public.notifications from anon, authenticated;
grant select on public.push_tokens, public.notifications to authenticated;
grant all on public.push_tokens, public.notifications to service_role;
grant all on all tables in schema app to service_role;

alter publication supabase_realtime add table public.notifications;
