-- Children: students without their own login, managed by their parents.
--
-- The school adds children and links them to parents (any approved adult can
-- be a parent; every child is a student at the school). Parents can ask to add
-- a child or to change a child's name or grade; the school approves. Once
-- linked, parents keep the rest up to date themselves: photo, bio, birthday,
-- allergies and health notes.
--
-- A child is a profile with managed = true and no auth account, so everything
-- that already works for students (family links, car line, grade-based groups)
-- works for them. Their private details live in student_details, readable only
-- by their parents and school staff.
--
-- Grades move up by themselves: a student's class (graduation year) is stored,
-- and the grade follows from the school year (which starts July 1). K2 = -3,
-- K3 = -2, K4 = -1, Kindergarten = 0, then 1–12.

-- ======================================================================
-- Profiles without a login
-- ======================================================================

alter table public.profiles drop constraint if exists profiles_id_fkey;
alter table public.profiles alter column id set default gen_random_uuid();
alter table public.profiles
  add column managed  boolean not null default false,   -- a child with no login of their own
  add column class_of int;                                -- graduation year (students)

-- Deleting a login still removes its profile (the foreign key used to do this).
create function app.drop_profile_with_login() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  delete from profiles where id = old.id and not managed;
  return old;
end $$;
create trigger on_auth_user_deleted after delete on auth.users
  for each row execute function app.drop_profile_with_login();

-- ======================================================================
-- Grades that move up every year
-- ======================================================================

/** The calendar year a school year ends in (it starts July 1, Central time). */
create function app.school_year_end(d date default app.school_today()) returns int
language sql immutable as $$ select extract(year from d)::int + case when extract(month from d) >= 7 then 1 else 0 end $$;

create function app.grade_for_class(class_of int, d date default app.school_today()) returns int
language sql immutable as $$ select 12 - (class_of - app.school_year_end(d)) $$;

create function app.class_for_grade(grade int, d date default app.school_today()) returns int
language sql immutable as $$ select app.school_year_end(d) + (12 - grade) $$;

/** Keep grade and class in step: setting either one sets the other. */
create function app.sync_grade() returns trigger
language plpgsql as $$
begin
  if new.class_of is not null and (tg_op = 'INSERT' or new.class_of is distinct from old.class_of) then
    new.grade := app.grade_for_class(new.class_of);
  elsif new.grade is not null and (tg_op = 'INSERT' or new.grade is distinct from old.grade) then
    new.class_of := app.class_for_grade(new.grade);
  elsif new.grade is null and tg_op = 'UPDATE' and old.grade is not null and new.class_of is not distinct from old.class_of then
    new.class_of := null;
  end if;
  return new;
end $$;
create trigger sync_grade before insert or update of grade, class_of on public.profiles
  for each row execute function app.sync_grade();

update public.profiles set class_of = app.class_for_grade(grade) where grade is not null and class_of is null;

/** Move everyone to this school year's grade (run daily; a no-op except after July 1). */
create function app.refresh_grades() returns int
language plpgsql security definer set search_path = public as $$
declare n int;
begin
  update profiles set grade = app.grade_for_class(class_of)
  where class_of is not null and grade is distinct from app.grade_for_class(class_of);
  get diagnostics n = row_count;
  return n;
end $$;

-- Daily refresh where pg_cron exists (Supabase); the app also refreshes when it lists students.
do $$
begin
  if exists (select 1 from pg_available_extensions where name = 'pg_cron') then
    create extension if not exists pg_cron;
    perform cron.schedule('refresh-grades', '15 6 * * *', 'select app.refresh_grades()');
  end if;
exception when others then
  raise notice 'pg_cron not available: %', sqlerrm;
end $$;

/** "K2", "K", "3rd", "12th", or "Graduated". */
create function app.grade_label(g int) returns text
language sql immutable as $$
  select case
    when g is null then null
    when g <= -3 then 'K2' when g = -2 then 'K3' when g = -1 then 'K4' when g = 0 then 'Kindergarten'
    when g > 12 then 'Graduated'
    when g = 1 then '1st' when g = 2 then '2nd' when g = 3 then '3rd'
    else g || 'th' end
$$;

-- ======================================================================
-- Private details, editable by parents
-- ======================================================================

