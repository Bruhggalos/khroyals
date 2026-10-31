-- Pickup transfers: from the Car Line, a parent hands their children's pickup to another approved account for a
-- day (today or a day ahead). They find the person by name (pickup_transfer_people: approved adults, never
-- students or substitutes, names only) and ask (pickup_transfer); the person accepts or declines
-- (pickup_transfer_answer). Until they accept, the parents keep pickup, and a parent checking in calls the ask off.
-- Once accepted, on that day the child is in the person's car line (app.pickup_children) and nobody else can check
-- the child in (trigger on carline_pickups), until a parent cancels it or the person says they can't make it
-- (pickup_transfer_cancel). Everyone involved hears about each step.

create table public.pickup_transfers (
  id          uuid primary key default gen_random_uuid(),
  request_id  uuid not null,                    -- one ask can cover several children
  student_id  uuid not null references public.profiles (id) on delete cascade,
  from_id     uuid references public.profiles (id) on delete set null,
  to_id       uuid not null references public.profiles (id) on delete cascade,
  day         date not null,
  status      text not null default 'pending' check (status in ('pending', 'accepted', 'declined', 'cancelled')),
  created_at  timestamptz not null default now(),
  answered_at timestamptz
);
-- One live handoff per child and day.
create unique index pickup_transfers_one_a_day on public.pickup_transfers (student_id, day) where status in ('pending', 'accepted');
create index pickup_transfers_to on public.pickup_transfers (to_id, day);
create index pickup_transfers_request on public.pickup_transfers (request_id);
alter table public.pickup_transfers enable row level security;
create policy "the person, the child's parents, or staff" on public.pickup_transfers for select to authenticated
  using (to_id = auth.uid() or from_id = auth.uid() or app.is_guardian_of(student_id) or app.is_staff());
grant select on public.pickup_transfers to authenticated;
revoke insert, update, delete on public.pickup_transfers from anon, authenticated;
grant all on public.pickup_transfers to service_role;
alter publication supabase_realtime add table public.pickup_transfers;

/** "Priya Shah" */
create function app.person_name(u uuid) returns text
language sql stable security definer set search_path = public as $$
  select coalesce(nullif(trim(coalesce(first_name, '') || ' ' || coalesce(last_name, '')), ''), 'Someone') from profiles where id = u
$$;

/** "Ava", "Ava and Leo", "Ava, Leo and Mia" */
create function app.and_list(t text[]) returns text
language sql immutable as $$
  select case coalesce(cardinality(t), 0) when 0 then '' when 1 then t[1]
         else array_to_string(t[1:cardinality(t) - 1], ', ') || ' and ' || t[cardinality(t)] end
$$;

/** "today", "tomorrow", "on Tue, Nov 3" */
create function app.transfer_day(d date) returns text
language sql stable as $$
  select case d - app.school_today() when 0 then 'today' when 1 then 'tomorrow' else 'on ' || to_char(d, 'FMDy, FMMon FMDD') end
$$;

/** Someone pickup can be handed to: an approved adult account, never a student, a substitute or a child without a login. */
create function app.can_take_pickup(u uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from profiles where id = u and school_role is not null and school_role not in ('student', 'substitute')
                   and not managed)
$$;

/** Children someone may pick up today: as before, plus children whose pickup was handed to them for today. */
create or replace function app.pickup_children(u uuid default auth.uid()) returns setof uuid
language sql stable security definer set search_path = public as $$
  select student_id from guardians where guardian_id = u and not app.is_family(u)
  union
  select student_id from family_pickups where family_id = u and app.is_family(u)
  union
  select student_id from pickup_authorizations
  where person_id = u and app.school_today() between starts_on and coalesce(ends_on, app.school_today())
    and coalesce(app.school_role(u), 'student') <> 'student'
  union
  select student_id from pickup_transfers
  where to_id = u and day = app.school_today() and status = 'accepted' and app.can_take_pickup(u)
