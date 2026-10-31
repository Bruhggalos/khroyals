-- Test only (tests/db.test.ts): records every notification as it's sent, with how many people it reached at
-- that moment (their bell) and how many of them it would push to (wants_push at noon, so quiet hours set by a
-- test don't depend on the clock), plus the call stack that sent it. A group post follows each member's setting
-- (a group may notify only for announcements), so `reachable` also counts the members who could have been told.
-- The last test checks the log.
create schema test_log;

create table test_log.notifications (
  id uuid, title text, data jsonb, audience text, recipients int, pushes int, reachable int, sent_from text
);

create function test_log.record() returns trigger
language plpgsql security definer set search_path = public as $$
declare ctx text;
begin
  get diagnostics ctx = pg_context;
  insert into test_log.notifications
  select new.id, new.title, new.data, new.audience, count(*),
         count(*) filter (where app.wants_push(new, p.id, '2026-10-14 12:00 America/Chicago'::timestamptz)),
         case when new.audience = 'group' then (select count(*) from memberships m where m.group_id = new.group_id
           and m.user_id is distinct from new.created_by and app.can_view_content(new.group_id, m.user_id)) else count(*) end, ctx
  from profiles p where app.notification_for(new, p.id);
  return new;
end $$;

create trigger test_log after insert on public.notifications
  for each row execute function test_log.record();
