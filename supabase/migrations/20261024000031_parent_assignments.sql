-- Parents see what their children's teachers have assigned (the Info tab's day view).
-- Only class assignments: a student's own entries and what they've checked off stay
-- private to the student. Family accounts aren't parents (no guardians link) and see none.

/** For a parent: their children's class assignments due from `p_from` to `p_to` (at most a month). */
create function public.child_assignments(p_from date default app.school_today(), p_to date default app.school_today() + 14)
returns table (id uuid, student_id uuid, roster_id text, class_name text, title text, details text, due_on date)
language sql stable security definer set search_path = public as $$
  select a.id, g.student_id, a.roster_id, r.name, a.title, a.details, a.due_on
  from guardians g
  join roster_members m on m.profile_id = g.student_id
  join rosters r on r.id = m.roster_id and r.kind = 'section'
  join assignments a on a.roster_id = r.id
  where g.guardian_id = auth.uid() and not app.is_family()
    and a.due_on between p_from and least(p_to, p_from + 31)
  order by a.due_on, r.name, a.title
$$;

revoke all on function public.child_assignments(date, date) from public, anon;
grant execute on function public.child_assignments(date, date) to authenticated, service_role;
