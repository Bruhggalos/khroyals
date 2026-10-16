-- Marketplace: parents and staff sell uniforms, books, gear and the like.
--
-- A seller posts an item with an optional photo, a price, a quantity and its
-- condition. One sale per post: the quantity describes the bundle, and one buyer
-- gets it. Buyers get in line two ways:
--   Dibs  - take it as posted (price agreed right away)
--   Offer - name a price; the seller accepts or counters once, and the buyer
--           accepts or declines the counter
-- The seller sees everyone in line in the order they responded, picks a line
-- whose price is agreed, and confirms. Then it's a pending sale: the two arrange
-- the handoff at school, and the seller marks it sold (or either side cancels,
-- which reopens the post). No contact details are shared.
--
-- Buyers and sellers are notified of each step through the notifications inbox
-- (a new 'user' audience). Students can't trade, and parents and staff must
-- accept the Marketplace terms (uniforms and school-related items only;
-- Kingdom Heights may remove any post) before they can see or use it. Admins
-- with groups.manage remove posts that don't belong, and the seller is told why.

-- The terms live here so the office can change them; bump the version to ask
-- everyone to accept again.
insert into app.settings values
  ('market_terms_version', '1'),
  ('market_terms', $terms$The Kingdom Heights Marketplace is for Kingdom Heights families and staff to buy, sell and trade uniforms and other school-related items, like books, supplies, and sports and spirit gear.

1. Only post uniforms and school-related items. Anything else will be removed.
2. Kingdom Heights may remove any post at any time, for any reason.
3. Kingdom Heights isn't part of any sale: it doesn't handle payments, guarantee items or settle disputes. Buyers and sellers deal with each other and hand items off at school.
4. Describe items honestly, keep posts and offers respectful, and follow the Student/Parent Handbook.
5. Kingdom Heights may turn off Marketplace access for anyone who doesn't follow these terms.$terms$)
on conflict (key) do nothing;

create table public.market_terms_acceptances (
  user_id     uuid not null references public.profiles (id) on delete cascade,
  version     int not null,
  accepted_at timestamptz not null default now(),
  primary key (user_id, version)
);
alter table public.market_terms_acceptances enable row level security;
create policy "own acceptances" on public.market_terms_acceptances for select to authenticated using (user_id = auth.uid());

create function app.trader_role(u uuid default auth.uid()) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(app.school_role(u) in ('parent', 'teacher', 'staff', 'admin'), false)
$$;

/** Parents and staff who have accepted the current Marketplace terms. */
create function app.can_trade(u uuid default auth.uid()) returns boolean
language sql stable security definer set search_path = public as $$
  select app.trader_role(u) and exists (
    select 1 from market_terms_acceptances
    where user_id = u and version = coalesce(app.setting('market_terms_version'), '1')::int)
$$;

/** The current terms, and whether the signed-in person has accepted them. */
create function public.market_terms() returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'version', coalesce(app.setting('market_terms_version'), '1')::int,
    'text', app.setting('market_terms'),
    'accepted', app.can_trade(),
    'eligible', app.trader_role())
$$;

create function public.market_accept_terms(p_version int) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not app.trader_role() then raise exception 'The Marketplace is for parents and staff.' using errcode = '42501'; end if;
  if p_version is distinct from coalesce(app.setting('market_terms_version'), '1')::int then
    raise exception 'The Marketplace terms have changed. Please read them again.';
  end if;
  insert into market_terms_acceptances (user_id, version) values (auth.uid(), p_version) on conflict do nothing;
end $$;

/** "Rosa R." for notifications. */
create function app.short_name(u uuid) returns text
language sql stable security definer set search_path = public as $$
  select coalesce(nullif(trim(first_name || ' ' || left(last_name, 1) || case when last_name <> '' then '.' else '' end), ''), 'Someone')
  from profiles where id = u
$$;

create function app.money(cents int) returns text
language sql immutable as $$ select '$' || to_char(cents / 100.0, 'FM999,990.00') $$;

-- ======================================================================
-- Tables
-- ======================================================================

