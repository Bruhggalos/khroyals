-- Duplicate children.
--
-- Two parents (or a parent and the office) can each try to add the same
-- child. The school only ever wants one record per child, so:
--
-- * Never the same child twice: no two students may share the same first and
--   last name (ignoring case, accents, spaces and hyphens) and birthday. The
--   database refuses it however the record is made or edited.
-- * Likely duplicates are caught before a student is created: names (with
--   nicknames like Matt/Matthew and hyphenated last names), birthday and grade
--   are scored against every student and every waiting request. A different
--   first name counts strongly against a match, so twins aren't flagged.
--   Strong matches (score 6+) need the office to confirm it's a different child
--   (p_force); weaker ones are shown for the office to check.
-- * Parents never see other families' children. A parent's request that looks
--   like an existing child goes to the office with the match attached, and the
--   office links the parent to the existing child in one tap.

/** Lower case, common accents removed, letters only: "José Kim-Lee" → "josekimlee". */
create function app.norm_name(t text) returns text
language sql immutable as $$
  select regexp_replace(translate(lower(coalesce(t, '')), 'áàâäãåāéèêëēíìîïīóòôöõøōúùûüūñçýÿ', 'aaaaaaaeeeeeiiiiioooooooouuuuuncyy'),
                        '[^a-z]', '', 'g')
$$;

/** Edit distance between two short strings (letters added, removed or changed). */
create function app.edit_distance(a text, b text) returns int
language plpgsql immutable as $$
declare prev int[]; cur int[]; i int; j int; la int := length(a); lb int := length(b);
begin
  if la = 0 then return lb; end if;
  if lb = 0 then return la; end if;
  prev := array(select generate_series(0, lb));
  for i in 1 .. la loop
    cur := array[i];
    for j in 1 .. lb loop
      cur := cur || least(prev[j + 1] + 1, cur[j] + 1, prev[j] + case when substr(a, i, 1) = substr(b, j, 1) then 0 else 1 end);
    end loop;
    prev := cur;
  end loop;
  return prev[lb + 1];
end $$;

/** Same name allowing a typo: one letter off (two for long names). */
create function app.near_name(x text, y text) returns boolean
language sql immutable as $$
  select length(app.norm_name(x)) >= 3 and length(app.norm_name(y)) >= 3
     and app.edit_distance(app.norm_name(x), app.norm_name(y))
         <= case when least(length(app.norm_name(x)), length(app.norm_name(y))) >= 7 then 2 else 1 end
$$;

/**
 * How much a student looks like the child described (higher = more alike).
 * Same full name = 6 (a typo or a nickname a little less); + birthday 4; + grade 1. Different birthday −4, grades two
 * or more apart −2, a different first name −4 (twins).
 */
create function app.child_match_score(s_first text, s_last text, s_birthday date, s_grade int,
                                      first text, last text, birthday date, grade int) returns int
language sql immutable as $$
  select
    (case when app.norm_name(s_last) = app.norm_name(last) then 3
          when app.near_name(s_last, last) then 2
          when app.norm_name(s_last) <> '' and app.norm_name(last) <> ''
               and (position(app.norm_name(s_last) in app.norm_name(last)) > 0
                    or position(app.norm_name(last) in app.norm_name(s_last)) > 0) then 2
          else 0 end)
  + (case when app.norm_name(s_first) = app.norm_name(first) then 3
          when app.near_name(s_first, first) then 2
          when least(length(app.norm_name(s_first)), length(app.norm_name(first))) >= 3
               and (starts_with(app.norm_name(s_first), app.norm_name(first)) or starts_with(app.norm_name(first), app.norm_name(s_first))) then 1
          else -4 end)
  + (case when s_birthday is null or birthday is null then 0 when s_birthday = birthday then 4 else -4 end)
  + (case when s_grade is null or grade is null then 0 when s_grade = grade then 1 when abs(s_grade - grade) >= 2 then -2 else 0 end)
$$;

/** Students that look like this child (score ≥ 4), best first, with why. Office use only (callers check). */
create function app.similar_students(p_first text, p_last text, p_birthday date, p_grade int, p_except uuid default null)
returns table (id uuid, score int, first_name text, last_name text, grade int, birthday date, parents jsonb)
language sql stable security definer set search_path = public as $$
  select * from (
    select p.id, app.child_match_score(p.first_name, p.last_name, d.birthday, p.grade, p_first, p_last, p_birthday, p_grade) as score,
           p.first_name, p.last_name, p.grade, d.birthday,
           (select coalesce(jsonb_agg(jsonb_build_object('name', trim(q.first_name || ' ' || q.last_name), 'relation', g.relation)), '[]'::jsonb)
            from guardians g join profiles q on q.id = g.guardian_id where g.student_id = p.id)
    from profiles p left join student_details d on d.student_id = p.id
    where p.school_role = 'student' and p.id is distinct from p_except
  ) x where x.score >= 4
  order by x.score desc, x.last_name, x.first_name
  limit 5
$$;

