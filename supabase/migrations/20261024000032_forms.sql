-- Forms: permission slips, releases and acknowledgments.
--
-- Teachers send forms to the class sections they lead, coaches and directors to the
-- students registered for one of their activity seasons, and the office (forms.send)
-- to grades or the whole school. A form has details, an optional link (a PDF or web
-- page), a due date and up to 10 questions (yes/no, short answer, choice). Parents
-- sign once per child by typing their full name, agreeing or declining; either
-- parent's signature counts, and they can change it while the form is open. Family
-- accounts aren't parents (no guardians link), so they get none. A form can't be
-- changed once it's sent; its sender (and forms.send holders) see who has signed,
-- remind the rest and close it. A form can carry a fee: the sender records each
-- child's payment as it comes in (how much, cash/check/card/online/other, where it
-- was handed in, and when), and the parents see it. Paying in the app comes later.

create table public.forms (
  id          uuid primary key default gen_random_uuid(),
  author_id   uuid references public.profiles (id) on delete set null,
  title       text not null check (char_length(trim(title)) between 1 and 100),
  details     text not null default '' check (char_length(details) <= 4000),
  link        text check (link ~* '^https://' and char_length(link) <= 500),
  due_on      date not null,
  audience    text not null check (audience in ('section', 'season', 'grades', 'school')),
  section_id  text references public.rosters (id) on delete set null,
  season_id   uuid references public.sport_seasons (id) on delete set null,
  grades      int[],
  questions   jsonb not null default '[]',
  fee_cents   int check (fee_cents between 1 and 10000000),   -- null = no fee
  status      text not null default 'open' check (status in ('open', 'closed')),
  reminded_at timestamptz,
  created_at  timestamptz not null default now()
);
create index on public.forms (author_id, created_at desc);

/** The students a form went to, fixed when it's sent. */
create table public.form_recipients (
  form_id    uuid not null references public.forms (id) on delete cascade,
  student_id uuid not null references public.profiles (id) on delete cascade,
  primary key (form_id, student_id)
);
create index on public.form_recipients (student_id);

/** One signature per child: agreed or declined, the answers, and the typed name. */
create table public.form_responses (
  form_id    uuid not null,
  student_id uuid not null,
  signed_by  uuid references public.profiles (id) on delete set null,
  agreed     boolean not null,
  answers    jsonb not null default '{}',
  signature  text not null check (char_length(trim(signature)) between 2 and 100),
  signed_at  timestamptz not null default now(),
  primary key (form_id, student_id),
  foreign key (form_id, student_id) references public.form_recipients (form_id, student_id) on delete cascade
);

/** A fee paid for one child, recorded by the form's sender: how much, how, where it was handed in, and when. */
create table public.form_payments (
  form_id      uuid not null,
  student_id   uuid not null,
  amount_cents int not null check (amount_cents between 1 and 10000000),
  method       text not null check (method in ('cash', 'check', 'card', 'online', 'other')),
  delivered_to text not null check (char_length(trim(delivered_to)) between 1 and 80),
  received_on  date not null,
  note         text not null default '' check (char_length(note) <= 200),
  recorded_by  uuid references public.profiles (id) on delete set null,
  recorded_at  timestamptz not null default now(),
  primary key (form_id, student_id),
  foreign key (form_id, student_id) references public.form_recipients (form_id, student_id) on delete cascade
);

alter table public.forms enable row level security;
alter table public.form_recipients enable row level security;
alter table public.form_responses enable row level security;
alter table public.form_payments enable row level security;

/** Sent this form, or holds forms.send (authenticator-verified). */
create function app.runs_form(f uuid, u uuid default auth.uid()) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from forms where id = f and author_id = u) or app.has_permission('forms.send', u)
$$;

/** A parent (never a Family account) of a student this form went to. */
create function app.signs_form(f uuid, s uuid, u uuid default auth.uid()) returns boolean
language sql stable security definer set search_path = public as $$
  select app.is_guardian_of(s, u) and exists (select 1 from form_recipients where form_id = f and student_id = s)
