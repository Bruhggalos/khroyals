-- Ticketed events: an Activities event (a play, a game, a concert) can sell tickets.
--
-- The activity's coaches and directors, and sports.manage holders (app.runs_tickets), set it up: kinds of
-- ticket with a price and an optional limit (Adult $10, Student $5), whether it's on sale, when sales close
-- and how many one order may hold (ticket_event_save). Parents, staff and Family accounts buy
-- (app.can_buy_tickets): the tickets Edge Function holds them as the buyer (ticket_order_start; a hold lasts
-- 30 minutes) and sends them to Stripe Checkout, and Stripe's webhook (the same function) marks the order
-- paid (ticket_order_paid, service role only); the buyer is told. Free tickets are issued straight away.
-- Paid tickets show in My Tickets with a QR code (my_tickets) and can be added to Apple or Google Wallet
-- (ticket_for_wallet as the buyer, ticket_pass for the pass download link). At the door the same leaders scan
-- them (ticket_admit): each admits once. An order keeps the event's title and time, so deleting an event
-- never loses a payment record. Refunds are made in Stripe's dashboard for now.

create table public.ticketed_events (
  event_id      uuid primary key references public.sport_events (id) on delete cascade,
  on_sale       boolean not null default false,
  closes_at     timestamptz,                 -- null: sales close when the event starts
  max_per_order int not null default 10 check (max_per_order between 1 and 50),
  updated_by    uuid references public.profiles (id) on delete set null,
  updated_at    timestamptz not null default now()
);

create table public.ticket_types (
  id          uuid primary key default gen_random_uuid(),
  event_id    uuid not null references public.sport_events (id) on delete cascade,
  name        text not null check (char_length(trim(name)) between 1 and 60),
  price_cents int not null check (price_cents between 0 and 100000),
  capacity    int check (capacity is null or capacity between 1 and 10000),   -- null: no limit
  position    int not null default 0
);
create index on public.ticket_types (event_id, position);

create table public.ticket_orders (
  id              uuid primary key default gen_random_uuid(),
  event_id        uuid references public.sport_events (id) on delete set null,
  event_title     text not null,
  event_starts_at timestamptz not null,
  buyer_id        uuid references public.profiles (id) on delete set null,
  status          text not null default 'pending' check (status in ('pending', 'paid', 'cancelled')),
  total_cents     int not null default 0 check (total_cents >= 0),
  stripe_session  text unique,
  stripe_payment  text,
  expires_at      timestamptz not null default now() + interval '30 minutes',
  paid_at         timestamptz,
  created_at      timestamptz not null default now()
);
create index on public.ticket_orders (event_id, status);
create index on public.ticket_orders (buyer_id, created_at desc);

create table public.tickets (
  id          uuid primary key default gen_random_uuid(),
  order_id    uuid not null references public.ticket_orders (id) on delete cascade,
  type_id     uuid references public.ticket_types (id) on delete set null,
  type_name   text not null,
  price_cents int not null,
  code        text not null unique default replace(gen_random_uuid()::text, '-', ''),   -- the QR code: 122 random bits
  admitted_at timestamptz,
  admitted_by uuid references public.profiles (id) on delete set null
);
create index on public.tickets (order_id);
create index on public.tickets (type_id);

-- ----------------------------------------------------------------------
-- Helpers
-- ----------------------------------------------------------------------

/** Runs an event's tickets: the activity's coaches and directors, and sports.manage holders. */
create function app.runs_tickets(e uuid, u uuid default auth.uid()) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(app.can_manage_sport(app.event_sport(e), u), false)
$$;

/** Who buys tickets: approved parents, teachers, staff and Family accounts (not students or substitutes). */
create function app.can_buy_tickets(u uuid default auth.uid()) returns boolean
language sql stable as $$ select coalesce(app.school_role(u) in ('parent', 'teacher', 'staff', 'admin', 'family'), false) $$;

/** Tickets of a kind that are sold, or held by someone checking out right now. */
create function app.tickets_taken(t uuid) returns int
language sql stable security definer set search_path = public as $$
  select count(*)::int from tickets k join ticket_orders o on o.id = k.order_id
  where k.type_id = t and (o.status = 'paid' or (o.status = 'pending' and o.expires_at > now()))
$$;

