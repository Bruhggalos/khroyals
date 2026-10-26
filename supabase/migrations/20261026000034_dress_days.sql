-- Dress-up days (Spirit Week and the like): on a school day, a theme students may wear instead of
-- the uniform, optionally for some grades only. The Planner's "What to wear" card shows the day's
-- theme above the usual uniform. Everyone (signed out too) reads them; school calendar editors
-- (calendar.school) add, change and remove them through the functions below.

create table public.dress_days (
  id          uuid primary key default gen_random_uuid(),
  week        text check (week is null or length(trim(week)) between 1 and 60),   -- "Spirit Week"
  on_date     date not null,
  title       text not null check (length(trim(title)) between 1 and 80),          -- "Mismatch Monday"
  details     text not null default '' check (length(details) <= 600),
  grade_from  int check (grade_from between -3 and 12),                           -- K2 = -3 … 12th = 12; null = everyone
  grade_to    int check (grade_to between -3 and 12),
  created_by  uuid references public.profiles (id) on delete set null,
  created_at  timestamptz not null default now(),
  check ((grade_from is null) = (grade_to is null) and (grade_from is null or grade_from <= grade_to))
);
create index on public.dress_days (on_date);

alter table public.dress_days enable row level security;
create policy "everyone reads dress-up days" on public.dress_days for select to anon, authenticated using (true);

/** calendar.school: add a dress-up day (p_id null) or change one. Returns its id. */
create function public.dress_day_save(
  p_id uuid, p_week text, p_on date, p_title text, p_details text default '',
  p_grade_from int default null, p_grade_to int default null
) returns uuid
language plpgsql security definer set search_path = public as $$
declare new_id uuid;
begin
  perform app.require_permission('calendar.school');
  if coalesce(trim(p_title), '') = '' then raise exception 'Give the day a name, like "Mismatch Monday".'; end if;
  if p_on is null then raise exception 'Pick the day.'; end if;
  if (p_grade_from is null) <> (p_grade_to is null) or p_grade_from > p_grade_to then
    raise exception 'Pick both the first and last grade, or neither for everyone.';
  end if;
  if p_id is null then
    insert into dress_days (week, on_date, title, details, grade_from, grade_to, created_by)
    values (nullif(trim(p_week), ''), p_on, trim(p_title), coalesce(trim(p_details), ''), p_grade_from, p_grade_to, auth.uid())
    returning id into new_id;
  else
    update dress_days set week = nullif(trim(p_week), ''), on_date = p_on, title = trim(p_title),
      details = coalesce(trim(p_details), ''), grade_from = p_grade_from, grade_to = p_grade_to
    where id = p_id returning id into new_id;
    if new_id is null then raise exception 'That dress-up day is gone.'; end if;
  end if;
  perform app.audit(null, 'dress_day.saved', new_id::text, jsonb_build_object('title', trim(p_title), 'on', p_on));
  return new_id;
end $$;

/** calendar.school: remove a dress-up day. */
create function public.dress_day_delete(p_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare gone text;
begin
  perform app.require_permission('calendar.school');
  delete from dress_days where id = p_id returning title into gone;
  if gone is not null then perform app.audit(null, 'dress_day.deleted', p_id::text, jsonb_build_object('title', gone)); end if;
end $$;

revoke all on function public.dress_day_save(uuid, text, date, text, text, int, int), public.dress_day_delete(uuid) from public, anon;
grant execute on function public.dress_day_save(uuid, text, date, text, text, int, int), public.dress_day_delete(uuid)
  to authenticated, service_role;

-- Reads go through row-level security; writes only through the functions above.
revoke insert, update, delete on public.dress_days from anon, authenticated;
grant select on public.dress_days to anon, authenticated;
grant all on public.dress_days to service_role;

-- Spirit Week, October 26–30, 2026 (from the school's "Save the Dates" email).
insert into public.dress_days (week, on_date, title, details, grade_from, grade_to) values
  ('Spirit Week', '2026-10-26', 'Mismatch Monday',
   'Mix it up by wearing your craziest combination of colors, patterns, and styles. The more mismatched, the better! Just be sure your outfit remains school-appropriate.', null, null),
  ('Spirit Week', '2026-10-27', 'Team Tuesday',
   'Wear your favorite team''s jersey or shirt and proudly represent the team you love most, from the pros to college teams and everything in between.', null, null),
  ('Spirit Week', '2026-10-28', 'Western Wednesday',
   'Dress in your best western wear with cowboy hats, boots, denim, flannel, and all your favorite western-inspired accessories.', null, null),
  ('Spirit Week', '2026-10-29', 'Twinning Thursday',
   'Grab a friend (or two) and dress alike for Twin Day fun, but don''t forget to keep your matching outfits within school dress code guidelines.', 6, 12),
  ('Spirit Week', '2026-10-29', 'Character Day',
   'Students are welcome to dress as their favorite book, movie, or other well-known character. Please avoid scary, violent, or inappropriate characters.', -3, 5),
  ('Spirit Week', '2026-10-30', 'Royal Fun Friday',
   'Students may wear their favorite Kingdom Heights t-shirt or enjoy a dress-down day as they attend Fall Fest.', null, null);