create table public.student_details (
  student_id    uuid primary key references public.profiles (id) on delete cascade,
  birthday      date,
  bio           text not null default '' check (char_length(bio) <= 500),
  allergies     text not null default '' check (char_length(allergies) <= 500),
  medical_notes text not null default '' check (char_length(medical_notes) <= 1000),
  updated_at    timestamptz not null default now(),
  updated_by    uuid references public.profiles (id) on delete set null
);
alter table public.student_details enable row level security;
create policy "parents and staff" on public.student_details for select to authenticated
  using (app.is_guardian_of(student_id) or app.is_staff());
grant select on public.student_details to authenticated;
revoke insert, update, delete on public.student_details from anon, authenticated;
grant all on public.student_details to service_role;

create function app.can_manage_child(s uuid, u uuid default auth.uid()) returns boolean
language sql stable security definer set search_path = public as $$
  select app.is_guardian_of(s, u) or app.has_permission('people.family', u)
$$;

/** Parents (or the office): a child's birthday, bio, allergies and health notes. */
create function public.update_child_details(
  p_student uuid, p_birthday date, p_bio text, p_allergies text, p_medical_notes text
) returns public.student_details
language plpgsql security definer set search_path = public as $$
declare row student_details%rowtype;
begin
  if not app.can_manage_child(p_student) then
    raise exception 'Only this child''s parents or the school office can change these details.' using errcode = '42501';
  end if;
  if p_birthday is not null and (p_birthday > current_date or p_birthday < current_date - interval '25 years') then
    raise exception 'Check the birthday.';
  end if;
  insert into student_details (student_id, birthday, bio, allergies, medical_notes, updated_by)
  values (p_student, p_birthday, coalesce(trim(p_bio), ''), coalesce(trim(p_allergies), ''), coalesce(trim(p_medical_notes), ''), auth.uid())
  on conflict (student_id) do update set birthday = excluded.birthday, bio = excluded.bio, allergies = excluded.allergies,
    medical_notes = excluded.medical_notes, updated_at = now(), updated_by = auth.uid()
  returning * into row;
  return row;
end $$;

-- Photos: avatars/children/<student id>/…, seen only by the child's parents and staff.
drop policy if exists "profile photos: members read" on storage.objects;
create policy "profile photos: members read" on storage.objects for select to authenticated
  using (bucket_id = 'avatars' and app.school_role() is not null and (storage.foldername(name))[1] <> 'children');

create function app.child_folder(name text) returns uuid
language sql immutable as $$
  select case when (storage.foldername(name))[1] = 'children'
               and (storage.foldername(name))[2] ~ '^[0-9a-f-]{36}$' then (storage.foldername(name))[2]::uuid end
$$;
create policy "child photos: parents and staff read" on storage.objects for select to authenticated
  using (bucket_id = 'avatars' and app.child_folder(name) is not null
         and (app.is_staff() or app.is_guardian_of(app.child_folder(name))));
create policy "child photos: parents upload" on storage.objects for insert to authenticated
  with check (bucket_id = 'avatars' and app.child_folder(name) is not null and app.can_manage_child(app.child_folder(name)));
create policy "child photos: parents delete" on storage.objects for delete to authenticated
  using (bucket_id = 'avatars' and app.child_folder(name) is not null and app.can_manage_child(app.child_folder(name)));

/** Set (a path in the child's photo folder) or clear (null) a child's photo. */
create function public.set_child_photo(p_student uuid, p_path text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not app.can_manage_child(p_student) then
    raise exception 'Only this child''s parents or the school office can change the photo.' using errcode = '42501';
  end if;
  if p_path is not null and app.child_folder(p_path) is distinct from p_student then
    raise exception 'That photo isn''t in this child''s folder.' using errcode = '42501';
  end if;
  update profiles set avatar_url = p_path where id = p_student and school_role = 'student';
end $$;

/** A parent's children: names, grade, photo path, details and the other parents. */
create function public.my_children() returns jsonb
language plpgsql security definer set search_path = public as $$
begin
  perform app.refresh_grades();
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', p.id, 'firstName', p.first_name, 'lastName', p.last_name, 'grade', p.grade, 'gradeLabel', app.grade_label(p.grade),
      'classOf', p.class_of, 'photoPath', p.avatar_url, 'hasLogin', not p.managed,
      'birthday', d.birthday, 'bio', coalesce(d.bio, ''), 'allergies', coalesce(d.allergies, ''), 'medicalNotes', coalesce(d.medical_notes, ''),
      'parents', (select coalesce(jsonb_agg(trim(q.first_name || ' ' || q.last_name) order by q.first_name), '[]'::jsonb)
                  from guardians g2 join profiles q on q.id = g2.guardian_id where g2.student_id = p.id))
      order by p.first_name)
    from guardians g join profiles p on p.id = g.student_id left join student_details d on d.student_id = p.id
    where g.guardian_id = auth.uid() and p.school_role = 'student'), '[]'::jsonb);
