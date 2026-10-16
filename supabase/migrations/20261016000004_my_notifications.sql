-- The signed-in person's notification inbox (the bell in the app's top bar).
--
-- Reading public.notifications directly also returns notifications a person
-- triggered themselves, and every notification for admins with push.send (the
-- portal's history), so the inbox asks app.notification_for — the same rule
-- push delivery uses — whether each one was sent to them.

create function public.my_notifications(p_limit int default 50) returns setof public.notifications
language sql stable security definer set search_path = public as $$
  select n.* from notifications n
  where app.notification_for(n, auth.uid())
  order by n.created_at desc
  limit least(greatest(coalesce(p_limit, 50), 1), 200)
$$;
revoke all on function public.my_notifications(int) from public, anon;
grant execute on function public.my_notifications(int) to authenticated;