$$;

create policy "the sender, and parents of students it went to" on public.forms for select to authenticated
  using (app.runs_form(forms.id) or exists (select 1 from form_recipients r where r.form_id = forms.id and app.is_guardian_of(r.student_id)));
create policy "the sender, and the student's parents" on public.form_recipients for select to authenticated
  using (app.runs_form(form_id) or app.is_guardian_of(student_id));
create policy "the sender, and the student's parents" on public.form_responses for select to authenticated
  using (app.runs_form(form_id) or app.is_guardian_of(student_id));
create policy "the sender, and the student's parents" on public.form_payments for select to authenticated
  using (app.runs_form(form_id) or app.is_guardian_of(student_id));

/** Checks a form's questions and gives each an id (q1, q2…): yes/no, short answer, or choice (2–10 options). */
create function app.clean_form_questions(q jsonb) returns jsonb
language plpgsql immutable as $$
declare item jsonb; result jsonb := '[]'; n int := 0; kind text; prompt text; opts jsonb;
begin
  if q is null or jsonb_typeof(q) <> 'array' then return '[]'; end if;
  if jsonb_array_length(q) > 10 then raise exception 'A form can have up to 10 questions.'; end if;
  for item in select value from jsonb_array_elements(q) loop
    n := n + 1;
    kind := item->>'kind';
    prompt := nullif(trim(item->>'prompt'), '');
    if kind is null or kind not in ('yes_no', 'text', 'choice') then
      raise exception 'Question %: pick yes/no, short answer or choice.', n;
    end if;
    if prompt is null or char_length(prompt) > 200 then raise exception 'Question % needs a question (up to 200 characters).', n; end if;
    opts := '[]';
    if kind = 'choice' then
      select coalesce(jsonb_agg(o order by i), '[]') into opts from (
        select trim(x) as o, min(i) as i from jsonb_array_elements_text(coalesce(item->'options', '[]')) with ordinality as t(x, i)
        where trim(x) <> '' group by trim(x)) s;
      if jsonb_array_length(opts) not between 2 and 10 then raise exception 'Question % needs 2 to 10 choices.', n; end if;
    end if;
    result := result || jsonb_build_array(jsonb_build_object('id', 'q' || n, 'kind', kind, 'prompt', prompt,
      'required', coalesce((item->>'required')::boolean, false), 'options', opts));
  end loop;
  return result;
end $$;

-- ======================================================================
-- API
-- ======================================================================

/**
 * Send a form to a class section (`p_section`, its teacher), an activity season's
 * registered students (`p_season`, its coaches and directors), some grades or the whole
 * school (forms.send), with an optional fee per child. Each parent of those students is told once.
 */