-- ----------------------------------------------------------------------
-- Never the same child twice
-- ----------------------------------------------------------------------

/** Raise if another student has the same name and birthday. */
create function app.require_unique_child(p_id uuid, p_first text, p_last text, p_birthday date) returns void
language plpgsql stable security definer set search_path = public as $$
declare other text;
begin
  if p_birthday is null then return; end if;
  select trim(p.first_name || ' ' || p.last_name) into other
  from profiles p join student_details d on d.student_id = p.id
  where p.school_role = 'student' and p.id <> p_id and d.birthday = p_birthday
    and app.norm_name(p.first_name) = app.norm_name(p_first) and app.norm_name(p.last_name) = app.norm_name(p_last)
  limit 1;
  if other is not null then
    raise exception '% (born %) is already a student. Link the parent to the existing record instead of adding another.',
      other, to_char(p_birthday, 'FMMon FMDD, YYYY') using errcode = '23505';
  end if;
end $$;

create function app.unique_child_details() returns trigger
language plpgsql security definer set search_path = public as $$
declare p profiles%rowtype;
begin
  select * into p from profiles where id = new.student_id;
  perform app.require_unique_child(new.student_id, p.first_name, p.last_name, new.birthday);
  return new;
end $$;
create trigger unique_child_details before insert or update of birthday on public.student_details
  for each row execute function app.unique_child_details();

create function app.unique_child_name() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.school_role = 'student' then
    perform app.require_unique_child(new.id, new.first_name, new.last_name,
                                     (select birthday from student_details where student_id = new.id));
  end if;
  return new;
end $$;
create trigger unique_child_name before update of first_name, last_name, school_role on public.profiles
  for each row execute function app.unique_child_name();

-- ----------------------------------------------------------------------
-- The office: check before creating
-- ----------------------------------------------------------------------

/** The office: students that look like the child about to be added. */
create function public.admin_similar_students(p_first text, p_last text, p_birthday date default null, p_grade int default null)
returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  perform app.require_permission('people.family');
  return coalesce((select jsonb_agg(jsonb_build_object('id', id, 'score', score, 'strong', score >= 6,
                     'name', trim(first_name || ' ' || last_name), 'grade', grade, 'gradeLabel', app.grade_label(grade),
                     'birthday', birthday, 'parents', parents) order by score desc)
                   from app.similar_students(p_first, p_last, p_birthday, p_grade)), '[]'::jsonb);
end $$;

/** Raise when a strong match exists, unless the office confirmed it's a different child. */
create function app.require_no_strong_match(p_first text, p_last text, p_birthday date, p_grade int, p_force boolean) returns void
language plpgsql stable security definer set search_path = public as $$
declare m record;
begin
  if coalesce(p_force, false) then return; end if;
  select * into m from app.similar_students(p_first, p_last, p_birthday, p_grade) where score >= 6 limit 1;
  if found then
    raise exception 'This looks like % (%), who is already a student. Link to that record, or confirm it''s a different child.',
      trim(m.first_name || ' ' || m.last_name), coalesce(app.grade_label(m.grade), 'no grade') using errcode = '23505';
  end if;
end $$;

drop function public.admin_create_student(text, text, int, date, uuid, text);
/** Add a child (no login) and optionally link a parent. Refuses likely duplicates unless p_force. */
create function public.admin_create_student(
  p_first text, p_last text, p_grade int, p_birthday date default null, p_guardian uuid default null, p_relation text default null,
  p_force boolean default false
) returns uuid
language plpgsql security definer set search_path = public as $$
declare sid uuid;
begin
  perform app.require_permission('people.family');
  perform app.check_child_fields(p_first, p_last, p_grade);
  perform app.require_no_strong_match(p_first, p_last, p_birthday, p_grade, p_force);
  insert into profiles (first_name, last_name, school_role, grade, managed)
  values (trim(p_first), trim(p_last), 'student', p_grade, true) returning id into sid;
  if p_birthday is not null then
    insert into student_details (student_id, birthday, updated_by) values (sid, p_birthday, auth.uid());
  end if;
  if p_guardian is not null then perform public.admin_link_guardian(p_guardian, sid, true, p_relation); end if;
  perform app.audit(null, 'student.created', sid::text, jsonb_build_object('name', trim(p_first) || ' ' || trim(p_last), 'grade', p_grade,
                    'confirmedNotDuplicate', coalesce(p_force, false)));
  return sid;
end $$;

-- ----------------------------------------------------------------------
-- Parents' requests
-- ----------------------------------------------------------------------

drop function public.request_child(text, text, int, date, text, text);
create function public.request_child(p_first text, p_last text, p_grade int, p_birthday date default null, p_note text default null,
                                     p_relation text default null)
