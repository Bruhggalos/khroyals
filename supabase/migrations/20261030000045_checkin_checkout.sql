-- Checking children in and out: at school (the front office) and at events (teachers and coaches).
--
-- School: checkin.manage holders (office, administrators and directors to start; an admin power,
-- so aal2) check a student in when they arrive late and out when they leave early, with a reason.
-- Leaving, the adult taking them must be on the child's pickup list (app.pickup_people: their
-- parents, linked family, and approved pickup people for today). Parents are notified each time.
--
-- Events: a check-out list for an Activities event (its registered students, run by the activity's
-- coaches and directors) or one a teacher makes for a field trip or class party (students from the
-- sections they lead). The teacher releases each child, only to someone on that child's pickup
-- list, and sees who's still waiting; parents are notified. checkin.manage holders can run any list.

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
    ('checkin.manage',   'Check in & out',        'Check students in when they arrive late and out when they leave early (only to someone on their pickup list), see the day''s check-ins, and run any event check-out list.'),
    ('alerts.map',       'Alert map',             'Keep the map of the school''s Wi-Fi access points (which room or area each one is in) that shows critical alert senders where people answered from.'),
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

update public.admin_roles set permissions = permissions || 'checkin.manage'::text
where id in ('director', 'administrator', 'office') and not ('checkin.manage' = any (permissions));

-- ----------------------------------------------------------------------
-- Helpers
-- ----------------------------------------------------------------------

/** "Ava Reyes", or "Someone" for a deleted account. */
create function app.checkin_name(u uuid) returns text
language sql stable security definer set search_path = public as $$
  select coalesce((select nullif(trim(first_name || ' ' || last_name), '') from profiles where id = u), 'Someone')
$$;

/** "1:15 PM" on the school's clock. */
create function app.checkin_time(t timestamptz) returns text
language sql stable as $$ select to_char(t at time zone 'America/Chicago', 'FMHH12:MI AM') $$;

create function app.checkin_reason(r text) returns text
language sql immutable as $$
  select case r when 'late' then 'Late arrival' when 'appointment' then 'Appointment' when 'illness' then 'Sick'
                when 'family' then 'Family' else 'Other' end
$$;

/** Everyone who may take this child today: parents, linked family, and approved pickup people (their relationship). */
create function app.pickup_people(s uuid) returns table (person_id uuid, relation text)
language sql stable security definer set search_path = public as $$
  select g.guardian_id, coalesce(g.relation, 'parent') from guardians g where g.student_id = s and not app.is_family(g.guardian_id)
  union
  select f.family_id, 'family' from family_pickups f where f.student_id = s
  union
  select a.person_id, a.relationship from pickup_authorizations a
  where a.student_id = s and app.school_today() between a.starts_on and coalesce(a.ends_on, app.school_today())
    and coalesce(app.school_role(a.person_id), 'student') <> 'student'
$$;

/** The child's parents (never Family accounts) hear about every check-in and check-out. */
create function app.notify_parents(s uuid, title text, body text, data jsonb) returns void
language plpgsql security definer set search_path = public as $$
declare g uuid;
begin
  for g in select guardian_id from guardians where student_id = s and not app.is_family(guardian_id) loop
    perform app.notify_user(g, title, body, data);
  end loop;
end $$;

-- ----------------------------------------------------------------------
-- School: late arrivals and early check-outs (the front office)
-- ----------------------------------------------------------------------

create table public.school_checks (
  id          uuid primary key default gen_random_uuid(),
  student_id  uuid not null references public.profiles (id) on delete cascade,
  day         date not null default app.school_today(),
  kind        text not null check (kind in ('in', 'out')),
  person_id   uuid references public.profiles (id) on delete set null,   -- who took them (out); who brought them, if given (in)
  reason      text not null default 'other' check (reason in ('late', 'appointment', 'illness', 'family', 'other')),
  note        text not null default '' check (char_length(note) <= 300),
  recorded_by uuid references public.profiles (id) on delete set null,
  at          timestamptz not null default now()
);
create index on public.school_checks (day, at);
create index on public.school_checks (student_id, at desc);

alter table public.school_checks enable row level security;
create policy "the office, and the child's parents and the child" on public.school_checks for select to authenticated
  using (app.has_permission('checkin.manage') or app.is_guardian_of(student_id) or student_id = auth.uid());

