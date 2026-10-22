-- Volunteer item requests.
--
-- Besides asking for people's time, a Volunteer Leader can ask for things: "24 boxes of
-- tissues, by Friday, to the front office". People pledge how many they'll bring, up to
-- what's still needed; changing or taking back a pledge tells the leader. The opportunity
-- shows how much is pledged so far. A pledge is a volunteer_signups row with a quantity,
-- so the people pledging get the opportunity's chat, like volunteers do.

alter table public.volunteer_opportunities
  add column kind     text not null default 'help' check (kind in ('help', 'items')),
  add column item     text check (char_length(trim(item)) between 1 and 80),   -- "boxes of tissues"
  add column quantity int  check (quantity between 1 and 10000),               -- how many are needed
  add constraint volunteer_items_shape check (
    (kind = 'help' and item is null and quantity is null)
    or (kind = 'items' and item is not null and quantity is not null and spots is null));

alter table public.volunteer_signups
  add column quantity int check (quantity between 1 and 10000);                -- pledges only

-- ======================================================================
-- API
-- ======================================================================

-- Posting takes the kind, item and quantity too (new arguments at the end, with defaults).
drop function public.volunteer_post(text, text, date, date, time, time, text, int);
create function public.volunteer_post(
  p_title text, p_description text, p_starts_on date, p_ends_on date default null,
  p_start_time time default null, p_end_time time default null, p_location text default null, p_spots int default null,
  p_kind text default 'help', p_item text default null, p_quantity int default null
) returns public.volunteer_opportunities
language plpgsql security definer set search_path = public as $$
declare r volunteer_opportunities%rowtype; items boolean := coalesce(p_kind, 'help') = 'items';
begin
  if not app.is_volunteer_lead() then
    raise exception 'Only Volunteer Leaders can post opportunities.' using errcode = '42501';
  end if;
  if items and nullif(trim(p_item), '') is null then raise exception 'Say what you need, like "boxes of tissues".'; end if;
  if items and coalesce(p_quantity, 0) < 1 then raise exception 'Say how many you need.'; end if;
  insert into volunteer_opportunities (lead_id, title, description, starts_on, ends_on, start_time, end_time, location, spots,
                                       kind, item, quantity)
  values (auth.uid(), trim(p_title), coalesce(trim(p_description), ''), p_starts_on, p_ends_on, p_start_time, p_end_time,
          nullif(trim(p_location), ''), case when items then null else p_spots end,
          case when items then 'items' else 'help' end, case when items then trim(p_item) end, case when items then p_quantity end)
  returning * into r;
  return r;
end $$;

/** Say Yes! (until it's full). The leader hears about it. Item requests take pledges instead. */
create or replace function public.volunteer_say_yes(p_opportunity uuid) returns void
language plpgsql security definer set search_path = public as $$
declare o volunteer_opportunities%rowtype; taken int;
begin
  if not app.can_volunteer() then raise exception 'Volunteering is for parents and staff.' using errcode = '42501'; end if;
  select * into o from volunteer_opportunities where id = p_opportunity for update;  -- one sign-up at a time, so spots hold
  if not found or o.status <> 'open' then raise exception 'This opportunity isn''t available anymore.'; end if;
  if o.kind = 'items' then raise exception 'Choose how many you''ll bring.'; end if;
  if coalesce(o.ends_on, o.starts_on) < app.school_today() then raise exception 'This opportunity is over.'; end if;
  if o.lead_id = auth.uid() then raise exception 'You''re leading this one.'; end if;
  select count(*) into taken from volunteer_signups where opportunity_id = o.id;
  if o.spots is not null and taken >= o.spots then raise exception 'All spots are filled.'; end if;
  insert into volunteer_signups (opportunity_id, user_id) values (o.id, auth.uid());
  perform app.notify_user(o.lead_id, '🙋 ' || app.short_name(auth.uid()) || ' said yes',
    o.title || coalesce(' · ' || (taken + 1) || ' of ' || o.spots || ' spots filled', ' · ' || (taken + 1) || ' signed up') || '.',
    jsonb_build_object('opportunityId', o.id));