returns public.family_requests
language plpgsql security definer set search_path = public as $$
declare row family_requests%rowtype; mine text;
begin
  if coalesce(app.school_role(), 'student') in ('student', 'family') then
    raise exception 'Only approved parents and staff can add children.' using errcode = '42501';
  end if;
  perform app.check_child_fields(p_first, p_last, p_grade);
  if p_relation is null or p_relation not in ('mother', 'father') then raise exception 'Say whether you''re the mother or the father.'; end if;
  -- Already yours?
  select trim(p.first_name) into mine from guardians g join profiles p on p.id = g.student_id left join student_details d on d.student_id = p.id
  where g.guardian_id = auth.uid()
    and app.child_match_score(p.first_name, p.last_name, d.birthday, p.grade, p_first, p_last, p_birthday, p_grade) >= 6
  limit 1;
  if mine is not null then raise exception '% is already linked to your account.', mine; end if;
  -- Already asked?
  if exists (select 1 from family_requests where requested_by = auth.uid() and kind = 'add_child' and status = 'pending'
             and app.norm_name(details->>'firstName') = app.norm_name(p_first) and app.norm_name(details->>'lastName') = app.norm_name(p_last)) then
    raise exception 'You already asked to add %. The office will get back to you.', trim(p_first);
  end if;
  insert into family_requests (requested_by, kind, details)
  values (auth.uid(), 'add_child', jsonb_build_object('firstName', trim(p_first), 'lastName', trim(p_last), 'grade', p_grade,
                                                     'birthday', p_birthday, 'note', nullif(trim(p_note), ''), 'relation', p_relation))
  returning * into row;
  return row;
end $$;

/** Pending requests, each "add a child" with the students and other requests it looks like. */
create or replace function public.admin_family_requests() returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  perform app.require_permission('people.family');
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', r.id, 'kind', r.kind, 'details', r.details, 'createdAt', r.created_at,
      'requestedBy', jsonb_build_object('id', p.id, 'name', trim(p.first_name || ' ' || p.last_name), 'role', p.school_role),
      'student', case when s.id is null then null else jsonb_build_object('id', s.id, 'firstName', s.first_name,
                   'lastName', s.last_name, 'grade', s.grade) end,
      'matches', case when r.kind <> 'add_child' then '[]'::jsonb else coalesce((
        select jsonb_agg(jsonb_build_object('id', m.id, 'score', m.score, 'strong', m.score >= 6,
                 'name', trim(m.first_name || ' ' || m.last_name), 'gradeLabel', app.grade_label(m.grade),
                 'birthday', m.birthday, 'parents', m.parents) order by m.score desc)
        from app.similar_students(r.details->>'firstName', r.details->>'lastName', nullif(r.details->>'birthday', '')::date,
                                  (r.details->>'grade')::int) m), '[]'::jsonb) end,
      'similarRequests', case when r.kind <> 'add_child' then '[]'::jsonb else coalesce((
        select jsonb_agg(jsonb_build_object('id', o.id, 'from', trim(q.first_name || ' ' || q.last_name),
                 'relation', o.details->>'relation', 'name', trim((o.details->>'firstName') || ' ' || (o.details->>'lastName'))))
        from family_requests o join profiles q on q.id = o.requested_by
        where o.id <> r.id and o.kind = 'add_child' and o.status = 'pending'
          and app.child_match_score(o.details->>'firstName', o.details->>'lastName', nullif(o.details->>'birthday', '')::date,
                                    (o.details->>'grade')::int, r.details->>'firstName', r.details->>'lastName',
                                    nullif(r.details->>'birthday', '')::date, (r.details->>'grade')::int) >= 6), '[]'::jsonb) end)
      order by r.created_at)
    from family_requests r join profiles p on p.id = r.requested_by left join profiles s on s.id = r.student_id
    where r.status = 'pending'), '[]'::jsonb);
end $$;

drop function public.admin_decide_family_request(uuid, boolean, uuid, text);
/**
 * Approve or decline a parent's request. Approving "add a child" links the
 * parent to an existing student (p_existing) or creates one; creating refuses
 * a likely duplicate unless the office confirms it's a different child (p_force).
 */
create function public.admin_decide_family_request(
  p_request uuid, p_approve boolean, p_existing uuid default null, p_note text default null, p_force boolean default false
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
                                                               nullif(d->>'birthday', '')::date, null, null, p_force));
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

revoke all on function app.similar_students(text, text, date, int, uuid), app.require_unique_child(uuid, text, text, date),
  app.require_no_strong_match(text, text, date, int, boolean), app.unique_child_details(), app.unique_child_name()
  from public, anon, authenticated;
grant execute on function app.edit_distance(text, text), app.near_name(text, text), app.norm_name(text), app.child_match_score(text, text, date, int, text, text, date, int) to authenticated, service_role;
revoke all on function public.admin_similar_students(text, text, date, int), public.request_child(text, text, int, date, text, text),
  public.admin_create_student(text, text, int, date, uuid, text, boolean),
  public.admin_decide_family_request(uuid, boolean, uuid, text, boolean) from public, anon;
grant execute on function public.admin_similar_students(text, text, date, int), public.request_child(text, text, int, date, text, text),
  public.admin_create_student(text, text, int, date, uuid, text, boolean),
  public.admin_decide_family_request(uuid, boolean, uuid, text, boolean) to authenticated, service_role;
