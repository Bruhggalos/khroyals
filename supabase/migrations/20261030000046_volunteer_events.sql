-- Volunteer events: opportunities grouped under an event. Harvest Fest is one card in the Volunteer app;
-- inside it are its opportunities, like bringing bottled water or setting up the day of.
--
-- Any Volunteer Leader starts an event and adds opportunities to any open one; the leader who started
-- an event changes or removes it (removing keeps its opportunities, on their own). An opportunity's
-- leader can also move it into or out of an event. Everyone who can volunteer sees open events.
-- The event's leader puts its opportunities in order, most important first (position); ones without
-- a position (added since) follow, by date.

create table public.volunteer_events (
  id          uuid primary key default gen_random_uuid(),
  lead_id     uuid not null references public.profiles (id) on delete cascade,
  title       text not null check (char_length(trim(title)) between 1 and 100),
  description text not null default '' check (char_length(description) <= 2000),
  starts_on   date not null,
  ends_on     date,
  location    text check (char_length(location) <= 120),
  status      text not null default 'open' check (status in ('open', 'deleted')),
  created_at  timestamptz not null default now(),
  check (ends_on is null or ends_on >= starts_on)
);
create index on public.volunteer_events (starts_on);

alter table public.volunteer_opportunities add column event_id uuid references public.volunteer_events (id) on delete set null;
alter table public.volunteer_opportunities add column position int;
create index on public.volunteer_opportunities (event_id);

alter table public.volunteer_events enable row level security;
create policy "open events, for everyone who can volunteer" on public.volunteer_events for select to authenticated
  using (app.can_volunteer() and status = 'open' or app.has_permission('groups.manage'));

/** Volunteer Leaders: start an event (p_id null) or change one you started. */
create function public.volunteer_event_save(p_id uuid, p_title text, p_description text, p_starts_on date,
                                            p_ends_on date default null, p_location text default null) returns uuid
language plpgsql security definer set search_path = public as $$
declare new_id uuid;
begin
  if not app.is_volunteer_lead() then raise exception 'Only Volunteer Leaders can start events.' using errcode = '42501'; end if;
  if coalesce(trim(p_title), '') = '' then raise exception 'Give the event a name, like "Harvest Fest".'; end if;
  if p_starts_on is null then raise exception 'Choose the day of the event.'; end if;
  if p_ends_on is not null and p_ends_on < p_starts_on then raise exception 'The event has to end on or after the day it starts.'; end if;
  if p_id is null then
    insert into volunteer_events (lead_id, title, description, starts_on, ends_on, location)
    values (auth.uid(), trim(p_title), coalesce(trim(p_description), ''), p_starts_on, p_ends_on, nullif(trim(p_location), ''))
    returning id into new_id;
    return new_id;
  end if;
  update volunteer_events set title = trim(p_title), description = coalesce(trim(p_description), ''), starts_on = p_starts_on,
    ends_on = p_ends_on, location = nullif(trim(p_location), '')
  where id = p_id and lead_id = auth.uid() and status = 'open';
  if not found then raise exception 'You can only change events you started.' using errcode = '42501'; end if;
  return p_id;
end $$;

/** The event's leader (or groups.manage): remove it. Its opportunities stay, on their own. */
create function public.volunteer_event_delete(p_id uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  update volunteer_events set status = 'deleted'
  where id = p_id and status = 'open' and (lead_id = auth.uid() or app.has_permission('groups.manage'));
  if not found then raise exception 'You can only remove events you started.' using errcode = '42501'; end if;
  update volunteer_opportunities set event_id = null, position = null where event_id = p_id;
end $$;

/** An opportunity's leader: put it under an open event, or (null) on its own. */
create function public.volunteer_set_event(p_opportunity uuid, p_event uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if p_event is not null and not exists (select 1 from volunteer_events where id = p_event and status = 'open') then
    raise exception 'That event isn''t open anymore.';
  end if;
  update volunteer_opportunities set event_id = p_event, position = null
  where id = p_opportunity and lead_id = auth.uid() and status = 'open';
  if not found then raise exception 'You can only move opportunities you lead.' using errcode = '42501'; end if;
end $$;

/** The event's leader (or groups.manage): its opportunities in this order, most important first. Ones left out follow, by date. */
create function public.volunteer_event_reorder(p_event uuid, p_order uuid[]) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from volunteer_events where id = p_event and status = 'open'
                 and (lead_id = auth.uid() or app.has_permission('groups.manage'))) then
    raise exception 'Only the event''s leader can change the order.' using errcode = '42501';
  end if;
  update volunteer_opportunities set position = array_position(p_order, id) where event_id = p_event;
end $$;

-- Posting an opportunity can put it under an event (p_event, last so older calls still work).
drop function public.volunteer_post(text, text, date, date, time, time, text, int, text, text, int);
create function public.volunteer_post(
  p_title text, p_description text, p_starts_on date, p_ends_on date default null,
  p_start_time time default null, p_end_time time default null, p_location text default null, p_spots int default null,
  p_kind text default 'help', p_item text default null, p_quantity int default null, p_event uuid default null
) returns public.volunteer_opportunities
language plpgsql security definer set search_path = public as $$
declare r volunteer_opportunities%rowtype; items boolean := coalesce(p_kind, 'help') = 'items';
begin
  if not app.is_volunteer_lead() then
    raise exception 'Only Volunteer Leaders can post opportunities.' using errcode = '42501';
  end if;
  if items and nullif(trim(p_item), '') is null then raise exception 'Say what you need, like "boxes of tissues".'; end if;
  if items and coalesce(p_quantity, 0) < 1 then raise exception 'Say how many you need.'; end if;
  if p_event is not null and not exists (select 1 from volunteer_events where id = p_event and status = 'open') then
    raise exception 'That event isn''t open anymore.';
  end if;
  insert into volunteer_opportunities (lead_id, title, description, starts_on, ends_on, start_time, end_time, location, spots,
                                       kind, item, quantity, event_id)
  values (auth.uid(), trim(p_title), coalesce(trim(p_description), ''), p_starts_on, p_ends_on, p_start_time, p_end_time,
          nullif(trim(p_location), ''), case when items then null else p_spots end,
          case when items then 'items' else 'help' end, case when items then trim(p_item) end, case when items then p_quantity end, p_event)
  returning * into r;
  return r;
end $$;

revoke all on function public.volunteer_event_save(uuid, text, text, date, date, text), public.volunteer_event_delete(uuid),
  public.volunteer_set_event(uuid, uuid), public.volunteer_event_reorder(uuid, uuid[]), public.volunteer_post(text, text, date, date, time, time, text, int, text, text, int, uuid)
  from public, anon;
grant execute on function public.volunteer_event_save(uuid, text, text, date, date, text), public.volunteer_event_delete(uuid),
  public.volunteer_set_event(uuid, uuid), public.volunteer_event_reorder(uuid, uuid[]), public.volunteer_post(text, text, date, date, time, time, text, int, text, text, int, uuid)
  to authenticated, service_role;
grant select on public.volunteer_events to authenticated;
grant all on public.volunteer_events to service_role;