/** On sale, not cancelled, and before sales close (when the event starts, unless the leaders set a time). */
create function app.ticket_sales_open(e uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select t.on_sale and not ev.cancelled and now() < coalesce(t.closes_at, ev.starts_at)
                   from ticketed_events t join sport_events ev on ev.id = t.event_id where t.event_id = e), false)
$$;

/** "Fall Play: Opening night". */
create function app.ticket_event_title(e uuid) returns text
language sql stable security definer set search_path = public as $$
  select coalesce(sp.name || ': ', '') || ev.title
  from sport_events ev left join sport_seasons ss on ss.id = ev.season_id left join sports sp on sp.id = ss.sport_id where ev.id = e
$$;

/** An order is paid (or free): its tickets count, and the buyer is told. A payment always wins, even for an order that had expired. Safe to call twice. */
create function app.ticket_order_complete(o uuid, p_session text, p_payment text) returns void
language plpgsql security definer set search_path = public as $$
declare r ticket_orders; n int;
begin
  update ticket_orders set status = 'paid', paid_at = now(),
    stripe_session = coalesce(p_session, stripe_session), stripe_payment = coalesce(p_payment, stripe_payment)
  where id = o and status <> 'paid' returning * into r;
  if not found then return; end if;
  select count(*) into n from tickets where order_id = o;
  if r.buyer_id is not null then
    perform app.notify_user(r.buyer_id, '🎟️ Your tickets: ' || r.event_title,
      n || case when n = 1 then ' ticket' else ' tickets' end || ' · ' || app.sport_when(r.event_starts_at) || '. They''re in My Tickets.',
      jsonb_build_object('ticketOrderId', o));
  end if;
  perform app.audit(null, 'tickets.paid', o::text, jsonb_build_object('event', r.event_id, 'tickets', n, 'total', r.total_cents));
end $$;

-- ----------------------------------------------------------------------
-- Read policies (writes go through the functions below)
-- ----------------------------------------------------------------------

alter table public.ticketed_events enable row level security;
alter table public.ticket_types enable row level security;
alter table public.ticket_orders enable row level security;
alter table public.tickets enable row level security;
create policy "approved accounts" on public.ticketed_events for select to authenticated using (app.school_role() is not null);
create policy "approved accounts" on public.ticket_types for select to authenticated using (app.school_role() is not null);
create policy "the buyer, and the event's leaders" on public.ticket_orders for select to authenticated
  using (buyer_id = auth.uid() or (event_id is not null and app.runs_tickets(event_id)));
create policy "the buyer, and the event's leaders" on public.tickets for select to authenticated
  using (exists (select 1 from ticket_orders o where o.id = order_id
                 and (o.buyer_id = auth.uid() or (o.event_id is not null and app.runs_tickets(o.event_id)))));

-- ----------------------------------------------------------------------
-- Leaders: set up an event's tickets, see the sales, check tickets at the door
-- ----------------------------------------------------------------------

/**
 * The event's leaders: sell tickets for it (or stop). p_types is the whole list, in order:
 * [{ id?, name, priceCents, capacity? }]; kinds left out are removed, unless they have tickets sold.
 */
