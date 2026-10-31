-- The bell in the top bar shows how many notifications are new: the ones on the bell page (the newest 50,
-- as my_notifications lists them) that this person hasn't opened yet. Opening the bell page marks them.

create function public.my_unread_count() returns int
language sql stable security definer set search_path = public as $$
  select count(*)::int from public.my_notifications(50) n
  where not exists (select 1 from notification_opens o where o.notification_id = n.id and o.user_id = auth.uid())
$$;

revoke all on function public.my_unread_count() from public, anon;
grant execute on function public.my_unread_count() to authenticated, service_role;

-- A free ticket order completes while the buyer is the one acting, and app.notify_user marks the person acting
-- as the sender, which keeps it off their own bell and phone. "Your tickets" now has no sender, like a paid
-- order's (Stripe's webhook), so the buyer always gets it.
create or replace function app.ticket_order_complete(o uuid, p_session text, p_payment text) returns void
language plpgsql security definer set search_path = public as $$
declare r ticket_orders; n int;
begin
  update ticket_orders set status = 'paid', paid_at = now(),
    stripe_session = coalesce(p_session, stripe_session), stripe_payment = coalesce(p_payment, stripe_payment)
  where id = o and status <> 'paid' returning * into r;
  if not found then return; end if;
  select count(*) into n from tickets where order_id = o;
  if r.buyer_id is not null then
    insert into notifications (audience, user_id, title, body, data, urgent, created_by)
    values ('user', r.buyer_id, '🎟️ Your tickets: ' || r.event_title,
      n || case when n = 1 then ' ticket' else ' tickets' end || ' · ' || app.sport_when(r.event_starts_at) || '. They''re in My Tickets.',
      jsonb_build_object('ticketOrderId', o), true, null);
  end if;
  perform app.audit(null, 'tickets.paid', o::text, jsonb_build_object('event', r.event_id, 'tickets', n, 'total', r.total_cents));
end $$;