create function public.form_send(
  p_title text, p_details text, p_link text, p_due_on date, p_audience text,
  p_section text default null, p_season uuid default null, p_grades int[] default null, p_questions jsonb default '[]',
  p_fee_cents int default null
) returns public.forms
language plpgsql security definer set search_path = public as $$
declare f forms%rowtype; r rosters%rowtype; qs jsonb; link text := nullif(trim(p_link), ''); n int; g record;
begin
  if app.school_role() is null or not (app.is_staff() or app.has_permission('forms.send')) then
    raise exception 'Faculty and staff send forms.' using errcode = '42501';
  end if;
  if p_audience = 'section' then
    select * into r from rosters where id = p_section and kind = 'section';
    if not found then raise exception 'Pick one of your classes.'; end if;
    if r.lead_id is distinct from auth.uid() and not app.has_permission('forms.send') then
      raise exception 'You can send forms to the classes you teach.' using errcode = '42501';
    end if;
  elsif p_audience = 'season' then
    if not exists (select 1 from sport_seasons where id = p_season) then raise exception 'Pick one of your activities.'; end if;
    if not app.can_manage_sport(app.season_sport(p_season)) and not app.has_permission('forms.send') then
      raise exception 'You can send forms to the activities you coach or direct.' using errcode = '42501';
    end if;
  elsif p_audience in ('grades', 'school') then
    perform app.require_permission('forms.send');
    if p_audience = 'grades' and coalesce(cardinality(p_grades), 0) = 0 then raise exception 'Pick at least one grade.'; end if;
  else
    raise exception 'Pick who gets the form.';
  end if;
  if nullif(trim(p_title), '') is null then raise exception 'Give the form a title.'; end if;
  if p_due_on is null or p_due_on < app.school_today() then raise exception 'Pick a due date from today on.'; end if;
  if link is not null and link !~* '^https://' then raise exception 'Links start with https://'; end if;
  if p_fee_cents is not null and p_fee_cents not between 1 and 10000000 then raise exception 'Enter the fee in dollars, or leave it empty.'; end if;
  qs := app.clean_form_questions(p_questions);

  insert into forms (author_id, title, details, link, due_on, audience, section_id, season_id, grades, questions, fee_cents)
  values (auth.uid(), trim(p_title), coalesce(trim(p_details), ''), link, p_due_on, p_audience,
          case when p_audience = 'section' then p_section end, case when p_audience = 'season' then p_season end,
          case when p_audience = 'grades' then p_grades end, qs, p_fee_cents)
  returning * into f;
  insert into form_recipients (form_id, student_id)
  select f.id, p.id from profiles p
  where p.school_role = 'student' and (
       (p_audience = 'section' and p.id in (select profile_id from roster_members where roster_id = p_section))
    or (p_audience = 'season' and p.id in (select student_id from sport_registrations where season_id = p_season and status = 'registered'))
    or (p_audience = 'grades' and p.grade = any (p_grades))
    or p_audience = 'school');
  get diagnostics n = row_count;
  if n = 0 then raise exception 'There are no students to send it to yet.'; end if;

  for g in select distinct gd.guardian_id from guardians gd join form_recipients fr on fr.student_id = gd.student_id
           where fr.form_id = f.id and not app.is_family(gd.guardian_id) loop
    perform app.notify_user(g.guardian_id, '📝 ' || f.title,
      'Please read and sign by ' || to_char(f.due_on, 'Dy, Mon FMDD') || '.', jsonb_build_object('formId', f.id));
  end loop;
  return f;
end $$;

/**
 * A parent signs for one child: agrees (answering the required questions) or declines,
 * with their typed full name. Signing again while the form is open replaces it.
 */
create function public.form_sign(p_form uuid, p_student uuid, p_agree boolean, p_answers jsonb, p_signature text)
returns public.form_responses
language plpgsql security definer set search_path = public as $$
declare f forms%rowtype; resp form_responses%rowtype; q jsonb; a text; clean jsonb := '{}';
begin
  select * into f from forms where id = p_form;
  if not found or not app.signs_form(p_form, p_student) then
    raise exception 'Only a parent of a student this form went to can sign it.' using errcode = '42501';
  end if;
  if f.status <> 'open' then raise exception 'This form is closed.'; end if;
  if p_agree is null then raise exception 'Agree or decline.'; end if;
  if char_length(trim(coalesce(p_signature, ''))) < 2 then raise exception 'Type your full name to sign.'; end if;
  for q in select value from jsonb_array_elements(f.questions) loop
    a := nullif(trim(coalesce(p_answers, '{}')->>(q->>'id')), '');
    if a is null then
      if p_agree and (q->>'required')::boolean then raise exception 'Please answer "%".', q->>'prompt'; end if;
      continue;
    end if;
    if q->>'kind' = 'yes_no' and a not in ('yes', 'no') then raise exception 'Answer "%" with yes or no.', q->>'prompt'; end if;
    if q->>'kind' = 'choice' and not (q->'options') ? a then raise exception 'Pick one of the choices for "%".', q->>'prompt'; end if;
    if char_length(a) > 500 then raise exception 'Keep answers to 500 characters.'; end if;
    clean := clean || jsonb_build_object(q->>'id', a);
  end loop;
  insert into form_responses (form_id, student_id, signed_by, agreed, answers, signature, signed_at)
  values (p_form, p_student, auth.uid(), p_agree, clean, trim(p_signature), now())
  on conflict (form_id, student_id) do update
    set signed_by = excluded.signed_by, agreed = excluded.agreed, answers = excluded.answers,
        signature = excluded.signature, signed_at = excluded.signed_at
  returning * into resp;
  return resp;