create table public.market_listings (
  id          uuid primary key default gen_random_uuid(),
  seller_id   uuid not null references public.profiles (id) on delete cascade,
  title       text not null check (char_length(trim(title)) between 1 and 80),
  description text not null default '' check (char_length(description) <= 1000),
  price_cents int not null check (price_cents between 0 and 1000000),
  quantity    int not null default 1 check (quantity between 1 and 999),
  condition   text not null check (condition in ('new', 'like_new', 'good', 'fair')),
  photo_path  text,                    -- marketplace bucket: "<seller id>/<file>"
  status      text not null default 'open' check (status in ('open', 'pending', 'sold', 'removed')),
  buyer_id    uuid references public.profiles (id) on delete set null,  -- once the seller confirms
  sale_cents  int,                                                       -- the agreed price
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index on public.market_listings (status, created_at desc);

/** One line per interested buyer: a Dibs, or an Offer and its counter. */
create table public.market_responses (
  id            uuid primary key default gen_random_uuid(),
  listing_id    uuid not null references public.market_listings (id) on delete cascade,
  buyer_id      uuid not null references public.profiles (id) on delete cascade,
  kind          text not null check (kind in ('dibs', 'offer')),
  offer_cents   int check (offer_cents between 0 and 1000000),
  counter_cents int check (counter_cents between 0 and 1000000),
  message       text check (char_length(message) <= 300),
  -- agreed: price settled (dibs, accepted offer or accepted counter); offered: waiting
  -- for the seller; countered: waiting for the buyer; selected: the confirmed buyer.
  status        text not null check (status in ('agreed', 'offered', 'countered', 'declined', 'withdrawn', 'selected')),
  agreed_cents  int,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  check (kind = 'dibs' or offer_cents is not null)
);
create index on public.market_responses (listing_id, created_at);
-- One live line per buyer per post.
create unique index market_one_live_line on public.market_responses (listing_id, buyer_id)
  where status in ('agreed', 'offered', 'countered', 'selected');

alter table public.market_listings enable row level security;
alter table public.market_responses enable row level security;

create function app.is_seller(l uuid, u uuid default auth.uid()) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from market_listings where id = l and seller_id = u)
$$;

create policy "marketplace: open posts, or your own" on public.market_listings for select to authenticated
  using (app.has_permission('groups.manage')
         or (app.can_trade() and (status in ('open', 'pending') or seller_id = auth.uid() or buyer_id = auth.uid())));
create policy "marketplace lines: your own, or on your post" on public.market_responses for select to authenticated
  using (buyer_id = auth.uid() or app.is_seller(listing_id) or app.has_permission('groups.manage'));

-- ======================================================================
-- Notifications to one person
-- ======================================================================

alter table public.notifications add column user_id uuid references public.profiles (id) on delete cascade;
do $$
declare c text;
begin
  select conname into c from pg_constraint
  where conrelid = 'public.notifications'::regclass and contype = 'c' and pg_get_constraintdef(oid) like '%everyone%';
  execute format('alter table public.notifications drop constraint %I', c);
end $$;
alter table public.notifications
  add constraint notifications_audience_check check (audience in ('group', 'everyone', 'roles', 'user')),
  add constraint notifications_user_check check (audience <> 'user' or user_id is not null);

create or replace function app.notification_for(n public.notifications, u uuid) returns boolean
language plpgsql stable security definer set search_path = public as $$
declare pref text; sr text;
begin
  sr := app.school_role(u);
  if sr is null or u = n.created_by then return false; end if;
  if n.audience = 'user' then return u = n.user_id; end if;
  if n.audience = 'everyone' then return true; end if;
  if n.audience = 'roles' then return sr = any (n.roles); end if;
  if not app.can_view_content(n.group_id, u) then return false; end if;
  select notification into pref from memberships where group_id = n.group_id and user_id = u;
  if not found then return false; end if;  -- only members get group pushes
  pref := coalesce(pref, (select settings->>'notificationDefault' from groups where id = n.group_id), 'all');
  return pref = 'all' or (n.urgent and pref <> 'none');
end $$;

create function app.notify_user(u uuid, title text, body text, data jsonb) returns void
language sql security definer set search_path = public as $$
  insert into notifications (audience, user_id, title, body, data, urgent, created_by)
  values ('user', u, title, body, data, true, auth.uid())
$$;

-- ======================================================================
-- API
-- ======================================================================