/** checkin.manage: check a student in (arriving late) or out (leaving early, only to someone on their pickup list). */
create function public.school_check(p_student uuid, p_kind text, p_person uuid default null, p_reason text default 'other', p_note text default '')
returns uuid
language plpgsql security definer set search_path = public as $$
declare new_id uuid; kid text;
begin
  perform app.require_permission('checkin.manage');
  if p_kind is null or p_kind not in ('in', 'out') then raise exception 'Choose check in or check out.'; end if;
  if not exists (select 1 from profiles where id = p_student and school_role = 'student') then raise exception 'Choose a student.'; end if;
  if coalesce(p_reason, 'other') not in ('late', 'appointment', 'illness', 'family', 'other') then raise exception 'Choose a reason.'; end if;
  if char_length(coalesce(p_note, '')) > 300 then raise exception 'Keep the note under 300 characters.'; end if;
  kid := app.checkin_name(p_student);
  if p_kind = 'out' then
    if p_person is null then raise exception 'Choose who is taking %.', kid; end if;
    if not exists (select 1 from app.pickup_people(p_student) where person_id = p_person) then
      raise exception '% isn''t on %''s pickup list. Only their parents, linked family and approved pickup people can take them.',
        app.checkin_name(p_person), kid using errcode = '42501';
    end if;
  end if;

  insert into school_checks (student_id, kind, person_id, reason, note, recorded_by)
  values (p_student, p_kind, p_person, coalesce(p_reason, 'other'), trim(coalesce(p_note, '')), auth.uid())
  returning id into new_id;

  perform app.notify_parents(p_student,
    case p_kind when 'in' then '✅ ' || kid || ' checked in at school' else '👋 ' || kid || ' checked out of school' end,
    concat_ws(' · ', app.checkin_time(now()), case when p_person is not null then 'with ' || app.checkin_name(p_person) end,
              app.checkin_reason(coalesce(p_reason, 'other'))),
    jsonb_build_object('schoolCheckId', new_id, 'children', true));
  perform app.audit(null, 'checkin.' || p_kind, p_student::text, jsonb_build_object('person', p_person, 'reason', p_reason));
  return new_id;
end $$;

