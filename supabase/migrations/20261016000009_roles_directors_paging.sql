-- Admin roles that directors create, several directors (never zero), and a
-- paged, searchable people list for the admin portal.
--
-- profiles.admin_tier now points at admin_roles.id. "director" is a built-in
-- role with every permission; "administrator" and "office" are starting
-- roles directors can edit or delete, and directors can add their own (for
-- example "Athletics Director" with calendar + notifications).

-- ======================================================================
-- Roles
-- ======================================================================

create table public.admin_roles (
  id          text primary key,
  name        text not null unique,
  description text not null default '',
  permissions text[] not null default '{}',
  is_system   boolean not null default false,   -- director: can't be edited or deleted
  created_at  timestamptz not null default now()
);
alter table public.admin_roles enable row level security;
create policy "approved users can read roles" on public.admin_roles for select to authenticated
  using (app.school_role() is not null);
grant select on public.admin_roles to authenticated;
revoke insert, update, delete on public.admin_roles from anon, authenticated;

insert into public.admin_roles (id, name, description, permissions, is_system) values
  ('director', 'Director', 'Runs the school''s account: every permission, and manages admins and roles.',
   array['admins.manage', 'people.view', 'people.approve', 'people.roles', 'people.family', 'groups.manage',
         'calendar.school', 'push.send', 'audit.view'], true),
  ('administrator', 'Administrator', 'Everything except managing admins and roles.',
   array['people.view', 'people.approve', 'people.roles', 'people.family', 'groups.manage', 'calendar.school',
         'push.send', 'audit.view'], false),
  ('office', 'Office', 'Front office: approvals, families, school calendar, notifications, activity log.',
   array['people.view', 'people.approve', 'people.family', 'calendar.school', 'push.send', 'audit.view'], false)
on conflict (id) do nothing;

alter table public.profiles drop constraint if exists profiles_admin_tier_check;
alter table public.profiles add constraint profiles_admin_tier_fkey
  foreign key (admin_tier) references public.admin_roles (id) on update cascade on delete set null;

-- Several directors are allowed …
drop index if exists public.profiles_one_director;

create or replace function app.tier_permissions(tier text) returns text[]
language sql stable security definer set search_path = public as $$
  select coalesce((select permissions from admin_roles where id = tier), array[]::text[])
$$;

-- … but never zero: block demoting, revoking or deleting the last one.
create function app.keep_a_director() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if old.admin_tier = 'director'
     and (tg_op = 'DELETE' or new.admin_tier is distinct from 'director' or new.school_role is null)
     and not exists (select 1 from profiles
                     where admin_tier = 'director' and school_role is not null and id <> old.id) then
    raise exception 'There must always be at least one director. Make someone else a director first.'
      using errcode = '42501';
  end if;
  return coalesce(new, old);
end $$;
create trigger keep_a_director before update of admin_tier, school_role or delete on public.profiles
  for each row execute function app.keep_a_director();

/** Director only: create or update a role. */
create function public.admin_save_role(p_id text, p_name text, p_description text, p_permissions text[])
returns public.admin_roles
language plpgsql security definer set search_path = public as $$
declare rid text; bad text; row admin_roles%rowtype;
begin
  perform app.require_permission('admins.manage');
  if coalesce(trim(p_name), '') = '' then raise exception 'Give the role a name.'; end if;
  select x into bad from unnest(coalesce(p_permissions, '{}')) x
  where x = 'admins.manage' or x not in (select key from permission_catalog()) limit 1;
  if bad is not null then raise exception 'Permission "%" can''t be given to a role.', bad; end if;
  if p_id is not null and (select is_system from admin_roles where id = p_id) then
    raise exception 'The Director role can''t be changed.';
  end if;
  rid := coalesce(p_id, trim(both '-' from regexp_replace(lower(trim(p_name)), '[^a-z0-9]+', '-', 'g')));
  if rid = '' then rid := 'role-' || substr(md5(random()::text), 1, 6); end if;
  if p_id is null and exists (select 1 from admin_roles where id = rid) then
    rid := rid || '-' || substr(md5(random()::text), 1, 4);
  end if;
  insert into admin_roles (id, name, description, permissions)
  values (rid, trim(p_name), coalesce(trim(p_description), ''), coalesce(p_permissions, '{}'))
  on conflict (id) do update set name = excluded.name, description = excluded.description, permissions = excluded.permissions
  returning * into row;
  perform app.audit(null, case when p_id is null then 'role.created' else 'role.updated' end, rid,
                    jsonb_build_object('name', p_name, 'permissions', p_permissions));
  return row;
exception when unique_violation then
  raise exception 'A role named "%" already exists.', trim(p_name);
end $$;

/** Director only: delete a role; people who had it lose that admin access. */
create function public.admin_delete_role(p_id text) returns void
language plpgsql security definer set search_path = public as $$
begin
  perform app.require_permission('admins.manage');
  if (select is_system from admin_roles where id = p_id) then raise exception 'The Director role can''t be deleted.'; end if;
  delete from admin_roles where id = p_id;
  perform app.audit(null, 'role.deleted', p_id);