end $$;

/** Remind the parents of every child not signed for yet (at most once an hour). Returns how many were told. */
create function public.form_remind(p_form uuid) returns int
language plpgsql security definer set search_path = public as $$
declare f forms%rowtype; g record; n int := 0;
begin
  select * into f from forms where id = p_form;
  if not found or not app.runs_form(p_form) then
    raise exception 'Only whoever sent this form can send reminders.' using errcode = '42501';
  end if;
  if f.status <> 'open' then raise exception 'This form is closed.'; end if;
  if f.reminded_at > now() - interval '1 hour' then raise exception 'A reminder went out less than an hour ago.'; end if;
  for g in select distinct gd.guardian_id from form_recipients r join guardians gd on gd.student_id = r.student_id
           where r.form_id = p_form and not app.is_family(gd.guardian_id)
             and not exists (select 1 from form_responses x where x.form_id = r.form_id and x.student_id = r.student_id) loop
    perform app.notify_user(g.guardian_id, '📝 Reminder: ' || f.title,
      'Please read and sign by ' || to_char(f.due_on, 'Dy, Mon FMDD') || '.', jsonb_build_object('formId', f.id));
    n := n + 1;
  end loop;
  update forms set reminded_at = now() where id = p_form;
  return n;
end $$;

/** "$25.00". */
create function app.dollars(cents int) returns text
language sql immutable as $$ select '$' || to_char(cents / 100.0, 'FM999,999,990.00') $$;

/**
 * The sender records a child's payment (or changes it): the amount, how it was paid,
 * where it was handed in and when. The parents are told the first time.
 */
create function public.form_record_payment(p_form uuid, p_student uuid, p_amount_cents int, p_method text, p_delivered_to text,
  p_received_on date default null, p_note text default '') returns public.form_payments
language plpgsql security definer set search_path = public as $$
declare f forms%rowtype; pay form_payments%rowtype; first boolean; g record; kid text;
begin
  select * into f from forms where id = p_form;
  if not found or not app.runs_form(p_form) then
    raise exception 'Only whoever sent this form can record payments.' using errcode = '42501';
  end if;
  if f.fee_cents is null then raise exception 'This form has no fee.'; end if;
  if not exists (select 1 from form_recipients where form_id = p_form and student_id = p_student) then
    raise exception 'This form didn''t go to that student.';
  end if;
  if p_amount_cents is null or p_amount_cents not between 1 and 10000000 then raise exception 'Enter the amount paid.'; end if;
  if p_method is null or p_method not in ('cash', 'check', 'card', 'online', 'other') then raise exception 'Pick how it was paid.'; end if;
  if nullif(trim(p_delivered_to), '') is null then raise exception 'Say where it was handed in.'; end if;
  if coalesce(p_received_on, app.school_today()) > app.school_today() then raise exception 'The date can''t be in the future.'; end if;
  first := not exists (select 1 from form_payments where form_id = p_form and student_id = p_student);
  insert into form_payments (form_id, student_id, amount_cents, method, delivered_to, received_on, note, recorded_by, recorded_at)
  values (p_form, p_student, p_amount_cents, p_method, trim(p_delivered_to), coalesce(p_received_on, app.school_today()),
          coalesce(trim(p_note), ''), auth.uid(), now())
  on conflict (form_id, student_id) do update
    set amount_cents = excluded.amount_cents, method = excluded.method, delivered_to = excluded.delivered_to,
        received_on = excluded.received_on, note = excluded.note, recorded_by = excluded.recorded_by, recorded_at = excluded.recorded_at
  returning * into pay;
  if first then
    select first_name into kid from profiles where id = p_student;
    for g in select guardian_id from guardians where student_id = p_student and not app.is_family(guardian_id) loop
      perform app.notify_user(g.guardian_id, '💵 ' || f.title,
        'Payment received for ' || kid || ': ' || app.dollars(pay.amount_cents) || ' (' || pay.method || ').', jsonb_build_object('formId', f.id));
    end loop;
  end if;
  return pay;