/** checkin.manage: take back today's check-in or check-out (a mis-tap). */
create function public.school_check_undo(p_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare c school_checks;
begin
  perform app.require_permission('checkin.manage');
  delete from school_checks where id = p_id and day = app.school_today() returning * into c;
  if not found then raise exception 'Only today''s check-ins and check-outs can be undone.'; end if;
  perform app.audit(null, 'checkin.undone', c.student_id::text, jsonb_build_object('kind', c.kind));
end $$;

/** checkin.manage: students by name (all of them when empty), with where they stand today. */
create function public.checkin_students(p_query text default '') returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  perform app.require_permission('checkin.manage');
  return coalesce((select jsonb_agg(x) from (
    select jsonb_build_object('id', p.id, 'name', trim(p.first_name || ' ' || p.last_name), 'grade', p.grade,
      'status', c.kind, 'at', c.at) as x
    from profiles p
    left join lateral (select kind, at from school_checks where student_id = p.id and day = app.school_today() order by at desc limit 1) c on true
    where p.school_role = 'student'
      and (coalesce(trim(p_query), '') = '' or (p.first_name || ' ' || p.last_name) ilike '%' || trim(p_query) || '%')
    order by p.last_name, p.first_name
    limit 40) q), '[]'::jsonb);
end $$;

/** checkin.manage: today's check-ins and check-outs, newest first. */
create function public.checkin_today() returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  perform app.require_permission('checkin.manage');
  return coalesce((select jsonb_agg(jsonb_build_object(
      'id', c.id, 'studentId', c.student_id, 'studentName', app.checkin_name(c.student_id), 'kind', c.kind,
      'person', case when c.person_id is not null then app.checkin_name(c.person_id) end,
      'reason', c.reason, 'note', c.note, 'by', app.checkin_name(c.recorded_by), 'at', c.at) order by c.at desc)
    from school_checks c where c.day = app.school_today()), '[]'::jsonb);
end $$;

-- ----------------------------------------------------------------------
-- Events: check-out lists (teachers, coaches and directors)
-- ----------------------------------------------------------------------

create table public.checkout_lists (
  id             uuid primary key default gen_random_uuid(),
  title          text not null check (char_length(trim(title)) between 1 and 120),
  day            date not null default app.school_today(),
  sport_event_id uuid references public.sport_events (id) on delete cascade,   -- an Activities event; null for one a teacher made
  created_by     uuid references public.profiles (id) on delete set null,
  created_at     timestamptz not null default now()
);
create unique index on public.checkout_lists (sport_event_id) where sport_event_id is not null;
create index on public.checkout_lists (day);

create table public.checkout_list_students (
  list_id    uuid not null references public.checkout_lists (id) on delete cascade,
  student_id uuid not null references public.profiles (id) on delete cascade,
  primary key (list_id, student_id)
);

create table public.checkout_releases (
  list_id     uuid not null,
  student_id  uuid not null,
  released_to uuid references public.profiles (id) on delete set null,
  released_by uuid references public.profiles (id) on delete set null,
  at          timestamptz not null default now(),
  primary key (list_id, student_id),
  foreign key (list_id, student_id) references public.checkout_list_students (list_id, student_id) on delete cascade
);

/** Who runs a check-out list: its maker, the activity's coaches and directors (for an Activities event), and checkin.manage. Staff only. */
create function app.manages_checkout(l uuid, u uuid default auth.uid()) returns boolean
language sql stable security definer set search_path = public as $$
  select app.is_staff(u) and exists (
    select 1 from checkout_lists c
    left join sport_events e on e.id = c.sport_event_id
    left join sport_seasons ss on ss.id = e.season_id
    where c.id = l and (c.created_by = u or app.has_permission('checkin.manage', u)
                        or (ss.sport_id is not null and app.can_manage_sport(ss.sport_id, u))))
$$;

alter table public.checkout_lists enable row level security;
alter table public.checkout_list_students enable row level security;
alter table public.checkout_releases enable row level security;
create policy "the people running it" on public.checkout_lists for select to authenticated using (app.manages_checkout(id));
create policy "the people running it, and the child's parents" on public.checkout_list_students for select to authenticated
  using (app.manages_checkout(list_id) or app.is_guardian_of(student_id));
create policy "the people running it, and the child's parents" on public.checkout_releases for select to authenticated
  using (app.manages_checkout(list_id) or app.is_guardian_of(student_id));

/** Staff: a check-out list for a field trip, class party or the like, from students in the sections they lead (checkin.manage: any student). */
create function public.checkout_list_save(p_title text, p_day date, p_students uuid[]) returns uuid
language plpgsql security definer set search_path = public as $$
declare new_id uuid; s uuid;
begin
  if not app.is_staff() then raise exception 'Check-out lists are for teachers and staff.' using errcode = '42501'; end if;
  if coalesce(trim(p_title), '') = '' then raise exception 'Give the list a name, like "Zoo field trip".'; end if;
  if p_day is null or p_day < app.school_today() then raise exception 'Choose today or a day coming up.'; end if;
  if coalesce(cardinality(p_students), 0) = 0 then raise exception 'Choose the students going.'; end if;
  foreach s in array p_students loop
    if not exists (select 1 from profiles where id = s and school_role = 'student') then raise exception 'Choose students only.'; end if;
    if not app.has_permission('checkin.manage') and not exists (
      select 1 from rosters r join roster_members m on m.roster_id = r.id
      where r.kind = 'section' and r.lead_id = auth.uid() and m.profile_id = s) then
      raise exception '% isn''t in a class you lead.', app.checkin_name(s) using errcode = '42501';
    end if;
  end loop;
  insert into checkout_lists (title, day, created_by) values (trim(p_title), p_day, auth.uid()) returning id into new_id;
  insert into checkout_list_students (list_id, student_id) select new_id, x from unnest(p_students) x on conflict do nothing;
  return new_id;
end $$;

/** An Activities event's coaches and directors (or checkin.manage): its check-out list, with every registered student (added if new). */
create function public.checkout_list_for_event(p_event uuid) returns uuid
language plpgsql security definer set search_path = public as $$
declare e sport_events; sport uuid; sport_name text; list uuid;
begin
  select * into e from sport_events where id = p_event;
  if not found then raise exception 'That event is gone.'; end if;
  select ss.sport_id, sp.name into sport, sport_name from sport_seasons ss join sports sp on sp.id = ss.sport_id where ss.id = e.season_id;
  if not app.is_staff() or not (app.can_manage_sport(sport) or app.has_permission('checkin.manage')) then
    raise exception 'Only the activity''s coaches and directors can check students out of it.' using errcode = '42501';
  end if;
  insert into checkout_lists (title, day, sport_event_id, created_by)
  values (left(sport_name || ': ' || e.title, 120), (e.starts_at at time zone 'America/Chicago')::date, e.id, auth.uid())
  on conflict (sport_event_id) where sport_event_id is not null do nothing;
  select id into list from checkout_lists where sport_event_id = e.id;
  insert into checkout_list_students (list_id, student_id)
  select list, r.student_id from sport_registrations r where r.season_id = e.season_id and r.status = 'registered'
  on conflict do nothing;
  return list;
end $$;

/** The list's maker or checkin.manage: remove a list. */
create function public.checkout_list_delete(p_id uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from checkout_lists where id = p_id and (created_by = auth.uid() or app.has_permission('checkin.manage'))) then
    raise exception 'Only the person who made the list can remove it.' using errcode = '42501';
  end if;
  delete from checkout_lists where id = p_id;
end $$;

/** Release a child from a list, only to someone on their pickup list; their parents are told. */
create function public.checkout_release(p_list uuid, p_student uuid, p_person uuid) returns void
language plpgsql security definer set search_path = public as $$
declare title text; kid text;
begin
  if not app.manages_checkout(p_list) then raise exception 'Only the people running this list can check students out.' using errcode = '42501'; end if;
  if not exists (select 1 from checkout_list_students where list_id = p_list and student_id = p_student) then
    raise exception 'That student isn''t on this list.';
  end if;
  kid := app.checkin_name(p_student);
  if p_person is null or not exists (select 1 from app.pickup_people(p_student) where person_id = p_person) then
    raise exception '% isn''t on %''s pickup list. Only their parents, linked family and approved pickup people can take them.',
      app.checkin_name(p_person), kid using errcode = '42501';
  end if;
  insert into checkout_releases (list_id, student_id, released_to, released_by) values (p_list, p_student, p_person, auth.uid())
  on conflict (list_id, student_id) do update set released_to = excluded.released_to, released_by = excluded.released_by, at = now();
  select c.title into title from checkout_lists c where c.id = p_list;
  perform app.notify_parents(p_student, '👋 ' || kid || ' checked out of ' || title,
    app.checkin_time(now()) || ' · with ' || app.checkin_name(p_person),
    jsonb_build_object('checkoutListId', p_list, 'children', true));
  perform app.audit(null, 'checkout.released', p_student::text, jsonb_build_object('list', p_list, 'person', p_person));
end $$;

/** Take back a release (a mis-tap). */
create function public.checkout_unrelease(p_list uuid, p_student uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not app.manages_checkout(p_list) then raise exception 'Only the people running this list can change it.' using errcode = '42501'; end if;
  delete from checkout_releases where list_id = p_list and student_id = p_student;
end $$;

/** Lists the caller runs, from a week back on, with how many are still waiting. */
create function public.checkout_my_lists() returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object(
      'id', c.id, 'title', c.title, 'day', c.day, 'sportEventId', c.sport_event_id,
      'students', (select count(*) from checkout_list_students s where s.list_id = c.id),
      'released', (select count(*) from checkout_releases r where r.list_id = c.id),
      'mine', c.created_by = auth.uid()) order by c.day, c.title), '[]'::jsonb)
  from checkout_lists c where c.day >= app.school_today() - 7 and app.manages_checkout(c.id)
