-- Class attendance: teachers take roll for the class sections they lead, and see the office's late
-- arrivals and early check-outs (school_checks) on the same roster.
--
-- A section's lead teacher marks each student present, late or absent for a day (today, or up to
-- two weeks back to fix a mistake). checkin.manage holders (the office) can take any section's roll,
-- for a teacher who's out, and see every section's (attendance_overview). A student the office
-- checks in late counts as late whatever the teacher marked, and shows as gone once the office
-- checks them out. The teachers of a student's sections are notified of each office check-in and
-- check-out. Parents and the student can read their own marks; nobody else.

create table public.class_attendance (
  section_id text not null references public.rosters (id) on delete cascade,
  student_id uuid not null references public.profiles (id) on delete cascade,
  day        date not null default app.school_today(),
  status     text not null check (status in ('present', 'late', 'absent')),
  marked_by  uuid references public.profiles (id) on delete set null,
  at         timestamptz not null default now(),
  primary key (section_id, day, student_id)
);
create index on public.class_attendance (student_id, day);

/** Who takes a section's roll: its lead teacher, and checkin.manage holders (the office). Staff only. */
create function app.takes_roll(sec text, u uuid default auth.uid()) returns boolean
language sql stable security definer set search_path = public as $$
  select app.is_staff(u) and exists (select 1 from rosters r where r.id = sec and r.kind = 'section'
    and (r.lead_id = u or app.has_permission('checkin.manage', u)))
$$;

alter table public.class_attendance enable row level security;
create policy "the class's teacher, the office, and the child's parents and the child" on public.class_attendance for select to authenticated
  using (app.takes_roll(section_id) or app.is_guardian_of(student_id) or student_id = auth.uid());

/** The office checked them in late that day (their first check of the day was a check-in). */
create function app.arrived_late(s uuid, d date) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select kind = 'in' from school_checks where student_id = s and day = d order by at limit 1), false)
$$;

/** The office checked them out and they haven't been checked back in. */
create function app.left_school(s uuid, d date) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select kind = 'out' from school_checks where student_id = s and day = d order by at desc limit 1), false)
$$;

/** Where a student stands in a section on a day: the teacher's mark, but late when the office checked them in late; null before roll. */
create function app.attendance_state(sec text, s uuid, d date) returns text
language sql stable security definer set search_path = public as $$
  select case when app.arrived_late(s, d) then 'late'
    else (select status from class_attendance where section_id = sec and student_id = s and day = d) end
$$;

/** A section's students (not its teacher), for the roll. */
create function app.section_students(sec text) returns setof uuid
language sql stable security definer set search_path = public as $$
  select m.profile_id from roster_members m join profiles p on p.id = m.profile_id where m.roster_id = sec and p.school_role = 'student'
$$;

/** A section's roll at a glance: how many are present, late, absent, not marked yet and gone home, and when roll was first taken. */
create function app.attendance_counts(sec text, d date) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object('students', count(*),
    'present', count(*) filter (where x.state = 'present'), 'late', count(*) filter (where x.state = 'late'),
    'absent', count(*) filter (where x.state = 'absent'), 'unmarked', count(*) filter (where x.state is null),
    'left', count(*) filter (where x.gone),
    'takenAt', (select min(at) from class_attendance where section_id = sec and day = d))
  from (select app.attendance_state(sec, s, d) as state, app.left_school(s, d) as gone from app.section_students(sec) s) x
$$;

/** The section's teacher or the office: mark students present, late or absent (null clears), today or up to two weeks back. */
create function public.class_attendance_mark(p_section text, p_day date, p_students uuid[], p_status text) returns void
language plpgsql security definer set search_path = public as $$
declare d date := coalesce(p_day, app.school_today()); s uuid;
begin
  if not app.takes_roll(p_section) then
    raise exception 'Only the class''s teacher and the office can take its roll.' using errcode = '42501';
  end if;
  if d > app.school_today() then raise exception 'Roll can''t be taken ahead of the day.'; end if;
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

/** A section's roll for a day: each student with the teacher's mark, where they stand, and the office's check-ins and check-outs. */
create function public.class_attendance_roll(p_section text, p_day date default null) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare d date := coalesce(p_day, app.school_today());
begin
  if not app.takes_roll(p_section) then
    raise exception 'Only the class''s teacher and the office can see its attendance.' using errcode = '42501';
  end if;
  return (select jsonb_build_object('id', r.id, 'name', r.name, 'teacher', case when r.lead_id is not null then app.checkin_name(r.lead_id) end,
      'day', d, 'canMark', d between app.school_today() - 14 and app.school_today(),
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

/** The sections the caller leads, each with its roll at a glance for the day. */
create function public.my_class_attendance(p_day date default null) returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object('id', r.id, 'name', r.name, 'teacher', app.checkin_name(r.lead_id))
      || app.attendance_counts(r.id, coalesce(p_day, app.school_today())) order by r.name), '[]'::jsonb)
  from rosters r where r.kind = 'section' and r.lead_id = auth.uid() and app.is_staff()
$$;

/** checkin.manage (the office): every section's roll at a glance for the day. */
create function public.attendance_overview(p_day date default null) returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  perform app.require_permission('checkin.manage');
  return coalesce((select jsonb_agg(jsonb_build_object('id', r.id, 'name', r.name,
        'teacher', case when r.lead_id is not null then app.checkin_name(r.lead_id) end)
      || app.attendance_counts(r.id, coalesce(p_day, app.school_today())) order by r.name)
    from rosters r where r.kind = 'section'), '[]'::jsonb);
end $$;

/** The office checked a student in or out: tell the teachers of their sections (once each; not whoever recorded it). */
create function app.tell_teachers_of_check() returns trigger
language plpgsql security definer set search_path = public as $$
declare t record; kid text := app.checkin_name(new.student_id);
begin
  for t in select r.lead_id, min(r.id) as sec from rosters r join roster_members m on m.roster_id = r.id
           where r.kind = 'section' and m.profile_id = new.student_id and r.lead_id is not null
             and r.lead_id is distinct from new.recorded_by and app.is_staff(r.lead_id)
           group by r.lead_id loop
    perform app.notify_user(t.lead_id,
      case new.kind when 'in' then '🕘 ' || kid || ' arrived late' else '👋 ' || kid || ' left early' end,
      concat_ws(' · ', app.checkin_time(new.at),
                case when new.kind = 'out' and new.person_id is not null then 'with ' || app.checkin_name(new.person_id) end,
                app.checkin_reason(new.reason)),
      jsonb_build_object('classAttendance', t.sec));
  end loop;
  return null;
end $$;
create trigger tell_teachers after insert on public.school_checks for each row execute function app.tell_teachers_of_check();

revoke all on function app.arrived_late(uuid, date), app.left_school(uuid, date), app.attendance_state(text, uuid, date),
  app.section_students(text), app.attendance_counts(text, date), app.tell_teachers_of_check() from public, anon, authenticated;
grant execute on function app.takes_roll(text, uuid) to authenticated, service_role;
revoke all on function public.class_attendance_mark(text, date, uuid[], text), public.class_attendance_roll(text, date),
  public.my_class_attendance(date), public.attendance_overview(date) from public, anon;
grant execute on function public.class_attendance_mark(text, date, uuid[], text), public.class_attendance_roll(text, date),
  public.my_class_attendance(date), public.attendance_overview(date) to authenticated, service_role;
grant select on public.class_attendance to authenticated;
grant all on public.class_attendance to service_role;