end $$;

/** Remove a payment recorded by mistake. */
create function public.form_clear_payment(p_form uuid, p_student uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not app.runs_form(p_form) then raise exception 'Only whoever sent this form can change payments.' using errcode = '42501'; end if;
  delete from form_payments where form_id = p_form and student_id = p_student;
end $$;

/** A payment as JSON; `with_note` adds the note and who recorded it (for the sender). */
create function app.form_payment_json(p public.form_payments, with_note boolean) returns jsonb
language sql stable security definer set search_path = public as $$
  select case when p.form_id is null then null else jsonb_build_object('amountCents', p.amount_cents, 'method', p.method,
    'deliveredTo', p.delivered_to, 'receivedOn', p.received_on) || case when with_note then jsonb_build_object('note', p.note,
    'recordedBy', (select trim(first_name || ' ' || last_name) from profiles where id = p.recorded_by)) else '{}' end end
$$;

/** Stop taking signatures. */
create function public.form_close(p_form uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not app.runs_form(p_form) then raise exception 'Only whoever sent this form can close it.' using errcode = '42501'; end if;
  update forms set status = 'closed' where id = p_form;
end $$;

/** A form as JSON (without who signed). */
create function app.form_json(f public.forms) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object('id', f.id, 'title', f.title, 'details', f.details, 'link', f.link, 'dueOn', f.due_on,
    'status', f.status, 'questions', f.questions, 'audience', f.audience, 'createdAt', f.created_at, 'feeCents', f.fee_cents,
    'authorId', f.author_id, 'author', (select trim(first_name || ' ' || last_name) from profiles where id = f.author_id),
    'sentTo', case f.audience
      when 'section' then (select name from rosters where id = f.section_id)
      when 'season' then (select sp.name || ' · ' || se.name from sport_seasons se join sports sp on sp.id = se.sport_id where se.id = f.season_id)
      when 'grades' then case when cardinality(f.grades) = 1
        then app.grade_label(f.grades[1]) || case when f.grades[1] >= 1 then ' grade' else '' end
        else 'Grades ' || (select string_agg(app.grade_label(g), ', ' order by g) from unnest(f.grades) g) end
      else 'The whole school' end)
$$;

/** For a parent: the forms that went to their children, each child's signature (or none yet), soonest due first. */
create function public.my_forms() returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(t.j order by t.due_on, t.title), '[]') from (
    select f.due_on, f.title, app.form_json(f) || jsonb_build_object('children', (
      select jsonb_agg(jsonb_build_object('studentId', r.student_id, 'name', s.first_name,
        'response', case when x.student_id is null then null else jsonb_build_object(
          'agreed', x.agreed, 'answers', x.answers, 'signature', x.signature, 'signedAt', x.signed_at,
          'signedBy', (select trim(first_name || ' ' || last_name) from profiles where id = x.signed_by)) end,
        'payment', app.form_payment_json(pay, false))
        order by s.first_name)
      from form_recipients r join profiles s on s.id = r.student_id
      left join form_responses x on x.form_id = r.form_id and x.student_id = r.student_id
      left join form_payments pay on pay.form_id = r.form_id and pay.student_id = r.student_id
      where r.form_id = f.id and app.is_guardian_of(r.student_id))) as j
    from forms f
    where exists (select 1 from form_recipients r where r.form_id = f.id and app.is_guardian_of(r.student_id))) t
$$;

/** For senders: the forms they sent (every form, with forms.send), newest first, with counts. */
create function public.sent_forms() returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(t.j order by t.created_at desc), '[]') from (
    select f.created_at, app.form_json(f) || jsonb_build_object(
      'students', (select count(*) from form_recipients r where r.form_id = f.id),
      'agreed', (select count(*) from form_responses x where x.form_id = f.id and x.agreed),
      'declined', (select count(*) from form_responses x where x.form_id = f.id and not x.agreed),
      'paid', (select count(*) from form_payments x where x.form_id = f.id),
      'collectedCents', (select coalesce(sum(amount_cents), 0) from form_payments x where x.form_id = f.id)) as j
    from forms f where app.runs_form(f.id)) t