$$;

/** One list: each student, and who took them and when. */
create function public.checkout_list(p_id uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  if not app.manages_checkout(p_id) then raise exception 'Only the people running this list can see it.' using errcode = '42501'; end if;
  return (select jsonb_build_object('id', c.id, 'title', c.title, 'day', c.day, 'sportEventId', c.sport_event_id,
      'canDelete', c.created_by = auth.uid() or app.has_permission('checkin.manage'),
      'students', coalesce((select jsonb_agg(jsonb_build_object(
          'id', p.id, 'name', trim(p.first_name || ' ' || p.last_name), 'grade', p.grade,
          'releasedTo', case when r.student_id is not null then app.checkin_name(r.released_to) end,
          'releasedAt', r.at, 'releasedBy', case when r.student_id is not null then app.checkin_name(r.released_by) end)
          order by (r.student_id is not null), p.last_name, p.first_name)
        from checkout_list_students s join profiles p on p.id = s.student_id
        left join checkout_releases r on r.list_id = s.list_id and r.student_id = s.student_id
        where s.list_id = c.id), '[]'::jsonb))
    from checkout_lists c where c.id = p_id);
end $$;

/** Who a child may go home with today, for the release sheet: their pickup list (the office, or a list the caller runs with the child on it). */
create function public.checkout_people(p_student uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  if not (app.has_permission('checkin.manage') or exists (
      select 1 from checkout_list_students s where s.student_id = p_student and app.manages_checkout(s.list_id))) then
    raise exception 'Only the office, or someone checking this student out, can see who may take them.' using errcode = '42501';
  end if;
  return coalesce((select jsonb_agg(jsonb_build_object('id', x.person_id, 'name', app.checkin_name(x.person_id), 'relation', x.relation)
      order by x.rank, app.checkin_name(x.person_id))
    from (select distinct on (person_id) person_id, relation,
            case when relation in ('mother', 'father', 'parent') then 0 when relation = 'family' then 1 else 2 end as rank
          from app.pickup_people(p_student) order by person_id, case when relation in ('mother', 'father', 'parent') then 0 else 1 end) x), '[]'::jsonb);
end $$;

/** The caller's Activities events from today through the next two weeks (the ones they coach or direct), with any list already made. */
create function public.checkout_event_options() returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object('id', e.id, 'title', sp.name || ': ' || e.title, 'startsAt', e.starts_at,
      'listId', (select c.id from checkout_lists c where c.sport_event_id = e.id)) order by e.starts_at), '[]'::jsonb)
  from sport_events e join sport_seasons ss on ss.id = e.season_id join sports sp on sp.id = ss.sport_id
  where app.is_staff() and not e.cancelled and app.can_manage_sport(ss.sport_id)
    and (e.starts_at at time zone 'America/Chicago')::date between app.school_today() and app.school_today() + 14