end $$;

-- ======================================================================
-- Requests the school approves
-- ======================================================================

create table public.family_requests (
  id            uuid primary key default gen_random_uuid(),
  requested_by  uuid not null references public.profiles (id) on delete cascade,
  kind          text not null check (kind in ('add_child', 'edit_child')),
  student_id    uuid references public.profiles (id) on delete cascade,   -- edit_child
  details       jsonb not null,           -- firstName, lastName, grade, birthday, note
  status        text not null default 'pending' check (status in ('pending', 'approved', 'declined', 'cancelled')),
  decided_by    uuid references public.profiles (id) on delete set null,
  decided_at    timestamptz,
  decision_note text,
  created_at    timestamptz not null default now(),
  check (kind = 'add_child' or student_id is not null)
);
create index on public.family_requests (status, created_at);
alter table public.family_requests enable row level security;
create policy "own requests, or the office" on public.family_requests for select to authenticated
  using (requested_by = auth.uid() or app.has_permission('people.family'));
grant select on public.family_requests to authenticated;
revoke insert, update, delete on public.family_requests from anon, authenticated;
grant all on public.family_requests to service_role;

create function app.check_child_fields(first text, last text, grade int) returns void
language plpgsql immutable as $$
begin
  if coalesce(trim(first), '') = '' or coalesce(trim(last), '') = '' then raise exception 'Enter the child''s first and last name.'; end if;
  if grade is null or grade < -3 or grade > 12 then raise exception 'Choose a grade from K2 to 12th.'; end if;
end $$;

/** Any approved adult: ask the school to add their child. */
create function public.request_child(p_first text, p_last text, p_grade int, p_birthday date default null, p_note text default null)
returns public.family_requests
language plpgsql security definer set search_path = public as $$
declare row family_requests%rowtype;
begin
  if coalesce(app.school_role(), 'student') = 'student' then
    raise exception 'Only approved parents and staff can add children.' using errcode = '42501';
  end if;
  perform app.check_child_fields(p_first, p_last, p_grade);
  insert into family_requests (requested_by, kind, details)
  values (auth.uid(), 'add_child', jsonb_build_object('firstName', trim(p_first), 'lastName', trim(p_last), 'grade', p_grade,
                                                     'birthday', p_birthday, 'note', nullif(trim(p_note), '')))
  returning * into row;
  return row;
end $$;

/** A child's parent: ask the school to change the child's name or grade. */
create function public.request_child_edit(p_student uuid, p_first text, p_last text, p_grade int, p_note text default null)
returns public.family_requests
language plpgsql security definer set search_path = public as $$
declare row family_requests%rowtype;
begin
  if not app.is_guardian_of(p_student) then raise exception 'Only this child''s parents can ask for changes.' using errcode = '42501'; end if;
  perform app.check_child_fields(p_first, p_last, p_grade);
  insert into family_requests (requested_by, kind, student_id, details)
  values (auth.uid(), 'edit_child', p_student, jsonb_build_object('firstName', trim(p_first), 'lastName', trim(p_last),
                                                                 'grade', p_grade, 'note', nullif(trim(p_note), '')))
  returning * into row;
  return row;
end $$;

create function public.cancel_family_request(p_request uuid) returns void
language sql security definer set search_path = public as $$
  update family_requests set status = 'cancelled' where id = p_request and requested_by = auth.uid() and status = 'pending'
$$;

-- ======================================================================
-- The office (people.family)
-- ======================================================================

