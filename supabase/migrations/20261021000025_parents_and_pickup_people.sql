-- Parents and the people allowed to pick a child up.
--
-- Parents: a child has at most two parents, one mother and one father
-- (guardians.relation). Links made before this have no relation yet; the
-- office sets it (admin_set_parent_relation). New links need one.
--
-- Approved pickup people: anyone else who picks a child up (grandparent, sitter,
-- carpool, older sibling) must have a Royals Connect account. The child's
-- parents or the office add them by the email of that account, optionally for
-- a date range; they then get the car line for that child, and only that. They
-- are told, and so are the parents. Removing them ends it at once.

-- ======================================================================
-- At most two parents: one mother, one father
-- ======================================================================

alter table public.guardians add column relation text check (relation in ('mother', 'father'));
create unique index guardians_one_mother_one_father on public.guardians (student_id, relation) where relation is not null;

create function app.parent_label(r text) returns text
language sql immutable as $$ select case r when 'mother' then 'mother' when 'father' then 'father' else 'parent' end $$;

/** Keep it to two parents, one of each. */
create function app.check_parents() returns trigger
language plpgsql security definer set search_path = public as $$
declare kid text; other text;
begin
  select trim(first_name) into kid from profiles where id = new.student_id;
  if (select count(*) from guardians where student_id = new.student_id
        and guardian_id <> new.guardian_id) >= 2 then
    raise exception '% already has two parents. Remove one first, or add this person as an approved pickup instead.', kid;
  end if;
  if new.relation is not null then
    select trim(q.first_name || ' ' || q.last_name) into other from guardians g join profiles q on q.id = g.guardian_id
    where g.student_id = new.student_id and g.relation = new.relation and g.guardian_id <> new.guardian_id;
    if other is not null then
      raise exception '% already has a % (%).', kid, new.relation, other;
    end if;
  end if;
  return new;
end $$;
create trigger check_parents before insert or update on public.guardians
  for each row execute function app.check_parents();

drop function public.admin_link_guardian(uuid, uuid, boolean);
/**
 * The office (people.family): link a parent (mother or father) to a student,
 * or a Family account to a child they may pick up; or unlink.
 */
create function public.admin_link_guardian(p_guardian uuid, p_student uuid, p_link boolean default true, p_relation text default null)
returns void
language plpgsql security definer set search_path = public as $$
begin
  perform app.require_permission('people.family');
  if p_link then
    if coalesce(app.school_role(p_student), '') <> 'student' then raise exception 'Children must be students at the school.'; end if;
    if coalesce(app.school_role(p_guardian), 'student') = 'student' then
      raise exception 'Parents and family must be approved adults (not students).';
    end if;
    if app.is_family(p_guardian) then
      insert into family_pickups (family_id, student_id) values (p_guardian, p_student) on conflict do nothing;
    else
      if p_relation is null or p_relation not in ('mother', 'father') then raise exception 'Choose mother or father.'; end if;
      insert into guardians (guardian_id, student_id, relation) values (p_guardian, p_student, p_relation)
      on conflict (guardian_id, student_id) do update set relation = excluded.relation;
      delete from pickup_authorizations where student_id = p_student and person_id = p_guardian;  -- a parent now
    end if;
  else
    delete from guardians where guardian_id = p_guardian and student_id = p_student;
    delete from family_pickups where family_id = p_guardian and student_id = p_student;
  end if;
  perform app.audit(null, case when p_link then 'family.linked' else 'family.unlinked' end, p_guardian::text,
                    jsonb_build_object('student', p_student, 'pickupOnly', app.is_family(p_guardian), 'relation', p_relation));
end $$;

/** The office: say whether an existing parent link is the mother or the father. */
create function public.admin_set_parent_relation(p_guardian uuid, p_student uuid, p_relation text) returns void
language plpgsql security definer set search_path = public as $$
begin
  perform app.require_permission('people.family');
  if p_relation is null or p_relation not in ('mother', 'father') then raise exception 'Choose mother or father.'; end if;
  update guardians set relation = p_relation where guardian_id = p_guardian and student_id = p_student;
  if not found then raise exception 'That person isn''t linked as a parent.'; end if;
end $$;