create function public.ticket_event_save(p_event uuid, p_on_sale boolean, p_closes_at timestamptz, p_types jsonb, p_max_per_order int default 10)
returns void
language plpgsql security definer set search_path = public as $$
declare e sport_events; t jsonb; keep uuid[] := '{}'; tid uuid; n int := 0; price int; cap int; gone text;
begin
  select * into e from sport_events where id = p_event;
  if not found then raise exception 'That event is gone.'; end if;
  if not app.runs_tickets(p_event) then
    raise exception 'Only the activity''s coaches and directors can sell tickets for it.' using errcode = '42501';
  end if;
  if jsonb_typeof(coalesce(p_types, '[]'::jsonb)) <> 'array' then raise exception 'List the kinds of ticket.'; end if;
  if coalesce(p_on_sale, false) and jsonb_array_length(coalesce(p_types, '[]'::jsonb)) = 0 then
    raise exception 'Add at least one kind of ticket, like Adult or Student.';
  end if;
  if coalesce(p_max_per_order, 10) not between 1 and 50 then raise exception 'One order can hold 1 to 50 tickets.'; end if;
  if p_closes_at is not null and p_closes_at > coalesce(e.ends_at, e.starts_at + interval '6 hours') then
    raise exception 'Sales have to close by the time the event ends.';
  end if;

  insert into ticketed_events (event_id, on_sale, closes_at, max_per_order, updated_by)
  values (p_event, coalesce(p_on_sale, false), p_closes_at, coalesce(p_max_per_order, 10), auth.uid())
  on conflict (event_id) do update set on_sale = excluded.on_sale, closes_at = excluded.closes_at,
    max_per_order = excluded.max_per_order, updated_by = excluded.updated_by, updated_at = now();

  for t in select * from jsonb_array_elements(coalesce(p_types, '[]'::jsonb)) loop
    n := n + 1;
    if coalesce(trim(t->>'name'), '') = '' then raise exception 'Give each kind of ticket a name, like Adult or Student.'; end if;
    price := (t->>'priceCents')::int;
    if price is null or price not between 0 and 100000 then raise exception 'Ticket prices go from free to $1,000.'; end if;
    cap := nullif(t->>'capacity', '')::int;
    if cap is not null and cap not between 1 and 10000 then raise exception 'A limit goes from 1 to 10,000 tickets.'; end if;
    tid := nullif(t->>'id', '')::uuid;
    if tid is not null and exists (select 1 from ticket_types where id = tid and event_id = p_event) then
      if cap is not null and cap < app.tickets_taken(tid) then
        raise exception '% has % sold already; the limit can''t go below that.', trim(t->>'name'), app.tickets_taken(tid);
      end if;
      update ticket_types set name = trim(t->>'name'), price_cents = price, capacity = cap, position = n where id = tid;
    else
      insert into ticket_types (event_id, name, price_cents, capacity, position) values (p_event, trim(t->>'name'), price, cap, n)
      returning id into tid;
    end if;
    keep := keep || tid;
  end loop;
  select x.name into gone from ticket_types x where x.event_id = p_event and not (x.id = any (keep))
    and exists (select 1 from tickets k join ticket_orders o on o.id = k.order_id where k.type_id = x.id and o.status = 'paid') limit 1;
  if gone is not null then
    raise exception '% has tickets sold, so it can''t be removed. Set its limit to what''s sold to stop selling it.', gone;
  end if;
  delete from ticket_types where event_id = p_event and not (id = any (keep));
  perform app.audit(null, 'tickets.setup', p_event::text, jsonb_build_object('onSale', p_on_sale, 'types', jsonb_array_length(coalesce(p_types, '[]'::jsonb))));
end $$;