create function app.require_trader() returns void
language plpgsql stable as $$
begin
  if not app.trader_role() then
    raise exception 'The Marketplace is for parents and staff.' using errcode = '42501';
  end if;
  if not app.can_trade() then
    raise exception 'Accept the Marketplace terms first.' using errcode = '42501';
  end if;
end $$;

/** Lock and return a post that's still open, or explain why it isn't. */
create function app.open_listing(l uuid) returns public.market_listings
language plpgsql security definer set search_path = public as $$
declare r market_listings%rowtype;
begin
  select * into r from market_listings where id = l for update;
  if not found or r.status <> 'open' then raise exception 'This item isn''t available anymore.'; end if;
  return r;
end $$;

create function public.market_post(
  p_title text, p_description text, p_price_cents int, p_quantity int, p_condition text, p_photo_path text default null
) returns public.market_listings
language plpgsql security definer set search_path = public as $$
declare r market_listings%rowtype;
begin
  perform app.require_trader();
  if p_photo_path is not null and (storage.foldername(p_photo_path))[1] is distinct from auth.uid()::text then
    raise exception 'That photo isn''t yours.' using errcode = '42501';
  end if;
  insert into market_listings (seller_id, title, description, price_cents, quantity, condition, photo_path)
  values (auth.uid(), trim(p_title), coalesce(trim(p_description), ''), p_price_cents, coalesce(p_quantity, 1), p_condition, p_photo_path)
  returning * into r;
  return r;
end $$;

/**
 * The seller takes a post down while it's open. Admins (groups.manage) can
 * remove any post; the seller is told why and the removal is in the activity log.
 */
create function public.market_remove(p_listing uuid, p_reason text default null) returns void
language plpgsql security definer set search_path = public as $$
declare r market_listings%rowtype; why text := coalesce(nullif(trim(p_reason), ''), 'it isn''t a uniform or school-related item');
begin
  select * into r from market_listings where id = p_listing for update;
  if not found then raise exception 'No such post.'; end if;
  if app.has_permission('groups.manage') and r.seller_id <> auth.uid() then
    update market_listings set status = 'removed', updated_at = now() where id = p_listing;
    perform app.audit(null, 'market.removed', r.seller_id::text, jsonb_build_object('listing', r.id, 'title', r.title, 'reason', why));
    perform app.notify_user(r.seller_id, '🚫 Post removed: ' || r.title,
      'Kingdom Heights removed your Marketplace post because ' || why || '.', jsonb_build_object('listingId', r.id));
    return;
  end if;
  if r.seller_id <> auth.uid() then raise exception 'Only the seller can take this post down.' using errcode = '42501'; end if;
  if r.status <> 'open' then raise exception 'Cancel the sale before taking the post down.'; end if;
  update market_listings set status = 'removed', updated_at = now() where id = p_listing;
end $$;

/** Dibs: take it as posted. */
create function public.market_dibs(p_listing uuid) returns public.market_responses
language plpgsql security definer set search_path = public as $$
declare l market_listings%rowtype; r market_responses%rowtype;
begin
  perform app.require_trader();
  l := app.open_listing(p_listing);
  if l.seller_id = auth.uid() then raise exception 'That''s your own post.'; end if;
  insert into market_responses (listing_id, buyer_id, kind, status, agreed_cents)
  values (p_listing, auth.uid(), 'dibs', 'agreed', l.price_cents) returning * into r;
  perform app.notify_user(l.seller_id, '🛍️ Dibs on ' || l.title,
    app.short_name(auth.uid()) || ' called dibs at ' || app.money(l.price_cents) || '.', jsonb_build_object('listingId', l.id));
  return r;
exception when unique_violation then
  raise exception 'You''re already in line for this item.';
end $$;

/** Offer: name a price (and an optional note). */
create function public.market_offer(p_listing uuid, p_cents int, p_message text default null) returns public.market_responses
language plpgsql security definer set search_path = public as $$
declare l market_listings%rowtype; r market_responses%rowtype;
begin
  perform app.require_trader();
  l := app.open_listing(p_listing);
  if l.seller_id = auth.uid() then raise exception 'That''s your own post.'; end if;
  insert into market_responses (listing_id, buyer_id, kind, offer_cents, message, status)
  values (p_listing, auth.uid(), 'offer', p_cents, nullif(trim(p_message), ''), 'offered') returning * into r;
  perform app.notify_user(l.seller_id, '💬 Offer on ' || l.title,
    app.short_name(auth.uid()) || ' offered ' || app.money(p_cents) || '.', jsonb_build_object('listingId', l.id));
  return r;