drop function public.admin_create_student(text, text, int, date, uuid);
/** Add a child (no login) and optionally link a parent (mother or father). Returns the child's id. */
create function public.admin_create_student(
  p_first text, p_last text, p_grade int, p_birthday date default null, p_guardian uuid default null, p_relation text default null
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
  if p_guardian is not null then perform public.admin_link_guardian(p_guardian, sid, true, p_relation); end if;
  perform app.audit(null, 'student.created', sid::text, jsonb_build_object('name', trim(p_first) || ' ' || trim(p_last), 'grade', p_grade));
  return sid;
end $$;

-- Parents asking to add a child say which parent they are.
drop function public.request_child(text, text, int, date, text);
create function public.request_child(p_first text, p_last text, p_grade int, p_birthday date default null, p_note text default null,
                                     p_relation text default null)
returns public.family_requests
language plpgsql security definer set search_path = public as $$
declare row family_requests%rowtype;
begin
  if coalesce(app.school_role(), 'student') in ('student', 'family') then
    raise exception 'Only approved parents and staff can add children.' using errcode = '42501';
  end if;
  perform app.check_child_fields(p_first, p_last, p_grade);
  if p_relation is null or p_relation not in ('mother', 'father') then raise exception 'Say whether you''re the mother or the father.'; end if;
  insert into family_requests (requested_by, kind, details)
  values (auth.uid(), 'add_child', jsonb_build_object('firstName', trim(p_first), 'lastName', trim(p_last), 'grade', p_grade,
                                                     'birthday', p_birthday, 'note', nullif(trim(p_note), ''), 'relation', p_relation))
  returning * into row;
  return row;
end $$;

create or replace function public.admin_decide_family_request(
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
      perform public.admin_link_guardian(r.requested_by, sid, true, coalesce(d->>'relation', 'mother'));
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

-- ======================================================================
-- Approved pickup people
-- ======================================================================

create table public.pickup_authorizations (
  id           uuid primary key default gen_random_uuid(),
  student_id   uuid not null references public.profiles (id) on delete cascade,
  person_id    uuid not null references public.profiles (id) on delete cascade,
  relationship text not null check (relationship in ('grandparent', 'aunt_uncle', 'sibling', 'stepparent', 'family_friend',
                                                    'nanny', 'carpool', 'other')),
  starts_on    date not null default app.school_today(),
  ends_on      date,                                   -- null = until a parent removes them
  granted_by   uuid references public.profiles (id) on delete set null,
  created_at   timestamptz not null default now(),
  unique (student_id, person_id),
  check (ends_on is null or ends_on >= starts_on)
);
alter table public.pickup_authorizations enable row level security;
create policy "the person, the child's parents, or staff" on public.pickup_authorizations for select to authenticated
  using (person_id = auth.uid() or app.is_guardian_of(student_id) or app.is_staff());
grant select on public.pickup_authorizations to authenticated;
revoke insert, update, delete on public.pickup_authorizations from anon, authenticated;
grant all on public.pickup_authorizations to service_role;

create function app.relationship_label(r text) returns text
language sql immutable as $$
  select case r when 'grandparent' then 'grandparent' when 'aunt_uncle' then 'aunt or uncle' when 'sibling' then 'older sibling'
    when 'stepparent' then 'stepparent' when 'family_friend' then 'family friend' when 'nanny' then 'nanny or sitter'
    when 'carpool' then 'carpool' else 'approved pickup' end
$$;

/** Children someone may pick up: their own, Family links from the office, and approvals that cover today. */
create or replace function app.pickup_children(u uuid default auth.uid()) returns setof uuid
language sql stable security definer set search_path = public as $$
  select student_id from guardians where guardian_id = u and not app.is_family(u)
  union
  select student_id from family_pickups where family_id = u and app.is_family(u)
  union
  select student_id from pickup_authorizations
  where person_id = u and app.school_today() between starts_on and coalesce(ends_on, app.school_today())
    and coalesce(app.school_role(u), 'student') <> 'student'
$$;

create function app.can_manage_pickups(s uuid, u uuid default auth.uid()) returns boolean
language sql stable security definer set search_path = public as $$
  select app.is_guardian_of(s, u) or app.has_permission('people.family', u)
$$;

/**
 * A child's parent (or the office): allow the account with this email to pick
 * the child up, from p_starts (default today) until p_ends (null = until removed).
 */
create function public.add_pickup_person(p_student uuid, p_email text, p_relationship text,
                                         p_starts date default null, p_ends date default null)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare who profiles%rowtype; kid text; me_name text; row pickup_authorizations%rowtype; g uuid; span text;
begin
  if not app.can_manage_pickups(p_student) then
    raise exception 'Only this child''s parents or the school office can choose who picks them up.' using errcode = '42501';
  end if;
  select p.* into who from profiles p join profile_private pp on pp.id = p.id
  where lower(pp.email) = lower(trim(coalesce(p_email, '')));
  if not found then
    raise exception 'No Royals Connect account uses that email. Ask them to download the app and create an account, then add them.';
  end if;
  if who.school_role = 'student' or who.managed then raise exception 'Students can''t be approved to pick up children.'; end if;
  if exists (select 1 from guardians where guardian_id = who.id and student_id = p_student) then
    raise exception '% is already a parent of this child.', trim(who.first_name);
  end if;
  if p_ends is not null and p_ends < coalesce(p_starts, app.school_today()) then raise exception 'The end date must be on or after the start.'; end if;
  insert into pickup_authorizations (student_id, person_id, relationship, starts_on, ends_on, granted_by)
  values (p_student, who.id, p_relationship, coalesce(p_starts, app.school_today()), p_ends, auth.uid())
  on conflict (student_id, person_id) do update set relationship = excluded.relationship, starts_on = excluded.starts_on,
    ends_on = excluded.ends_on, granted_by = excluded.granted_by
  returning * into row;

  select trim(first_name) into kid from profiles where id = p_student;
  select trim(first_name || ' ' || last_name) into me_name from profiles where id = auth.uid();
  span := case when row.ends_on is null then '' when row.ends_on = row.starts_on then ' on ' || to_char(row.starts_on, 'FMMon FMDD')
               else ' until ' || to_char(row.ends_on, 'FMMon FMDD') end;
  perform app.notify_user(who.id, '🚗 You can pick up ' || kid,
    coalesce(me_name, 'The school') || ' added you to pick up ' || kid || ' from the car line' || span || '.',
    jsonb_build_object('carline', 'pickup-added', 'studentId', p_student));
  for g in select guardian_id from guardians where student_id = p_student and guardian_id <> auth.uid() loop
    perform app.notify_user(g, 'Pickup added for ' || kid,
      coalesce(me_name, 'The school') || ' allowed ' || trim(who.first_name || ' ' || who.last_name)
        || ' (' || app.relationship_label(p_relationship) || ') to pick up ' || kid || span || '.',
      jsonb_build_object('children', true));
  end loop;
  perform app.audit(null, 'pickup.added', p_student::text, jsonb_build_object('person', who.id, 'relationship', p_relationship,
                    'starts', row.starts_on, 'ends', row.ends_on));
  return jsonb_build_object('id', row.id, 'name', trim(who.first_name || ' ' || who.last_name), 'pending', who.school_role is null);
end $$;

/** A child's parent (or the office): stop someone picking the child up. */
create function public.remove_pickup_person(p_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare row pickup_authorizations%rowtype; kid text;
begin
  select * into row from pickup_authorizations where id = p_id;
  if not found or not app.can_manage_pickups(row.student_id) then
    raise exception 'Only this child''s parents or the school office can change who picks them up.' using errcode = '42501';
  end if;
  delete from pickup_authorizations where id = p_id;
  select trim(first_name) into kid from profiles where id = row.student_id;
  perform app.notify_user(row.person_id, 'Pickup for ' || kid || ' removed',
    'You''re no longer on the pickup list for ' || kid || '.', jsonb_build_object('carline', 'pickup-removed'));
  perform app.audit(null, 'pickup.removed', row.student_id::text, jsonb_build_object('person', row.person_id));
end $$;

/** Who can pick up a child, for its parents and the office: parents (with mother/father), Family links and approvals. */
create function public.child_pickup_people(p_student uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  if not (app.can_manage_pickups(p_student) or app.is_staff()) then
    raise exception 'Only this child''s parents and school staff can see who picks them up.' using errcode = '42501';
  end if;
  return jsonb_build_object(
    'parents', coalesce((select jsonb_agg(jsonb_build_object('id', q.id, 'name', trim(q.first_name || ' ' || q.last_name),
                                                             'relation', g.relation) order by g.relation nulls last, q.first_name)
                         from guardians g join profiles q on q.id = g.guardian_id where g.student_id = p_student), '[]'::jsonb),
    'family', coalesce((select jsonb_agg(jsonb_build_object('id', q.id, 'name', trim(q.first_name || ' ' || q.last_name)) order by q.first_name)
                        from family_pickups f join profiles q on q.id = f.family_id where f.student_id = p_student), '[]'::jsonb),
    'approved', coalesce((select jsonb_agg(jsonb_build_object(
                            'id', a.id, 'personId', q.id, 'name', trim(q.first_name || ' ' || q.last_name),
                            'relationship', a.relationship, 'label', app.relationship_label(a.relationship),
                            'startsOn', a.starts_on, 'endsOn', a.ends_on, 'pending', q.school_role is null,
                            'active', app.school_today() between a.starts_on and coalesce(a.ends_on, app.school_today()),
                            'grantedBy', trim(coalesce(b.first_name, '') || ' ' || coalesce(b.last_name, '')))
                            order by a.starts_on, q.first_name)
                          from pickup_authorizations a join profiles q on q.id = a.person_id
                          left join profiles b on b.id = a.granted_by
                          where a.student_id = p_student and coalesce(a.ends_on, app.school_today()) >= app.school_today()), '[]'::jsonb));
end $$;

/** The children this person may pick up today (car line, Android Auto, CarPlay). */
create function public.my_pickup_children() returns setof uuid
language sql stable security definer set search_path = public as $$ select * from app.pickup_children(auth.uid()) $$;

-- The pickup email says how the person is related ("Picked up by: Dana Ortiz (grandparent)").
create or replace function app.pickup_confirmed() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  kid profiles%rowtype; by_name text; by_role text; staff text; num text; vehicle text; line text; g record;
begin
  if new.status <> 'picked_up' or old.status = 'picked_up' then return new; end if;
  select * into kid from profiles where id = new.student_id;
  select number into num from pickup_numbers where student_id = new.student_id;
  select nullif(trim(p.first_name || ' ' || p.last_name), ''),
         coalesce((select app.parent_label(relation) from guardians where guardian_id = new.guardian_id and student_id = new.student_id),
                  (select app.relationship_label(relationship) from pickup_authorizations
                    where person_id = new.guardian_id and student_id = new.student_id),
                  case when p.school_role = 'family' then 'family member' else p.school_role end)
    into by_name, by_role from profiles p where p.id = new.guardian_id;
  select nullif(trim(first_name || ' ' || last_name), '') into staff from profiles where id = new.picked_up_by;
  vehicle := new.vehicle->>'label';
  line := coalesce(kid.first_name, 'Your child') || ' was picked up at ' || app.school_clock(coalesce(new.picked_up_at, now()))
          || coalesce(' by ' || by_name, '') || '.';

  for g in
    select gg.guardian_id, pp.email from guardians gg left join profile_private pp on pp.id = gg.guardian_id
    where gg.student_id = new.student_id
  loop
    if g.email is not null and g.email like '%@%' then
      insert into app.email_queue (to_email, subject, body, pickup_id, send_after)
      values (g.email,
        trim(kid.first_name) || ' was picked up at ' || app.school_clock(coalesce(new.picked_up_at, now())),
        concat_ws(E'\n\n',
          trim(kid.first_name || ' ' || kid.last_name) || ' was picked up from the Kingdom Heights car line at '
            || app.school_clock(coalesce(new.picked_up_at, now())) || ' on '
            || to_char(coalesce(new.picked_up_at, now()) at time zone 'America/Chicago', 'FMDay, FMMonth FMDD') || '.',
          'Picked up by: ' || coalesce(by_name || ' (' || by_role || ')', 'not recorded')
            || coalesce(E'\nVehicle: ' || vehicle, '')
            || coalesce(E'\nReleased by: ' || staff || ' (school staff)', '')
            || coalesce(E'\nPickup number: ' || num, ''),
          'If you weren''t expecting this, call the school office right away at '
            || coalesce(app.setting('school_phone'), 'the school') || '.',
          'Kingdom Heights Preparatory School · Royals Connect'),
        new.id, now() + interval '1 minute');
    end if;
    if g.guardian_id is distinct from new.guardian_id then
      perform app.notify_user(g.guardian_id, '🚗 ' || coalesce(kid.first_name, 'Your child') || ' was picked up', line,
                              jsonb_build_object('carline', 'picked-up', 'pickupId', new.id));
    end if;
  end loop;
  return new;
end $$;

revoke all on function app.check_parents(), app.can_manage_pickups(uuid, uuid) from public, anon, authenticated;
revoke all on function public.admin_create_student(text, text, int, date, uuid, text), public.admin_link_guardian(uuid, uuid, boolean, text), public.admin_set_parent_relation(uuid, uuid, text),
  public.request_child(text, text, int, date, text, text), public.add_pickup_person(uuid, text, text, date, date),
  public.remove_pickup_person(uuid), public.child_pickup_people(uuid), public.my_pickup_children() from public, anon;
grant execute on function public.admin_create_student(text, text, int, date, uuid, text), public.admin_link_guardian(uuid, uuid, boolean, text), public.admin_set_parent_relation(uuid, uuid, text),
  public.request_child(text, text, int, date, text, text), public.add_pickup_person(uuid, text, text, date, date),
  public.remove_pickup_person(uuid), public.child_pickup_people(uuid), public.my_pickup_children() to authenticated, service_role;