$$;

/**
 * Check-ins follow handoffs: once a child's pickup is handed to someone for the day, only they check the child in
 * (anyone else's check-in skips that child, so a parent's "check in everyone" still covers the rest). A check-in
 * while an ask is waiting for an answer calls the ask off.
 */
create function app.pickup_transfer_check_in() returns trigger
language plpgsql security definer set search_path = public as $$
declare t pickup_transfers%rowtype; kid text;
begin
  if new.guardian_id is null then return new; end if;
  if exists (select 1 from pickup_transfers where student_id = new.student_id and day = new.day and status = 'accepted'
               and to_id <> new.guardian_id) then
    return null;
  end if;
  for t in select * from pickup_transfers where student_id = new.student_id and day = new.day and status = 'pending'
             and to_id <> new.guardian_id loop
    update pickup_transfers set status = 'cancelled', answered_at = now() where id = t.id;
    select trim(first_name) into kid from profiles where id = t.student_id;
    perform app.notify_user(t.to_id, 'Pickup of ' || kid || ' called off',
      app.person_name(new.guardian_id) || ' is picking up ' || kid || ' after all, so you don''t need to.',
      jsonb_build_object('carline', 'transfer'));
  end loop;
  return new;
end $$;
create trigger pickup_transfer_check_in before insert on public.carline_pickups
  for each row execute function app.pickup_transfer_check_in();