exception when unique_violation then
  raise exception 'You''re already in line for this item.';
end $$;

/** The seller accepts an offer, or counters it once. */
create function public.market_answer_offer(p_response uuid, p_accept boolean, p_counter_cents int default null)
returns public.market_responses
language plpgsql security definer set search_path = public as $$
declare r market_responses%rowtype; l market_listings%rowtype;
begin
  select * into r from market_responses where id = p_response for update;
  if not found or not app.is_seller(r.listing_id) then raise exception 'Only the seller can answer this offer.' using errcode = '42501'; end if;
  if r.status <> 'offered' then raise exception 'This offer has already been answered.'; end if;
  l := app.open_listing(r.listing_id);
  if p_accept then
    update market_responses set status = 'agreed', agreed_cents = offer_cents, updated_at = now() where id = p_response returning * into r;
    perform app.notify_user(r.buyer_id, '✅ Offer accepted',
      app.short_name(auth.uid()) || ' accepted your ' || app.money(r.agreed_cents) || ' offer for ' || l.title || '.',
      jsonb_build_object('listingId', l.id));
  else
    if p_counter_cents is null then raise exception 'Enter a counteroffer.'; end if;
    update market_responses set status = 'countered', counter_cents = p_counter_cents, updated_at = now() where id = p_response returning * into r;
    perform app.notify_user(r.buyer_id, '↩️ Counteroffer on ' || l.title,
      app.short_name(auth.uid()) || ' countered at ' || app.money(p_counter_cents) || '.', jsonb_build_object('listingId', l.id));
  end if;
  return r;
end $$;

/** The buyer accepts or declines the seller's counter. */
create function public.market_answer_counter(p_response uuid, p_accept boolean) returns public.market_responses
language plpgsql security definer set search_path = public as $$
declare r market_responses%rowtype; l market_listings%rowtype;
begin
  select * into r from market_responses where id = p_response for update;
  if not found or r.buyer_id <> auth.uid() then raise exception 'Only the buyer can answer this counteroffer.' using errcode = '42501'; end if;
  if r.status <> 'countered' then raise exception 'There''s no counteroffer to answer.'; end if;
  l := app.open_listing(r.listing_id);
  update market_responses
  set status = case when p_accept then 'agreed' else 'declined' end,
      agreed_cents = case when p_accept then counter_cents end, updated_at = now()
  where id = p_response returning * into r;
  perform app.notify_user(l.seller_id,
    case when p_accept then '✅ Counteroffer accepted' else 'Counteroffer declined' end,
    app.short_name(auth.uid()) || case when p_accept then ' accepted ' || app.money(r.agreed_cents) || ' for ' else ' declined your counter for ' end
      || l.title || '.',
    jsonb_build_object('listingId', l.id));
  return r;
end $$;