exception when unique_violation then
  raise exception 'You''ve already said yes.';
end $$;

/**
 * Pledge items for a request, or change how many: up to what's still needed. The leader
 * hears about it. (volunteer_withdraw takes a pledge back.)
 */
create function public.volunteer_pledge(p_opportunity uuid, p_quantity int) returns void
language plpgsql security definer set search_path = public as $$
declare o volunteer_opportunities%rowtype; mine int; others int;
begin
  if not app.can_volunteer() then raise exception 'Volunteering is for parents and staff.' using errcode = '42501'; end if;
  select * into o from volunteer_opportunities where id = p_opportunity for update;  -- one pledge at a time, so the total holds
  if not found or o.status <> 'open' then raise exception 'This request isn''t available anymore.'; end if;
  if o.kind <> 'items' then raise exception 'This opportunity takes sign-ups, not items.'; end if;
  if coalesce(o.ends_on, o.starts_on) < app.school_today() then raise exception 'This request is over.'; end if;
  if o.lead_id = auth.uid() then raise exception 'You''re leading this one.'; end if;
  if coalesce(p_quantity, 0) < 1 then raise exception 'Choose how many you''ll bring.'; end if;
  select quantity into mine from volunteer_signups where opportunity_id = o.id and user_id = auth.uid();
  if mine = p_quantity then return; end if;
  select coalesce(sum(quantity), 0) into others from volunteer_signups where opportunity_id = o.id and user_id <> auth.uid();
  if others + p_quantity > o.quantity then
    if others >= o.quantity then raise exception 'Everything''s been pledged. Thank you!'; end if;
    raise exception 'Only % more needed.', o.quantity - others;
  end if;
  insert into volunteer_signups (opportunity_id, user_id, quantity) values (o.id, auth.uid(), p_quantity)
  on conflict (opportunity_id, user_id) do update set quantity = excluded.quantity;
  perform app.notify_user(o.lead_id,
    '🎁 ' || app.short_name(auth.uid()) || case when mine is null then ' will bring ' else ' changed their pledge to ' end || p_quantity,
    o.item || ' for ' || o.title || ' · ' || (others + p_quantity) || ' of ' || o.quantity || ' pledged.',
    jsonb_build_object('opportunityId', o.id));
end $$;

/** A volunteer removes themselves (or takes back a pledge); the leader is told. */
create or replace function public.volunteer_withdraw(p_opportunity uuid) returns void
language plpgsql security definer set search_path = public as $$
declare o volunteer_opportunities%rowtype; q int;
begin
  delete from volunteer_signups where opportunity_id = p_opportunity and user_id = auth.uid() returning quantity into q;
  if not found then raise exception 'You''re not signed up for this.'; end if;
  select * into o from volunteer_opportunities where id = p_opportunity;
  if o.status = 'open' and o.kind = 'items' then
    perform app.notify_user(o.lead_id, app.short_name(auth.uid()) || ' took back their pledge',
      app.short_name(auth.uid()) || ' won''t bring the ' || q || ' ' || o.item || ' for ' || o.title || '.', jsonb_build_object('opportunityId', o.id));
  elsif o.status = 'open' then
    perform app.notify_user(o.lead_id, app.short_name(auth.uid()) || ' can''t make it',
      app.short_name(auth.uid()) || ' removed themselves from ' || o.title || '.', jsonb_build_object('opportunityId', o.id));
  end if;
end $$;

-- ======================================================================
-- Privileges
-- ======================================================================

revoke all on function public.volunteer_post(text, text, date, date, time, time, text, int, text, text, int),
  public.volunteer_pledge(uuid, int) from public, anon;
grant execute on function public.volunteer_post(text, text, date, date, time, time, text, int, text, text, int),
  public.volunteer_pledge(uuid, int) to authenticated, service_role;