/** Add a child (no login) and optionally link a parent. Returns the child's id. */
create function public.admin_create_student(
  p_first text, p_last text, p_grade int, p_birthday date default null, p_guardian uuid default null
) returns uuid
language plpgsql security definer set search_path = public as $$
declare sid uuid;
begin
  perform app.require_permission('people.family');
  perform app.check_child_fields(p_first, p_last, p_grade);
  insert into profiles (first_name, last_name, school_role, grade, managed)
  values (trim(p_first), trim(p_last), 'student', p_grade, true) returning id into sid;
  if p_birthday is not null then
    insert into student_details (student_id, birthday, updated_by) values (sid, p_birthday, auth.uid());
  end if;
  if p_guardian is not null then perform public.admin_link_guardian(p_guardian, sid, true); end if;
  perform app.audit(null, 'student.created', sid::text, jsonb_build_object('name', trim(p_first) || ' ' || trim(p_last), 'grade', p_grade));
  return sid;
end $$;

/** Change a student's name or grade. */
create function public.admin_update_student(p_student uuid, p_first text, p_last text, p_grade int) returns void
language plpgsql security definer set search_path = public as $$
begin
  perform app.require_permission('people.family');
  perform app.check_child_fields(p_first, p_last, p_grade);
  update profiles set first_name = trim(p_first), last_name = trim(p_last), grade = p_grade
  where id = p_student and school_role = 'student';
  if not found then raise exception 'No such student.'; end if;
  perform app.audit(null, 'student.updated', p_student::text, jsonb_build_object('grade', p_grade));
end $$;

/** Remove a child who has left the school (children with their own login are managed as accounts). */
create function public.admin_delete_student(p_student uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  perform app.require_permission('people.family');
  delete from profiles where id = p_student and managed;
  if not found then raise exception 'Only children without their own login can be removed here.'; end if;
  perform app.audit(null, 'student.removed', p_student::text);
end $$;

/** Link any approved adult to a student (or unlink). */
create or replace function public.admin_link_guardian(p_guardian uuid, p_student uuid, p_link boolean default true) returns void
language plpgsql security definer set search_path = public as $$
begin
  perform app.require_permission('people.family');
  if p_link then
    if coalesce(app.school_role(p_student), '') <> 'student' then raise exception 'Children must be students at the school.'; end if;
    if coalesce(app.school_role(p_guardian), 'student') = 'student' then
      raise exception 'Parents must be approved adults (not students).';
    end if;
    insert into guardians values (p_guardian, p_student) on conflict do nothing;
  else
    delete from guardians where guardian_id = p_guardian and student_id = p_student;
  end if;
  perform app.audit(null, case when p_link then 'family.linked' else 'family.unlinked' end, p_guardian::text,
                    jsonb_build_object('student', p_student));
end $$;

/** Pending requests from parents, newest last. */
create function public.admin_family_requests() returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  perform app.require_permission('people.family');
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', r.id, 'kind', r.kind, 'details', r.details, 'createdAt', r.created_at,
      'requestedBy', jsonb_build_object('id', p.id, 'name', trim(p.first_name || ' ' || p.last_name), 'role', p.school_role),
      'student', case when s.id is null then null else jsonb_build_object('id', s.id, 'firstName', s.first_name,
                   'lastName', s.last_name, 'grade', s.grade) end)
      order by r.created_at)
    from family_requests r join profiles p on p.id = r.requested_by left join profiles s on s.id = r.student_id
    where r.status = 'pending'), '[]'::jsonb);
end $$;

/**
 * Approve or decline a parent's request. Approving "add a child" creates the
 * student, or links the parent to an existing one (p_existing: e.g. the
 * other parent already added them). The parent is told either way.
 */