/** Parents: who they can hand pickup to, by name. Approved adults only, and only their names. */
create function public.pickup_transfer_people(p_query text) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare q text := lower(trim(coalesce(p_query, '')));
begin
  if app.is_family() or not exists (select 1 from guardians where guardian_id = auth.uid()) then
    raise exception 'Only parents can hand pickup to someone else.' using errcode = '42501';
  end if;
  if length(q) < 2 then return '[]'::jsonb; end if;
  q := replace(replace(replace(q, '\', '\\'), '%', '\%'), '_', '\_');
  return coalesce((
    select jsonb_agg(jsonb_build_object('id', x.id, 'name', x.name) order by x.last_name, x.first_name)
    from (select p.id, trim(p.first_name || ' ' || p.last_name) as name, p.first_name, p.last_name
          from profiles p
          where p.id <> auth.uid() and app.can_take_pickup(p.id)
            and (lower(trim(p.first_name || ' ' || p.last_name)) like '%' || q || '%' or lower(p.last_name) like q || '%')
          order by p.last_name, p.first_name limit 20) x), '[]'::jsonb);
end $$;

/** A parent asks someone to pick these children up on a day (today or ahead). Returns the ask's id. */
create function public.pickup_transfer(p_students uuid[], p_to uuid, p_day date default null) returns uuid
language plpgsql security definer set search_path = public as $$
declare d date := coalesce(p_day, app.school_today()); req uuid := gen_random_uuid(); s uuid; kid text; names text[] := '{}';
begin
  if coalesce(cardinality(p_students), 0) = 0 then raise exception 'Choose who they''re picking up.'; end if;
  if exists (select 1 from unnest(p_students) x where not app.is_guardian_of(x)) then
    raise exception 'Only a child''s parents can hand their pickup to someone else.' using errcode = '42501';
  end if;
  if p_to is null or p_to = auth.uid() or not app.can_take_pickup(p_to) then
    raise exception 'Choose someone else with an approved Royals Connect account.';
  end if;
  if d < app.school_today() then raise exception 'Choose today or a day ahead.'; end if;
  if d > app.school_today() + 60 then raise exception 'Choose a day in the next two months.'; end if;
  if (select count(distinct request_id) from pickup_transfers
       where from_id = auth.uid() and created_at > now() - interval '1 day') >= 20 then
    raise exception 'That''s a lot of pickup requests for one day. Try again tomorrow.';
  end if;
  for s in select distinct x from unnest(p_students) x loop
    select trim(first_name) into kid from profiles where id = s;
    if exists (select 1 from pickup_transfers where student_id = s and day = d and status in ('pending', 'accepted')) then
      raise exception '%''s pickup % is already handed to someone. Cancel that first.', kid, app.transfer_day(d);
    end if;
    if d = app.school_today() and exists (select 1 from carline_pickups where student_id = s and day = d
                                            and status in ('waiting', 'picked_up')) then
      raise exception '% is already in the car line or picked up today.', kid;
    end if;
    insert into pickup_transfers (request_id, student_id, from_id, to_id, day) values (req, s, auth.uid(), p_to, d);
    names := names || kid;
  end loop;
  select array_agg(n order by n) into names from unnest(names) n;
  perform app.notify_user(p_to, '🚗 Can you pick up ' || app.and_list(names) || '?',
    app.person_name(auth.uid()) || ' asks you to pick up ' || app.and_list(names) || ' from the car line '
      || app.transfer_day(d) || '. Open the Car Line to accept or decline.',
    jsonb_build_object('carline', 'transfer', 'request', req));
  perform app.audit(null, 'pickup.transfer_asked', req::text,
    jsonb_build_object('to', p_to, 'day', d, 'students', to_jsonb(p_students)));
  return req;
end $$;

/** The person asked accepts or declines (every child in the ask); the parents hear the answer. */
create function public.pickup_transfer_answer(p_request uuid, p_accept boolean) returns void
language plpgsql security definer set search_path = public as $$
declare d date; who text := app.person_name(auth.uid()); fname text; r record;
begin
  select min(day) into d from pickup_transfers
   where request_id = p_request and to_id = auth.uid() and status = 'pending' and day >= app.school_today();
  if d is null then raise exception 'That pickup request isn''t waiting for your answer anymore.'; end if;
  update pickup_transfers set status = case when p_accept then 'accepted' else 'declined' end, answered_at = now()
   where request_id = p_request and to_id = auth.uid() and status = 'pending';
  select trim(first_name) into fname from profiles where id = auth.uid();
  for r in select g.guardian_id, array_agg(trim(p.first_name) order by p.first_name) as kids
             from pickup_transfers x join guardians g on g.student_id = x.student_id join profiles p on p.id = x.student_id
            where x.request_id = p_request and not app.is_family(g.guardian_id)
            group by g.guardian_id loop
    if p_accept then
      perform app.notify_user(r.guardian_id, '✅ ' || who || ' will pick up ' || app.and_list(r.kids),
        fname || ' will pick up ' || app.and_list(r.kids) || ' from the car line ' || app.transfer_day(d)
          || '. Cancel it in the Car Line if plans change.',
        jsonb_build_object('carline', 'transfer'));
    else
      perform app.notify_user(r.guardian_id, who || ' can''t pick up ' || app.and_list(r.kids),
        fname || ' declined picking up ' || app.and_list(r.kids) || ' ' || app.transfer_day(d) || ', so pickup stays with you.',
        jsonb_build_object('carline', 'transfer'));
    end if;
  end loop;
  perform app.audit(null, case when p_accept then 'pickup.transfer_accepted' else 'pickup.transfer_declined' end, p_request::text, null);
end $$;

/**
 * Call a handoff off: a parent of the child, or the person it was handed to ("can't make it"). Pending or accepted,
 * never once the child is picked up; the person's check-in for the child, if any, is cancelled with it.
 */
create function public.pickup_transfer_cancel(p_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare t pickup_transfers%rowtype; kid text; who text := app.person_name(auth.uid()); g uuid;
begin
  select * into t from pickup_transfers where id = p_id and status in ('pending', 'accepted') for update;
  if not found or not (app.is_guardian_of(t.student_id) or t.to_id = auth.uid()) then
    raise exception 'That pickup handoff can''t be changed.' using errcode = '42501';
  end if;
  select trim(first_name) into kid from profiles where id = t.student_id;
  if exists (select 1 from carline_pickups where student_id = t.student_id and day = t.day and status = 'picked_up') then
    raise exception '% was already picked up.', kid;
  end if;
  update pickup_transfers set status = 'cancelled', answered_at = now() where id = p_id;
  update carline_pickups set status = 'cancelled'
   where student_id = t.student_id and day = t.day and status = 'waiting' and guardian_id = t.to_id;
  if auth.uid() = t.to_id then
    for g in select guardian_id from guardians where student_id = t.student_id and not app.is_family(guardian_id) loop
      perform app.notify_user(g, who || ' can''t pick up ' || kid,
        who || ' can''t pick up ' || kid || ' ' || app.transfer_day(t.day) || ' after all, so pickup is back with you.',
        jsonb_build_object('carline', 'transfer'));
    end loop;
  else
    perform app.notify_user(t.to_id, 'Pickup of ' || kid || ' called off',
      who || ' called off your pickup of ' || kid || ' ' || app.transfer_day(t.day) || '. You don''t need to pick ' || kid || ' up.',
      jsonb_build_object('carline', 'transfer'));
    if t.status = 'accepted' then
      for g in select guardian_id from guardians where student_id = t.student_id and guardian_id <> auth.uid()
                 and not app.is_family(guardian_id) loop
        perform app.notify_user(g, 'Pickup of ' || kid || ' is back with you',
          who || ' cancelled ' || app.person_name(t.to_id) || '''s pickup of ' || kid || ' ' || app.transfer_day(t.day) || '.',
          jsonb_build_object('carline', 'transfer'));
      end loop;
    end if;
  end if;
  perform app.audit(null, 'pickup.transfer_cancelled', t.request_id::text, jsonb_build_object('student', t.student_id));
end $$;

/** Handoffs from today on: your children's (whichever parent asked), and the asks made of you. */
create function public.my_pickup_transfers() returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'children', coalesce((
      select jsonb_agg(jsonb_build_object('id', x.id, 'requestId', x.request_id, 'studentId', x.student_id, 'child', trim(s.first_name),
                                          'toId', x.to_id, 'to', app.person_name(x.to_id), 'from', app.person_name(x.from_id),
                                          'day', x.day, 'status', x.status)
                       order by x.day, s.first_name, x.created_at)
      from pickup_transfers x join profiles s on s.id = x.student_id
      where app.is_guardian_of(x.student_id) and x.day >= app.school_today() and x.status in ('pending', 'accepted', 'declined')),
      '[]'::jsonb),
    'asked', coalesce((
      select jsonb_agg(q.r order by q.day, q.created)
      from (select x.day, min(x.created_at) as created,
                   jsonb_build_object('requestId', x.request_id, 'from', app.person_name(x.from_id), 'day', x.day, 'status', x.status,
                     'children', jsonb_agg(jsonb_build_object('id', x.id, 'studentId', x.student_id,
                                                              'name', trim(s.first_name || ' ' || s.last_name)) order by s.first_name)) as r
            from pickup_transfers x join profiles s on s.id = x.student_id
            where x.to_id = auth.uid() and x.day >= app.school_today() and x.status in ('pending', 'accepted')
            group by x.request_id, x.from_id, x.day, x.status) q),
      '[]'::jsonb))
$$;

revoke all on function app.pickup_transfer_check_in() from public, anon, authenticated;
revoke all on function public.pickup_transfer_people(text), public.pickup_transfer(uuid[], uuid, date),
  public.pickup_transfer_answer(uuid, boolean), public.pickup_transfer_cancel(uuid), public.my_pickup_transfers() from public, anon;
grant execute on function public.pickup_transfer_people(text), public.pickup_transfer(uuid[], uuid, date),
  public.pickup_transfer_answer(uuid, boolean), public.pickup_transfer_cancel(uuid), public.my_pickup_transfers()
  to authenticated, service_role;
