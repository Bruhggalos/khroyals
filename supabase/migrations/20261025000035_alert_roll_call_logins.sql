-- Critical alert roll calls only list people who can answer: teachers, staff and admins
-- with a login. Profiles without one (managed = true, like the presentation's made-up
-- teachers) never get the alert, so they showed as "No answer" forever.

create or replace function app.alert_staff() returns setof uuid
language sql stable security definer set search_path = public as $$
  select id from profiles where school_role in ('admin', 'teacher', 'staff') and not managed
$$;

revoke all on function app.alert_staff() from public, anon, authenticated;
