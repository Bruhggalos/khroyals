-- Clearing notifications, and deleting Marketplace posts at any stage.
--
-- Notifications: people can delete one (swipe or ✕) or clear them all. That
-- hides them from that person's inbox only; senders' history and stats stay.
--
-- Marketplace: sellers can delete their post whether it's open, has a sale
-- pending (the buyer is told the sale is off) or is sold (it leaves their
-- list). Everyone still waiting in line is told it's gone.

create table public.notification_dismissals (
  notification_id uuid not null references public.notifications (id) on delete cascade,
  user_id         uuid not null references public.profiles (id) on delete cascade,
  dismissed_at    timestamptz not null default now(),
  primary key (notification_id, user_id)
);
alter table public.notification_dismissals enable row level security;
revoke all on public.notification_dismissals from anon, authenticated;
grant all on public.notification_dismissals to service_role;

create or replace function public.my_notifications(p_limit int default 50) returns setof public.notifications
language sql stable security definer set search_path = public as $$
  select n.* from notifications n
  where app.notification_for(n, auth.uid())
    and not exists (select 1 from notification_dismissals d where d.notification_id = n.id and d.user_id = auth.uid())
  order by n.created_at desc
  limit least(greatest(coalesce(p_limit, 50), 1), 200)
$$;

/** Delete notifications from your inbox. */
create function public.dismiss_notifications(p_ids uuid[]) returns void
language sql security definer set search_path = public as $$
  insert into notification_dismissals (notification_id, user_id)
    select n.id, auth.uid() from notifications n
    where n.id = any (p_ids[1:500]) and auth.uid() is not null and app.notification_for(n, auth.uid())
  on conflict do nothing
$$;

/** Clear all: every notification currently in your inbox. */
create function public.clear_my_notifications() returns int
language plpgsql security definer set search_path = public as $$
declare n int;
begin
  if auth.uid() is null then raise exception 'Sign in first.' using errcode = '42501'; end if;
  insert into notification_dismissals (notification_id, user_id)
    select x.id, auth.uid() from notifications x where app.notification_for(x, auth.uid())
  on conflict do nothing;
  get diagnostics n = row_count;
  return n;
end $$;

/** Sellers delete their post at any stage; admins remove posts that don't belong. */
create or replace function public.market_remove(p_listing uuid, p_reason text default null) returns void
language plpgsql security definer set search_path = public as $$
declare r market_listings%rowtype; why text := coalesce(nullif(trim(p_reason), ''), 'it isn''t a uniform or school-related item');
        b uuid;
begin
  select * into r from market_listings where id = p_listing for update;
  if not found or r.status = 'removed' then raise exception 'No such post.'; end if;
  if app.has_permission('groups.manage') and r.seller_id <> auth.uid() then
    update market_listings set status = 'removed', updated_at = now() where id = p_listing;
    perform app.audit(null, 'market.removed', r.seller_id::text, jsonb_build_object('listing', r.id, 'title', r.title, 'reason', why));
    perform app.notify_user(r.seller_id, '🚫 Post removed: ' || r.title,
      'Kingdom Heights removed your Marketplace post because ' || why || '.', jsonb_build_object('listingId', r.id));
  elsif r.seller_id <> auth.uid() then
    raise exception 'Only the seller can delete this post.' using errcode = '42501';
  else
    update market_listings set status = 'removed', updated_at = now() where id = p_listing;
  end if;
  -- Tell everyone still in line (and a pending buyer) that it's gone.
  if r.status in ('open', 'pending') then
    for b in select distinct buyer_id from market_responses
             where listing_id = p_listing and status in ('agreed', 'offered', 'countered', 'selected') loop
      perform app.notify_user(b, 'No longer available: ' || r.title,
        case when r.status = 'pending' and b = r.buyer_id then 'The seller deleted the post, so the sale is off.'
             else 'The seller took this post down.' end,
        jsonb_build_object('listingId', r.id));
    end loop;
    update market_responses set status = 'withdrawn', updated_at = now()
    where listing_id = p_listing and status in ('agreed', 'offered', 'countered', 'selected');
  end if;
end $$;

revoke all on function public.dismiss_notifications(uuid[]), public.clear_my_notifications() from public, anon;
grant execute on function public.dismiss_notifications(uuid[]), public.clear_my_notifications() to authenticated, service_role;