create function public.admin_decide_family_request(
  p_request uuid, p_approve boolean, p_existing uuid default null, p_note text default null
) returns uuid
language plpgsql security definer set search_path = public as $$
declare r family_requests%rowtype; sid uuid; d jsonb;
begin
  perform app.require_permission('people.family');
  select * into r from family_requests where id = p_request and status = 'pending' for update;
  if not found then raise exception 'That request was already handled.'; end if;
  d := r.details;
  if p_approve then
    if r.kind = 'add_child' then
      sid := coalesce(p_existing, public.admin_create_student(d->>'firstName', d->>'lastName', (d->>'grade')::int,
                                                               nullif(d->>'birthday', '')::date));
      perform public.admin_link_guardian(r.requested_by, sid, true);
    else
      sid := r.student_id;
      perform public.admin_update_student(sid, d->>'firstName', d->>'lastName', (d->>'grade')::int);
    end if;
  end if;
  update family_requests set status = case when p_approve then 'approved' else 'declined' end,
    decided_by = auth.uid(), decided_at = now(), decision_note = nullif(trim(p_note), ''),
    student_id = coalesce(sid, student_id)
  where id = r.id;
  perform app.notify_user(r.requested_by,
    case when p_approve then '✅ ' else '' end || case r.kind when 'add_child' then 'Adding ' else 'Changes for ' end
      || (d->>'firstName') || case when p_approve then ': approved' else ': not approved' end,
    coalesce(nullif(trim(p_note), ''), case when p_approve then 'The school office approved your request.'
                                            else 'The school office couldn''t approve this request. Contact the office with questions.' end),
    jsonb_build_object('children', true));
  return sid;
end $$;

/** Students for the office, with their parents and any login. */
create function public.admin_list_students(p_search text default null, p_limit int default 25, p_offset int default 0)
returns table (id uuid, first_name text, last_name text, grade int, grade_label text, class_of int, managed boolean,
               photo_path text, parents jsonb, total bigint)
language plpgsql security definer set search_path = public as $$
declare term text := '%' || lower(coalesce(trim(p_search), '')) || '%';
begin
  perform app.require_permission('people.family');
  perform app.refresh_grades();
  return query
    select p.id, p.first_name, p.last_name, p.grade, app.grade_label(p.grade), p.class_of, p.managed, p.avatar_url,
           (select coalesce(jsonb_agg(jsonb_build_object('id', q.id, 'name', trim(q.first_name || ' ' || q.last_name)) order by q.first_name), '[]'::jsonb)
            from guardians g join profiles q on q.id = g.guardian_id where g.student_id = p.id),
           count(*) over ()
    from profiles p
    where p.school_role = 'student'
      and (lower(p.first_name || ' ' || p.last_name) like term
           or exists (select 1 from guardians g join profiles q on q.id = g.guardian_id
                      where g.student_id = p.id and lower(q.first_name || ' ' || q.last_name) like term))
    order by p.grade nulls last, p.last_name, p.first_name, p.id
    limit greatest(1, least(coalesce(p_limit, 25), 100)) offset greatest(0, coalesce(p_offset, 0));
end $$;

-- ======================================================================
-- Privileges
-- ======================================================================

revoke all on function app.drop_profile_with_login(), app.refresh_grades(), app.can_manage_child(uuid, uuid),
  app.check_child_fields(text, text, int) from public, anon, authenticated;
-- Storage policies on child photos ask this as the signed-in person.
grant execute on function app.can_manage_child(uuid, uuid) to authenticated;
grant execute on function app.refresh_grades() to service_role;
grant execute on function app.school_year_end(date), app.grade_for_class(int, date), app.class_for_grade(int, date),
  app.grade_label(int), app.child_folder(text) to authenticated, service_role;
revoke all on function public.update_child_details(uuid, date, text, text, text), public.set_child_photo(uuid, text),
  public.my_children(), public.request_child(text, text, int, date, text), public.request_child_edit(uuid, text, text, int, text),
  public.cancel_family_request(uuid), public.admin_create_student(text, text, int, date, uuid),
  public.admin_update_student(uuid, text, text, int), public.admin_delete_student(uuid),
  public.admin_family_requests(), public.admin_decide_family_request(uuid, boolean, uuid, text),
  public.admin_list_students(text, int, int) from public, anon;
grant execute on function public.update_child_details(uuid, date, text, text, text), public.set_child_photo(uuid, text),
  public.my_children(), public.request_child(text, text, int, date, text), public.request_child_edit(uuid, text, text, int, text),
  public.cancel_family_request(uuid), public.admin_create_student(text, text, int, date, uuid),
  public.admin_update_student(uuid, text, text, int), public.admin_delete_student(uuid),
  public.admin_family_requests(), public.admin_decide_family_request(uuid, boolean, uuid, text),
  public.admin_list_students(text, int, int) to authenticated, service_role;
