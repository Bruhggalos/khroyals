-- Deleting accounts: a people.delete admin permission (directors get it; they can give it to
-- other roles or people) and admin_delete_user, which removes the login, the profile and what
-- the person posted. Directors can't be deleted (remove the director role first), and deleting
-- anyone with admin powers also needs admins.manage.

-- ======================================================================
-- The people.delete admin permission (directors get it)
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
    ('forms.send',       'Send forms',            'Send forms (permission slips, releases, acknowledgments) to any class, activity, grade or the whole school, and see every form''s signatures.'),
    ('people.delete',    'Delete accounts',       'Permanently delete someone''s account, with their posts and comments. Deleting an admin also needs Manage admins.'),
    ('audit.view',       'Activity log',          'Review the school-wide activity log.')
$$;

update public.admin_roles set permissions = permissions || 'people.delete'::text
where id = 'director' and not ('people.delete' = any (permissions));

-- ======================================================================
-- admin_delete_user
-- ======================================================================

/** people.delete: permanently delete someone's account and what they posted. */
create function public.admin_delete_user(p_user uuid) returns void
language plpgsql security definer set search_path = public as $$
declare who profiles%rowtype; login_email text;
begin
  perform app.require_permission('people.delete');
  if p_user = auth.uid() then raise exception 'You can''t delete your own account here.'; end if;
  select * into who from profiles where id = p_user;
  if not found then raise exception 'No such person.'; end if;
  if who.managed then raise exception 'Children are removed from the Students list, not deleted as accounts.'; end if;
  if who.admin_tier = 'director' then
    raise exception 'Directors can''t be deleted. Remove their director role first.' using errcode = '42501';
  end if;
  if (who.admin_tier is not null or coalesce(cardinality(who.permissions), 0) > 0)
     and not app.has_permission('admins.manage') then
    raise exception 'Only someone who manages admins can delete an admin. Remove their admin access first.'
      using errcode = '42501';
  end if;

  select email into login_email from auth.users where id = p_user;
  perform app.audit(null, 'user.deleted', p_user::text, jsonb_build_object(
    'name', trim(coalesce(who.first_name, '') || ' ' || coalesce(who.last_name, '')),
    'email', login_email, 'role', who.school_role));

  -- What they wrote goes with them (the foreign keys would otherwise leave it unsigned,
  -- which reads as anonymous).
  delete from posts where id in (select post_id from app.anonymous_authors where author_id = p_user);
  delete from posts where author_id = p_user;
  delete from comments where author_id = p_user;

  delete from auth.users where id = p_user;   -- app.drop_profile_with_login removes the profile
  delete from profiles where id = p_user;     -- an account whose login is already gone
end $$;

revoke all on function public.admin_delete_user(uuid) from public, anon;
grant execute on function public.admin_delete_user(uuid) to authenticated, service_role;
