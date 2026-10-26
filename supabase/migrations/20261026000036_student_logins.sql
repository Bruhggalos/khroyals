-- Student logins: a child added by the office has no login; their parents (or the office) can give
-- them one when they're ready, by adding the child's email. The student-login Edge Function checks
-- with student_login_request, then creates the login with the child's own profile id, so
-- everything already tied to the child (parents, classes, activities, car line) carries over. The
-- child signs in with that email like anyone else (a 6-digit code). student_login_remove takes the
-- login away again; the child stays on the roster.

create table public.student_logins (
  student_id  uuid primary key references public.profiles (id) on delete cascade,
  email       text not null unique,
  invited_by  uuid references public.profiles (id) on delete set null,
  invited_at  timestamptz not null default now()
);
alter table public.student_logins enable row level security;
create policy "the child's parents and the office" on public.student_logins for select to authenticated
  using (app.can_manage_child(student_id));

/** Parents of the child, or people.family (with the authenticator), may give or take a login. */
create function app.require_login_manager(p_student uuid) returns void
language plpgsql stable security definer set search_path = public as $$
begin
  if app.is_guardian_of(p_student) then return; end if;
  perform app.require_permission('people.family');
end $$;

/**
 * Before the student-login function creates the login: may the caller give this child one, with
 * this email? Records it and returns the child's name for the login.
 */
create function public.student_login_request(p_student uuid, p_email text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare kid profiles%rowtype; mail text := lower(trim(coalesce(p_email, '')));
begin
  perform app.require_login_manager(p_student);
  select * into kid from profiles where id = p_student;
  if not found or kid.school_role is distinct from 'student' then raise exception 'That isn''t a student.'; end if;
  if not kid.managed then raise exception '% already has a login.', kid.first_name; end if;
  if mail !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then raise exception 'Enter the email address % will sign in with.', kid.first_name; end if;
  if exists (select 1 from auth.users where lower(email) = mail) then
    raise exception 'That email already has a KH Royals account. Use a different one for %.', kid.first_name;
  end if;
  if exists (select 1 from student_logins where email = mail and student_id <> p_student) then
    raise exception 'That email is already set up for another student.';
  end if;
  insert into student_logins (student_id, email, invited_by) values (p_student, mail, auth.uid())
  on conflict (student_id) do update set email = excluded.email, invited_by = excluded.invited_by, invited_at = now();
  perform app.audit(null, 'student.login_requested', p_student::text, jsonb_build_object('email', mail));
  return jsonb_build_object('studentId', p_student, 'email', mail, 'firstName', kid.first_name, 'lastName', kid.last_name);
end $$;

/** The child's login: their email, and when they last signed in (null = not yet). Parents and the office. */
create function public.student_login_status(p_student uuid) returns jsonb
language sql stable security definer set search_path = public as $$
  select case when app.can_manage_child(p_student) then (
    select jsonb_build_object('email', coalesce(l.email, u.email), 'invitedAt', l.invited_at,
                              'hasLogin', u.id is not null, 'signedInAt', u.last_sign_in_at)
    from (select p_student as id) s
    left join student_logins l on l.student_id = s.id
    left join auth.users u on u.id = s.id
    where l.student_id is not null or u.id is not null)
  end
$$;

/** Take a child's login away: they can't sign in anymore, but stay on the roster with their parents. */
create function public.student_login_remove(p_student uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  perform app.require_login_manager(p_student);
  if not exists (select 1 from profiles where id = p_student and school_role = 'student') then
    raise exception 'That isn''t a student.';
  end if;
  update profiles set managed = true where id = p_student;   -- so deleting the login keeps the profile
  delete from push_tokens where user_id = p_student;
  delete from auth.users where id = p_student;
  delete from student_logins where student_id = p_student;
  update profile_private set email = null where id = p_student;
  perform app.audit(null, 'student.login_removed', p_student::text);
end $$;

-- A new login with a child's id is that child's: keep their profile, mark it as having a login,
-- and email them how to sign in. Everyone else gets a fresh profile, as before.
create or replace function app.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
declare kid profiles%rowtype;
begin
  select * into kid from profiles where id = new.id;
  if found then
    update profiles set managed = false where id = new.id;
    insert into profile_private (id, email) values (new.id, new.email) on conflict (id) do update set email = excluded.email;
    insert into app.email_queue (to_email, subject, body) values (new.email,
      'Your KH Royals login is ready',
      concat_ws(E'\n\n',
        'Hi ' || trim(kid.first_name) || ',',
        'Your family set up Royals Connect for you: Kingdom Heights'' school app, with your classes, assignments, activities and school news.',
        'To sign in, open the KH Royals app (or https://royalrockinapps.github.io/khroyals/), tap Log in, and enter this email address: '
          || new.email || '. We''ll email you a 6-digit code. There''s no password to remember.',
        'Kingdom Heights Preparatory School'));
    return new;
  end if;
  insert into profiles (id, first_name, last_name)
  values (new.id, coalesce(new.raw_user_meta_data->>'first_name', ''), coalesce(new.raw_user_meta_data->>'last_name', ''));
  insert into profile_private (id, email) values (new.id, new.email);
  return new;
end $$;

revoke all on function app.require_login_manager(uuid) from public, anon;
grant execute on function app.require_login_manager(uuid) to authenticated, service_role;
revoke all on function public.student_login_request(uuid, text), public.student_login_status(uuid), public.student_login_remove(uuid) from public, anon;
grant execute on function public.student_login_request(uuid, text), public.student_login_status(uuid), public.student_login_remove(uuid)
  to authenticated, service_role;

-- Reads go through row-level security; writes only through the functions above (and the Edge Function).
revoke all on public.student_logins from anon;
revoke insert, update, delete on public.student_logins from authenticated;
grant select on public.student_logins to authenticated;
grant all on public.student_logins to service_role;