$$;

/** Students in the sections the caller leads (children without a login too), for a teacher's list. */
create function public.checkout_my_students() returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object('id', x.id, 'name', x.name, 'grade', x.grade, 'sections', x.sections) order by x.last, x.first), '[]'::jsonb)
  from (select p.id, trim(p.first_name || ' ' || p.last_name) as name, p.grade, p.first_name as first, p.last_name as last,
          string_agg(distinct r.name, ', ') as sections
        from rosters r join roster_members m on m.roster_id = r.id join profiles p on p.id = m.profile_id
        where r.kind = 'section' and r.lead_id = auth.uid() and app.is_staff() and p.school_role = 'student'
        group by p.id, p.first_name, p.last_name, p.grade) x
$$;

revoke all on function app.pickup_people(uuid), app.notify_parents(uuid, text, text, jsonb) from public, anon, authenticated;
grant execute on function app.checkin_name(uuid), app.checkin_time(timestamptz), app.checkin_reason(text),
  app.manages_checkout(uuid, uuid) to authenticated, service_role;
revoke all on function public.school_check(uuid, text, uuid, text, text), public.school_check_undo(uuid), public.checkin_students(text),
  public.checkin_today(), public.checkout_list_save(text, date, uuid[]), public.checkout_list_for_event(uuid), public.checkout_list_delete(uuid),
  public.checkout_release(uuid, uuid, uuid), public.checkout_unrelease(uuid, uuid), public.checkout_my_lists(), public.checkout_list(uuid),
  public.checkout_people(uuid), public.checkout_event_options(), public.checkout_my_students() from public, anon;
grant execute on function public.school_check(uuid, text, uuid, text, text), public.school_check_undo(uuid), public.checkin_students(text),
  public.checkin_today(), public.checkout_list_save(text, date, uuid[]), public.checkout_list_for_event(uuid), public.checkout_list_delete(uuid),
  public.checkout_release(uuid, uuid, uuid), public.checkout_unrelease(uuid, uuid), public.checkout_my_lists(), public.checkout_list(uuid),
  public.checkout_people(uuid), public.checkout_event_options(), public.checkout_my_students() to authenticated, service_role;
grant select on public.school_checks, public.checkout_lists, public.checkout_list_students, public.checkout_releases to authenticated;
grant all on public.school_checks, public.checkout_lists, public.checkout_list_students, public.checkout_releases to service_role;