$$;

/** For a form's sender: every student it went to, whether they have a parent in the app, and the signature. */
create function public.form_status(p_form uuid) returns jsonb
language sql stable security definer set search_path = public as $$
  select app.form_json(f) || jsonb_build_object('students', coalesce((
    select jsonb_agg(jsonb_build_object('studentId', r.student_id, 'name', trim(s.first_name || ' ' || s.last_name),
      'grade', s.grade, 'hasParent', exists (select 1 from guardians gd where gd.student_id = r.student_id and not app.is_family(gd.guardian_id)),
      'response', case when x.student_id is null then null else jsonb_build_object(
        'agreed', x.agreed, 'answers', x.answers, 'signature', x.signature, 'signedAt', x.signed_at,
        'signedBy', (select trim(first_name || ' ' || last_name) from profiles where id = x.signed_by)) end,
      'payment', app.form_payment_json(pay, true))
      order by s.last_name, s.first_name)
    from form_recipients r join profiles s on s.id = r.student_id
    left join form_responses x on x.form_id = r.form_id and x.student_id = r.student_id
    left join form_payments pay on pay.form_id = r.form_id and pay.student_id = r.student_id
    where r.form_id = f.id), '[]'))
  from forms f where f.id = p_form and app.runs_form(f.id)
$$;

-- ======================================================================
-- The forms.send admin permission (directors and administrators get it)
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
    ('audit.view',       'Activity log',          'Review the school-wide activity log.')
$$;

update public.admin_roles set permissions = permissions || 'forms.send'::text
where id in ('director', 'administrator') and not ('forms.send' = any (permissions));

-- ======================================================================
-- Privileges
-- ======================================================================

revoke all on function app.runs_form(uuid, uuid), app.signs_form(uuid, uuid, uuid), app.clean_form_questions(jsonb),
  app.form_json(public.forms), app.form_payment_json(public.form_payments, boolean), app.dollars(int) from public, anon;
grant execute on function app.runs_form(uuid, uuid), app.signs_form(uuid, uuid, uuid), app.clean_form_questions(jsonb),
  app.form_json(public.forms), app.form_payment_json(public.form_payments, boolean), app.dollars(int) to authenticated, service_role;

revoke all on function public.form_send(text, text, text, date, text, text, uuid, int[], jsonb, int),
  public.form_sign(uuid, uuid, boolean, jsonb, text), public.form_remind(uuid), public.form_close(uuid),
  public.form_record_payment(uuid, uuid, int, text, text, date, text), public.form_clear_payment(uuid, uuid),
  public.my_forms(), public.sent_forms(), public.form_status(uuid) from public, anon;
grant execute on function public.form_send(text, text, text, date, text, text, uuid, int[], jsonb, int),
  public.form_sign(uuid, uuid, boolean, jsonb, text), public.form_remind(uuid), public.form_close(uuid),
  public.form_record_payment(uuid, uuid, int, text, text, date, text), public.form_clear_payment(uuid, uuid),
  public.my_forms(), public.sent_forms(), public.form_status(uuid) to authenticated, service_role;

-- Reads go through row-level security; writes only through the functions above.
revoke all on public.forms, public.form_recipients, public.form_responses, public.form_payments from anon;
revoke insert, update, delete on public.forms, public.form_recipients, public.form_responses, public.form_payments from authenticated;
grant select on public.forms, public.form_recipients, public.form_responses, public.form_payments to authenticated;
grant all on public.forms, public.form_recipients, public.form_responses, public.form_payments to service_role;
