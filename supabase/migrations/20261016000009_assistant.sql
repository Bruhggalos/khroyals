-- Kingdom Heights Assistant (Apps → Assistant).
--
-- The assistant Edge Function (supabase/functions/assistant) answers questions
-- with Claude from the Student / Parent Handbook, the upcoming events the person
-- can see, and the staff directory below. Approved accounts only. Each question
-- counts against a daily limit, and token use is logged per person per day so
-- the school can see what it costs.
--
-- The directory starts from the khroyals.com "Meet Our Team" page and the
-- handbook. Only email addresses the school publishes are listed; everyone else
-- is reached through the front office. Edit it in the Supabase dashboard
-- (public.assistant_contacts) when staff change.

insert into app.settings values
  ('assistant_model', 'claude-haiku-5-5'),
  ('assistant_daily_limit', '25')            -- 0 = no limit
on conflict (key) do nothing;

create table public.assistant_contacts (
  id         uuid primary key default gen_random_uuid(),
  sort       int not null default 100,
  name       text not null,
  title      text not null,
  helps_with text not null default '',      -- what to ask them about; the assistant routes on this
  email      text,
  phone      text,
  active     boolean not null default true
);
alter table public.assistant_contacts enable row level security;
create policy "approved people read the directory" on public.assistant_contacts for select to authenticated
  using (app.school_role() is not null);

insert into public.assistant_contacts (sort, name, title, helps_with, email, phone) values
  (10, 'Ashlee Rodgers', 'Front Desk', 'general questions, school hours, drop-off and pick-up, early dismissals, visitors, forms, and anything you''re not sure who to ask', 'info@khroyals.com', '(256) 210-1343'),
  (11, 'Attendance', 'Front office attendance line', 'reporting a K5-12 student''s absence before 8:15 am (include the child''s name and the reason); K2-K4 parents tell their child''s teacher instead', 'attendance@khroyals.com', null),
  (20, 'Dr. Rachel Ballard', 'Head of School', 'school-wide concerns and decisions that the front office or deans can''t resolve', null, null),
  (21, 'Kelly Wynn', 'Dean of Instruction and Accountability', 'academics, curriculum, teaching and learning, and academic concerns', null, null),
  (22, 'Pastor Cheryl Bennett', 'Associate Dean of Student Services and Operations', 'student support services, learning support (IEP / 504), behavior and discipline, and school operations', null, null),
  (23, 'Daniel Jackson', 'Dean of Spiritual Formation', 'chapel, Bible classes, discipleship and spiritual life', null, null),
  (24, 'Kat Holder', 'Fine Arts Director', 'fine arts, music, theatre and performances', null, null),
  (25, 'Coach Kendrick Epps', 'Athletic Director', 'sports teams, tryouts, practices, games and athletic eligibility', null, null),
  (26, 'Maria Sudhakar', 'Director of Admissions and Registrar', 'admissions, enrollment and re-enrollment, student records and transcripts', 'admissions@khroyals.com', null),
  (27, 'Olivia Clary', 'Administrative Coordinator', 'administrative questions and scheduling', 'oclary@khroyals.com', null),
  (28, 'Bianca Hughes', 'School Nurse', 'health, illness, medication at school and health forms', null, null),
  (29, 'Brenten Calvert', 'IT', 'technology, devices, school accounts and the KH Royals app', null, null),
  (40, 'Miss Hunt', 'K2 Teacher', 'the K2 class', 'lhunt@khroyals.com', null),
  (41, 'Monica Sorensen', 'Kindergarten Teacher', 'the kindergarten class', null, null),
  (42, 'Rachel Counts', 'First Grade Teacher', 'the first grade class', null, null),
  (43, 'Lauren Schad', 'Second-Third Grade Teacher', 'the second and third grade class', null, null),
  (44, 'Harriet Watson', 'Fourth Grade Teacher', 'the fourth grade class', null, null),
  (45, 'Karla Murphy', 'Fifth Grade Teacher', 'the fifth grade class', null, null),
  (46, 'Justin Staples', 'Science Teacher', 'science classes', null, null),
  (47, 'Jennifer Winebrener', 'History Teacher', 'history classes', null, null),
  (48, 'Katie Graham', 'English Teacher', 'English classes', null, null),
  (49, 'Lana Torhina', 'Early Learning Academy team', 'the Early Learning Academy (daycare)', null, null);

-- Questions and tokens per person per day (Central time). Private: only the
-- assistant function writes it; read it in the dashboard to see costs.
create table app.assistant_usage (
  user_id            uuid not null references public.profiles (id) on delete cascade,
  day                date not null,
  questions          int not null default 0,
  input_tokens       bigint not null default 0,
  output_tokens      bigint not null default 0,
  cache_read_tokens  bigint not null default 0,
  cache_write_tokens bigint not null default 0,
  primary key (user_id, day)
);

/**
 * Count one question against today's limit. Over the limit it raises, which
 * rolls the count back. Returns how many are left (null when unlimited) and the
 * model to use. For the assistant function (service role) only.
 */
create function public.assistant_take_question(p_user uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare lim int := coalesce(app.setting('assistant_daily_limit'), '25')::int; used int;
begin
  if app.school_role(p_user) is null then raise exception 'The assistant opens once the school office approves your account.'; end if;
  insert into app.assistant_usage (user_id, day, questions) values (p_user, app.school_today(), 1)
  on conflict (user_id, day) do update set questions = app.assistant_usage.questions + 1
  returning questions into used;
  if lim > 0 and used > lim then
    raise exception 'You''ve asked the % questions you can ask today. Try again tomorrow, or reach the front office: info@khroyals.com, (256) 210-1343.', lim;
  end if;
  return jsonb_build_object('remaining', case when lim > 0 then lim - used end,
                            'model', coalesce(app.setting('assistant_model'), 'claude-haiku-5-5'));
end $$;

/** Record what a question used, or give it back when Claude couldn't answer. */
create function public.assistant_finish(
  p_user uuid, p_answered boolean, p_input int default 0, p_output int default 0, p_cache_read int default 0, p_cache_write int default 0
) returns void
language sql security definer set search_path = public as $$
  update app.assistant_usage set
    questions = questions - case when p_answered then 0 else 1 end,
    input_tokens = input_tokens + p_input, output_tokens = output_tokens + p_output,
    cache_read_tokens = cache_read_tokens + p_cache_read, cache_write_tokens = cache_write_tokens + p_cache_write
  where user_id = p_user and day = app.school_today()
$$;

revoke all on function public.assistant_take_question(uuid), public.assistant_finish(uuid, boolean, int, int, int, int)
  from public, anon, authenticated;
grant execute on function public.assistant_take_question(uuid), public.assistant_finish(uuid, boolean, int, int, int, int)
  to service_role;

revoke all on public.assistant_contacts from anon;
revoke insert, update, delete on public.assistant_contacts from authenticated;
grant select on public.assistant_contacts to authenticated;
grant all on public.assistant_contacts to service_role;
grant all on app.assistant_usage to service_role;