end $$;

-- ======================================================================
-- Directors
-- ======================================================================

/** Director only: give someone a role (not director) and extra permissions. */
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
  if cur.school_role is null or (cur.school_role = 'student' and cardinality(coalesce(p_permissions, '{}')) > 0) then
    raise exception 'Students and unapproved accounts can''t be given admin permissions.';
  end if;
  select x into bad from unnest(coalesce(p_permissions, '{}')) x
  where x = 'admins.manage' or x not in (select key from permission_catalog()) limit 1;
  if bad is not null then raise exception 'Permission "%" can''t be granted.', bad; end if;
  update profiles set admin_tier = p_tier, permissions = coalesce(p_permissions, '{}') where id = p_user;
  perform app.audit(null, 'access.updated', p_user::text, jsonb_build_object('role', p_tier, 'permissions', p_permissions));
end $$;

/**
 * Director only: make a staff member a director, or remove someone's director
 * role (they become an administrator). Directors can step down themselves as
 * long as another director remains.
 */
create function public.admin_set_director(p_user uuid, p_director boolean) returns void
language plpgsql security definer set search_path = public as $$
declare cur profiles%rowtype;
begin
  perform app.require_permission('admins.manage');
  select * into cur from profiles where id = p_user;
  if not found then raise exception 'No such person.'; end if;
  if p_director then
    if coalesce(cur.school_role, '') not in ('admin', 'teacher', 'staff') then
      raise exception 'Directors must be staff accounts. Change their school role to staff first.';
    end if;
    update profiles set admin_tier = 'director', school_role = 'admin' where id = p_user;
    perform app.audit(null, 'director.added', p_user::text);
  elsif cur.admin_tier = 'director' then
    update profiles set admin_tier = 'administrator' where id = p_user;   -- keep_a_director guards the last one
    perform app.audit(null, 'director.removed', p_user::text);
  end if;
end $$;

/** Hand over: make someone director, then step down yourself. */
create or replace function public.transfer_director(p_user uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if (select admin_tier from profiles where id = auth.uid()) is distinct from 'director' then
    raise exception 'Only a director can hand over the role.';
  end if;
  perform public.admin_set_director(p_user, true);
  perform public.admin_set_director(auth.uid(), false);
end $$;

/** Setup / emergency recovery only (not callable from the app): add a director by email. */
create or replace function app.bootstrap_director(p_email text) returns void
language plpgsql security definer set search_path = public as $$
declare uid uuid;
begin
  select id into uid from profile_private where lower(email) = lower(p_email);
  if uid is null then raise exception 'No account with email %; sign in once first.', p_email; end if;
  update profiles set admin_tier = 'director', school_role = 'admin' where id = uid;
end $$;

create or replace function public.my_access() returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'tier', p.admin_tier,
    'roleName', r.name,
    'isDirector', p.admin_tier = 'director',
    'granted', p.permissions,
    'permissions', app.permissions(),
    'mfaRequired', coalesce(app.setting('require_admin_mfa'), 'true') = 'true'
                   and (p.admin_tier is not null or cardinality(p.permissions) > 0),
    'mfaVerified', app.mfa_ok() and coalesce(app.setting('require_admin_mfa'), 'true') = 'true')
  from profiles p left join admin_roles r on r.id = p.admin_tier
  where p.id = auth.uid()
$$;

-- ======================================================================
-- Paged people list
-- ======================================================================

drop function public.admin_list_people();

/**
 * People for the admin portal, a page at a time. p_filter: all | pending |
 * staff | parents | students | admins. Every row carries the total match count.
 */
create function public.admin_list_people(
  p_search text default null, p_filter text default 'all', p_limit int default 25, p_offset int default 0
) returns table (
  id uuid, first_name text, last_name text, school_role text, grade int, email text,
  admin_tier text, permissions text[], created_at timestamptz, total bigint
)
language plpgsql stable security definer set search_path = public as $$
declare term text := '%' || lower(coalesce(trim(p_search), '')) || '%';
begin
  perform app.require_permission('people.view');
  return query
    select p.id, p.first_name, p.last_name, p.school_role, p.grade, pp.email, p.admin_tier, p.permissions, p.created_at,
           count(*) over () as total
    from profiles p left join profile_private pp on pp.id = p.id
    where (lower(p.first_name || ' ' || p.last_name || ' ' || coalesce(pp.email, '')) like term)
      and case coalesce(p_filter, 'all')
            when 'pending'  then p.school_role is null
            when 'staff'    then p.school_role in ('admin', 'teacher', 'staff')
            when 'parents'  then p.school_role = 'parent'
            when 'students' then p.school_role = 'student'
            when 'admins'   then p.admin_tier is not null or cardinality(p.permissions) > 0
            else true end
    order by (p.school_role is null) desc, (p.admin_tier = 'director') desc, p.last_name, p.first_name, p.id
    limit greatest(1, least(coalesce(p_limit, 25), 100)) offset greatest(0, coalesce(p_offset, 0));
end $$;

-- ======================================================================
-- Privileges for the new and replaced functions
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
grant all on public.admin_roles to service_role;