/** A buyer leaves the line. */
create function public.market_withdraw(p_response uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  update market_responses set status = 'withdrawn', updated_at = now()
  where id = p_response and buyer_id = auth.uid() and status in ('agreed', 'offered', 'countered');
  if not found then raise exception 'Nothing to withdraw.'; end if;
end $$;

/** The seller confirms a buyer whose price is agreed: the sale is pending until the handoff. */
create function public.market_select(p_response uuid) returns public.market_listings
language plpgsql security definer set search_path = public as $$
declare r market_responses%rowtype; l market_listings%rowtype;
begin
  select * into r from market_responses where id = p_response for update;
  if not found or not app.is_seller(r.listing_id) then raise exception 'Only the seller can choose a buyer.' using errcode = '42501'; end if;
  if r.status <> 'agreed' then raise exception 'Agree on a price with this buyer first.'; end if;
  l := app.open_listing(r.listing_id);
  update market_responses set status = 'selected', updated_at = now() where id = p_response;
  update market_listings set status = 'pending', buyer_id = r.buyer_id, sale_cents = r.agreed_cents, updated_at = now()
  where id = l.id returning * into l;
  perform app.notify_user(r.buyer_id, '🎉 It''s yours: ' || l.title,
    app.short_name(auth.uid()) || ' chose you at ' || app.money(l.sale_cents) || '. Arrange the handoff at school.',
    jsonb_build_object('listingId', l.id));
  return l;
end $$;

/** The seller marks a pending sale as done. */
create function public.market_complete(p_listing uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  update market_listings set status = 'sold', updated_at = now()
  where id = p_listing and seller_id = auth.uid() and status = 'pending';
  if not found then raise exception 'There''s no pending sale to complete.'; end if;
end $$;

/** Either side calls off a pending sale; the post opens again. */
create function public.market_cancel_sale(p_listing uuid) returns void
language plpgsql security definer set search_path = public as $$
declare l market_listings%rowtype; seller boolean;
begin
  select * into l from market_listings where id = p_listing for update;
  if not found or l.status <> 'pending'
     or (auth.uid() is distinct from l.seller_id and auth.uid() is distinct from l.buyer_id) then
    raise exception 'There''s no pending sale of yours to cancel.' using errcode = '42501';
  end if;
  seller := l.seller_id = auth.uid();
  update market_responses set status = case when seller then 'declined' else 'withdrawn' end, updated_at = now()
  where listing_id = p_listing and status = 'selected';
  update market_listings set status = 'open', buyer_id = null, sale_cents = null, updated_at = now() where id = p_listing;
  perform app.notify_user(case when seller then l.buyer_id else l.seller_id end, 'Sale cancelled: ' || l.title,
    app.short_name(auth.uid()) || ' called off the sale.', jsonb_build_object('listingId', l.id));
end $$;

-- ======================================================================
-- Photos: private bucket, one folder per seller
-- ======================================================================

insert into storage.buckets (id, name, public) values ('marketplace', 'marketplace', false)
on conflict (id) do nothing;
create policy "marketplace photos: parents and staff read" on storage.objects for select to authenticated
  using (bucket_id = 'marketplace' and app.can_trade());
create policy "marketplace photos: upload to your own folder" on storage.objects for insert to authenticated
  with check (bucket_id = 'marketplace' and app.can_trade() and (storage.foldername(name))[1] = auth.uid()::text);
create policy "marketplace photos: delete your own" on storage.objects for delete to authenticated
  using (bucket_id = 'marketplace' and (storage.foldername(name))[1] = auth.uid()::text);

-- ======================================================================
-- Privileges
-- ======================================================================

revoke all on function app.trader_role(uuid), app.can_trade(uuid), app.short_name(uuid), app.money(int),
  app.is_seller(uuid, uuid), app.notify_user(uuid, text, text, jsonb), app.require_trader(), app.open_listing(uuid)
  from public, anon;
grant execute on function app.trader_role(uuid), app.can_trade(uuid), app.is_seller(uuid, uuid) to authenticated, service_role;
revoke all on function public.market_terms(), public.market_accept_terms(int),
  public.market_post(text, text, int, int, text, text), public.market_remove(uuid, text),
  public.market_dibs(uuid), public.market_offer(uuid, int, text), public.market_answer_offer(uuid, boolean, int),
  public.market_answer_counter(uuid, boolean), public.market_withdraw(uuid), public.market_select(uuid),
  public.market_complete(uuid), public.market_cancel_sale(uuid) from public, anon;
grant execute on function public.market_terms(), public.market_accept_terms(int),
  public.market_post(text, text, int, int, text, text), public.market_remove(uuid, text),
  public.market_dibs(uuid), public.market_offer(uuid, int, text), public.market_answer_offer(uuid, boolean, int),
  public.market_answer_counter(uuid, boolean), public.market_withdraw(uuid), public.market_select(uuid),
  public.market_complete(uuid), public.market_cancel_sale(uuid) to authenticated, service_role;

-- Reads go through RLS; writes only through the functions above.
revoke all on public.market_listings, public.market_responses, public.market_terms_acceptances from anon;
revoke insert, update, delete on public.market_listings, public.market_responses, public.market_terms_acceptances from authenticated;
grant select on public.market_listings, public.market_responses, public.market_terms_acceptances to authenticated;
grant all on public.market_listings, public.market_responses, public.market_terms_acceptances to service_role;

alter publication supabase_realtime add table public.market_listings, public.market_responses;