/** An event's tickets: the kinds for sale with what's left, whether they're on sale, and how many the caller holds; its leaders also get sold, admitted and the takings. */
create function public.ticket_event(p_event uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare e sport_events; te ticketed_events; leader boolean := app.runs_tickets(p_event);
begin
  select * into e from sport_events where id = p_event;
  if not found then raise exception 'That event is gone.'; end if;
  if not (leader or app.can_buy_tickets()) then raise exception 'Tickets are for parents, staff and family.' using errcode = '42501'; end if;
  select * into te from ticketed_events where event_id = p_event;
  return jsonb_build_object(
    'eventId', e.id, 'title', app.ticket_event_title(e.id), 'startsAt', e.starts_at, 'endsAt', e.ends_at,
    'location', e.location, 'address', e.address, 'cancelled', e.cancelled,
    'onSale', coalesce(te.on_sale, false), 'closesAt', te.closes_at, 'maxPerOrder', coalesce(te.max_per_order, 10),
    'open', app.ticket_sales_open(e.id), 'canBuy', app.can_buy_tickets(), 'leader', leader,
    'types', coalesce((select jsonb_agg(jsonb_build_object('id', t.id, 'name', t.name, 'priceCents', t.price_cents, 'capacity', t.capacity,
        'left', case when t.capacity is null then null else greatest(t.capacity - app.tickets_taken(t.id), 0) end,
        'sold', case when leader then (select count(*) from tickets k join ticket_orders o on o.id = k.order_id where k.type_id = t.id and o.status = 'paid') end,
        'admitted', case when leader then (select count(*) from tickets k where k.type_id = t.id and k.admitted_at is not null) end)
        order by t.position) from ticket_types t where t.event_id = e.id), '[]'::jsonb),
    'mine', (select count(*) from tickets k join ticket_orders o on o.id = k.order_id
             where o.event_id = e.id and o.buyer_id = auth.uid() and o.status = 'paid'),
    'takingsCents', case when leader then (select coalesce(sum(total_cents), 0) from ticket_orders where event_id = e.id and status = 'paid') end);
end $$;

/** The event's leaders: who bought tickets (paid orders, newest first). */
create function public.ticket_sales(p_event uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  if not app.runs_tickets(p_event) then
    raise exception 'Only the activity''s coaches and directors can see its ticket sales.' using errcode = '42501';
  end if;
  return coalesce((select jsonb_agg(jsonb_build_object('id', o.id, 'buyer', app.checkin_name(o.buyer_id), 'totalCents', o.total_cents,
      'paidAt', o.paid_at, 'tickets', (select string_agg(x.n || ' ' || x.type_name, ', ' order by x.type_name)
        from (select type_name, count(*) as n from tickets where order_id = o.id group by type_name) x),
      'admitted', (select count(*) from tickets where order_id = o.id and admitted_at is not null),
      'count', (select count(*) from tickets where order_id = o.id)) order by o.paid_at desc)
    from ticket_orders o where o.event_id = p_event and o.status = 'paid'), '[]'::jsonb);
end $$;

/** The event's leaders at the door: admit a ticket by its scanned code (or the short code typed). Each ticket admits once. */
create function public.ticket_admit(p_event uuid, p_code text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare c text := lower(regexp_replace(coalesce(p_code, ''), '[^0-9a-fA-F]', '', 'g')); k tickets; o ticket_orders; counts jsonb;
begin
  if not app.runs_tickets(p_event) then
    raise exception 'Only the activity''s coaches and directors can check its tickets.' using errcode = '42501';
  end if;
  if char_length(c) = 32 then
    select * into k from tickets where code = c;
  elsif char_length(c) >= 8 then   -- typed: the short code under the QR code, for this event's tickets
    select x.* into k from tickets x join ticket_orders xo on xo.id = x.order_id where xo.event_id = p_event and x.code like c || '%' limit 1;
  end if;
  if k.id is null then return jsonb_build_object('ok', false, 'message', 'Not a KH Royals ticket.'); end if;
  select * into o from ticket_orders where id = k.order_id;
  if o.event_id is distinct from p_event then
    return jsonb_build_object('ok', false, 'message', 'This ticket is for ' || o.event_title || '.', 'holder', app.checkin_name(o.buyer_id), 'type', k.type_name);
  end if;
  if o.status <> 'paid' then return jsonb_build_object('ok', false, 'message', 'This ticket wasn''t paid for.'); end if;
  if k.admitted_at is not null then
    return jsonb_build_object('ok', false, 'message', 'Already used at ' || app.checkin_time(k.admitted_at) || '.',
      'holder', app.checkin_name(o.buyer_id), 'type', k.type_name);
  end if;
  update tickets set admitted_at = now(), admitted_by = auth.uid() where id = k.id;
  select jsonb_build_object('admitted', count(*) filter (where t.admitted_at is not null), 'sold', count(*)) into counts
  from tickets t join ticket_orders x on x.id = t.order_id where x.event_id = p_event and x.status = 'paid';
  return jsonb_build_object('ok', true, 'holder', app.checkin_name(o.buyer_id), 'type', k.type_name) || counts;
end $$;

-- ----------------------------------------------------------------------
-- Buyers
-- ----------------------------------------------------------------------

/** Upcoming events with tickets on sale, with the lowest price (for the Tickets buttons in Activities). */
create function public.tickets_on_sale() returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object('eventId', t.event_id,
      'fromCents', (select min(price_cents) from ticket_types where event_id = t.event_id))), '[]'::jsonb)
  from ticketed_events t where app.school_role() is not null and app.ticket_sales_open(t.event_id)
$$;

/**
 * Hold tickets for the caller (the tickets Edge Function, as the buyer): p_items is
 * [{ typeId, quantity }]. Returns the order for Stripe Checkout; a free order is issued at once.
 * Starting again drops the caller's earlier hold for the event.
 */
create function public.ticket_order_start(p_event uuid, p_items jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare e sport_events; te ticketed_events; it jsonb; ty ticket_types; q int; total int := 0; n int := 0; o uuid; lines jsonb := '[]'::jsonb;
  title text; taken int;
begin
  if not app.can_buy_tickets() then raise exception 'Tickets are for parents, staff and family.' using errcode = '42501'; end if;
  select * into e from sport_events where id = p_event;
  if not found then raise exception 'That event is gone.'; end if;
  if not app.ticket_sales_open(p_event) then raise exception 'Tickets for this event aren''t on sale.'; end if;
  select * into te from ticketed_events where event_id = p_event;
  update ticket_orders set status = 'cancelled' where event_id = p_event and buyer_id = auth.uid() and status = 'pending';
  title := app.ticket_event_title(p_event);
  insert into ticket_orders (event_id, event_title, event_starts_at, buyer_id) values (p_event, title, e.starts_at, auth.uid()) returning id into o;
  for it in select * from jsonb_array_elements(coalesce(p_items, '[]'::jsonb)) loop
    q := coalesce((it->>'quantity')::int, 0);
    if q = 0 then continue; end if;
    if q < 0 then raise exception 'Choose how many tickets.'; end if;
    select * into ty from ticket_types where id = (it->>'typeId')::uuid and event_id = p_event for update;   -- one buyer at a time per kind
    if not found then raise exception 'That kind of ticket isn''t sold anymore.'; end if;
    taken := app.tickets_taken(ty.id);
    if ty.capacity is not null and taken + q > ty.capacity then
      raise exception 'Only % % % left.', greatest(ty.capacity - taken, 0), ty.name, case when ty.capacity - taken = 1 then 'ticket' else 'tickets' end;
    end if;
    insert into tickets (order_id, type_id, type_name, price_cents) select o, ty.id, ty.name, ty.price_cents from generate_series(1, q);
    total := total + q * ty.price_cents;
    n := n + q;
    lines := lines || jsonb_build_object('name', ty.name, 'priceCents', ty.price_cents, 'quantity', q);
  end loop;
  if n = 0 then raise exception 'Choose how many tickets.'; end if;
  if n > coalesce(te.max_per_order, 10) then raise exception 'Up to % tickets at a time.', coalesce(te.max_per_order, 10); end if;
  update ticket_orders set total_cents = total where id = o;
  if total = 0 then perform app.ticket_order_complete(o, null, null); end if;
  return jsonb_build_object('orderId', o, 'title', title, 'startsAt', e.starts_at, 'totalCents', total, 'lines', lines, 'free', total = 0,
    'email', (select email from auth.users where id = auth.uid()));
end $$;

/** The buyer: how a checkout ended (paid, still waiting on Stripe, or cancelled). */
create function public.ticket_order_status(p_order uuid) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object('status', case when o.status = 'pending' and o.expires_at <= now() then 'cancelled' else o.status end,
    'tickets', (select count(*) from tickets where order_id = o.id), 'title', o.event_title)
  from ticket_orders o where o.id = p_order and o.buyer_id = auth.uid()
$$;

/** The buyer leaves checkout without paying: the hold is let go (a payment that still arrives wins). */
create function public.ticket_order_cancel(p_order uuid) returns void
language sql security definer set search_path = public as $$
  update ticket_orders set status = 'cancelled' where id = p_order and buyer_id = auth.uid() and status = 'pending'
$$;

/** The caller's paid tickets for events from yesterday on, soonest first. */
create function public.my_tickets() returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object('id', k.id, 'code', k.code, 'type', k.type_name, 'priceCents', k.price_cents,
      'admittedAt', k.admitted_at, 'orderId', o.id, 'eventId', o.event_id, 'title', o.event_title, 'startsAt', o.event_starts_at,
      'location', ev.location, 'address', ev.address, 'cancelled', coalesce(ev.cancelled, false), 'holder', app.checkin_name(o.buyer_id))
      order by o.event_starts_at, o.id, k.type_name, k.id), '[]'::jsonb)
  from tickets k join ticket_orders o on o.id = k.order_id left join sport_events ev on ev.id = o.event_id
  where o.buyer_id = auth.uid() and o.status = 'paid' and o.event_starts_at > now() - interval '1 day'
$$;

/** What a Wallet pass shows for a paid ticket (null if it isn't paid). */
create function app.ticket_pass_data(p_ticket uuid) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object('id', k.id, 'code', k.code, 'type', k.type_name, 'priceCents', k.price_cents, 'eventId', o.event_id,
      'title', o.event_title, 'startsAt', o.event_starts_at, 'endsAt', ev.ends_at, 'location', ev.location, 'address', ev.address,
      'holder', app.checkin_name(o.buyer_id))
  from tickets k join ticket_orders o on o.id = k.order_id left join sport_events ev on ev.id = o.event_id
  where k.id = p_ticket and o.status = 'paid'
$$;

/** One of the caller's paid tickets, for a Wallet pass (the tickets Edge Function, as the caller). */
create function public.ticket_for_wallet(p_ticket uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  if not exists (select 1 from tickets k join ticket_orders o on o.id = k.order_id where k.id = p_ticket and o.buyer_id = auth.uid() and o.status = 'paid') then
    raise exception 'That ticket isn''t yours.' using errcode = '42501';
  end if;
  return app.ticket_pass_data(p_ticket);
end $$;

/** A paid ticket's Wallet pass details, for the pass download link (the Edge Function checked the link's signature). */
create function public.ticket_pass(p_ticket uuid) returns jsonb
language sql stable security definer set search_path = public as $$ select app.ticket_pass_data(p_ticket) $$;

-- ----------------------------------------------------------------------
-- Stripe (the Edge Functions, with the service role only)
-- ----------------------------------------------------------------------

/** The checkout page was made: remember it, and hold the tickets as long as it lasts. */
create function public.ticket_order_checkout(p_order uuid, p_session text, p_expires_at timestamptz) returns void
language sql security definer set search_path = public as $$
  update ticket_orders set stripe_session = p_session, expires_at = greatest(expires_at, p_expires_at) where id = p_order
$$;

create function public.ticket_order_paid(p_order uuid, p_session text, p_payment text) returns void
language sql security definer set search_path = public as $$ select app.ticket_order_complete(p_order, p_session, p_payment) $$;

/** Stripe let the checkout page expire unpaid. */
create function public.ticket_order_expired(p_order uuid) returns void
language sql security definer set search_path = public as $$
  update ticket_orders set status = 'cancelled' where id = p_order and status = 'pending'
$$;

revoke all on function app.tickets_taken(uuid), app.ticket_sales_open(uuid), app.ticket_event_title(uuid),
  app.ticket_order_complete(uuid, text, text), app.ticket_pass_data(uuid) from public, anon, authenticated;
grant execute on function app.runs_tickets(uuid, uuid), app.can_buy_tickets(uuid) to authenticated, service_role;
revoke all on function public.ticket_event_save(uuid, boolean, timestamptz, jsonb, int), public.ticket_event(uuid), public.ticket_sales(uuid),
  public.ticket_admit(uuid, text), public.tickets_on_sale(), public.ticket_order_start(uuid, jsonb), public.ticket_order_status(uuid),
  public.ticket_order_cancel(uuid), public.my_tickets(), public.ticket_for_wallet(uuid),
  public.ticket_order_checkout(uuid, text, timestamptz), public.ticket_order_paid(uuid, text, text), public.ticket_order_expired(uuid),
  public.ticket_pass(uuid) from public, anon, authenticated;
grant execute on function public.ticket_event_save(uuid, boolean, timestamptz, jsonb, int), public.ticket_event(uuid), public.ticket_sales(uuid),
  public.ticket_admit(uuid, text), public.tickets_on_sale(), public.ticket_order_start(uuid, jsonb), public.ticket_order_status(uuid),
  public.ticket_order_cancel(uuid), public.my_tickets(), public.ticket_for_wallet(uuid) to authenticated, service_role;
grant execute on function public.ticket_order_checkout(uuid, text, timestamptz), public.ticket_order_paid(uuid, text, text),
  public.ticket_order_expired(uuid), public.ticket_pass(uuid) to service_role;
grant select on public.ticketed_events, public.ticket_types, public.ticket_orders, public.tickets to authenticated;
grant all on public.ticketed_events, public.ticket_types, public.ticket_orders, public.tickets to service_role;
