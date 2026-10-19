-- ======================================================================
-- Car line vehicles. Whoever picks children up (parents, Family accounts,
-- staff) saves the vehicles they drive in My profile: make, type and color.
-- Announcing pickup records which vehicle is coming, so car line staff can
-- spot it on the board. The last one used is the default, which automatic
-- check-in and the car screen use too.
--
-- Vehicle types and colors are listed here and in src/carline/vehicles.ts;
-- change them together.
-- ======================================================================

create table public.vehicles (
  id           uuid primary key default gen_random_uuid(),
  owner_id     uuid not null references public.profiles (id) on delete cascade,
  make         text not null check (char_length(trim(make)) between 1 and 40),
  kind         text not null check (kind in ('car', 'truck', 'suv', 'van', 'hatchback', 'motorcycle', 'bicycle', 'golf_cart')),
  color        text not null check (color in ('white', 'silver', 'black', 'gray', 'red', 'blue', 'green', 'brown',
                                              'beige', 'gold', 'orange', 'yellow')),
  last_used_at timestamptz,
  created_at   timestamptz not null default now()
);
create index vehicles_owner on public.vehicles (owner_id, last_used_at desc nulls last, created_at desc);
alter table public.vehicles enable row level security;
create policy "your own vehicles" on public.vehicles for select to authenticated using (owner_id = auth.uid());
grant select on public.vehicles to authenticated;
revoke insert, update, delete on public.vehicles from anon, authenticated;
grant all on public.vehicles to service_role;

-- What was coming, as it was when announced (editing or deleting the vehicle later doesn't change it).
alter table public.carline_pickups add column vehicle jsonb;

/** "Silver Honda SUV" */
create function app.vehicle_label(v public.vehicles) returns text
language sql stable as $$
  select initcap(v.color) || ' ' || trim(v.make) || ' '
         || case v.kind when 'suv' then 'SUV' when 'golf_cart' then 'Golf cart' else initcap(v.kind) end
$$;

create function app.vehicle_snapshot(v public.vehicles) returns jsonb
language sql stable as $$
  select case when v.id is null then null
         else jsonb_build_object('id', v.id, 'make', trim(v.make), 'kind', v.kind, 'color', v.color, 'label', app.vehicle_label(v)) end
$$;

/** The vehicle for a pickup: the one asked for (it must be yours), else your default (last used, else newest). */
create function app.pickup_vehicle(p_vehicle uuid, u uuid default auth.uid()) returns public.vehicles
language plpgsql stable security definer set search_path = public as $$
declare v vehicles%rowtype;
begin
  if p_vehicle is not null then
    select * into v from vehicles where id = p_vehicle and owner_id = u;
    if not found then raise exception 'That vehicle isn''t one of yours.' using errcode = '42501'; end if;
    return v;
  end if;
  select * into v from vehicles where owner_id = u order by last_used_at desc nulls last, created_at desc limit 1;
  return v;  -- all null when they haven't saved one
end $$;

-- ----------------------------------------------------------------------
-- My vehicles
-- ----------------------------------------------------------------------

/** Add (p_id null) or change one of your vehicles. */
create function public.vehicle_save(p_id uuid, p_make text, p_kind text, p_color text) returns public.vehicles
language plpgsql security definer set search_path = public as $$
declare row vehicles%rowtype;
begin
  if coalesce(app.school_role(), 'student') = 'student' then
    raise exception 'Vehicles are for the adults who pick children up.' using errcode = '42501';
  end if;
  if coalesce(trim(p_make), '') = '' then raise exception 'Add the vehicle''s make, like Honda or Ford.'; end if;
  if char_length(trim(p_make)) > 40 then raise exception 'Keep the make to 40 characters.'; end if;
  if p_kind is null or p_kind not in ('car', 'truck', 'suv', 'van', 'hatchback', 'motorcycle', 'bicycle', 'golf_cart') then
    raise exception 'Pick the vehicle type.';
  end if;
  if p_color is null or p_color not in ('white', 'silver', 'black', 'gray', 'red', 'blue', 'green', 'brown',
                                        'beige', 'gold', 'orange', 'yellow') then
    raise exception 'Pick the vehicle color.';
  end if;
  if p_id is null then
    if (select count(*) from vehicles where owner_id = auth.uid()) >= 10 then raise exception 'You can save up to 10 vehicles.'; end if;
    insert into vehicles (owner_id, make, kind, color) values (auth.uid(), trim(p_make), p_kind, p_color) returning * into row;
  else
    update vehicles set make = trim(p_make), kind = p_kind, color = p_color
     where id = p_id and owner_id = auth.uid() returning * into row;
    if not found then raise exception 'That vehicle isn''t one of yours.' using errcode = '42501'; end if;
  end if;
  return row;
end $$;

create function public.vehicle_delete(p_id uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  delete from vehicles where id = p_id and owner_id = auth.uid();
  if not found then raise exception 'That vehicle isn''t one of yours.' using errcode = '42501'; end if;
end $$;

/** Make one of your vehicles the default for the next pickup. */
create function public.vehicle_use(p_id uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  update vehicles set last_used_at = now() where id = p_id and owner_id = auth.uid();
  if not found then raise exception 'That vehicle isn''t one of yours.' using errcode = '42501'; end if;
end $$;

-- ----------------------------------------------------------------------
-- The car line records the vehicle
-- ----------------------------------------------------------------------

drop function public.carline_announce(uuid[], float8, float8, float8);
create function public.carline_announce(p_students uuid[], p_lat float8, p_lng float8, p_accuracy float8 default null,
                                        p_vehicle uuid default null)
returns setof public.carline_pickups
language plpgsql security definer set search_path = public as $$
declare kids uuid[]; dist int; v vehicles%rowtype; snap jsonb;
begin
  if coalesce(app.school_role(), 'student') = 'student' then
    raise exception 'Only parents can announce pickup.' using errcode = '42501';
  end if;
  if p_students is not null and exists (select 1 from unnest(p_students) s where not app.can_pick_up(s)) then
    raise exception 'You can only announce your own children.' using errcode = '42501';
  end if;
  kids := coalesce(p_students, array(select * from app.pickup_children()));
  if cardinality(kids) = 0 then raise exception 'No children are linked to your account yet.'; end if;
  if app.carline_window()->>'state' = 'closed' then raise exception 'The car line is closed right now.'; end if;
  dist := app.require_at_school(p_lat, p_lng, p_accuracy);
  v := app.pickup_vehicle(p_vehicle);
  snap := app.vehicle_snapshot(v);
  insert into carline_pickups (student_id, guardian_id, distance_m, vehicle)
    select distinct k, auth.uid(), dist, snap from unnest(kids) k
    on conflict (student_id, day) where status = 'waiting' do nothing;
  if snap is not null then
    -- Announcing again in another vehicle keeps the place in line and updates what staff look for.
    update carline_pickups set vehicle = snap
     where student_id = any (kids) and day = app.school_today() and status = 'waiting' and guardian_id = auth.uid();
    update vehicles set last_used_at = now() where id = v.id;
  end if;
  return query select * from carline_pickups
    where student_id = any (kids) and day = app.school_today() and status = 'waiting' order by arrived_at;
end $$;
revoke all on function public.carline_announce(uuid[], float8, float8, float8, uuid) from public, anon;
grant execute on function public.carline_announce(uuid[], float8, float8, float8, uuid) to authenticated, service_role;

/** Automatic check-in comes in the default vehicle. */
create or replace function public.carline_arrived(p_lat float8, p_lng float8, p_accuracy float8 default null) returns jsonb
language plpgsql security definer set search_path = public as $$
declare w jsonb := app.carline_window(); ids uuid[]; names text[]; dist int; v vehicles%rowtype; snap jsonb;
begin
  if app.school_role() is null then raise exception 'Sign in to use the car line.' using errcode = '42501'; end if;
  if w->>'state' <> 'open' then return w; end if;
  dist := app.require_at_school(p_lat, p_lng, p_accuracy);
  v := app.pickup_vehicle(null);
  snap := app.vehicle_snapshot(v);
  with ins as (
    insert into carline_pickups (student_id, guardian_id, via, distance_m, vehicle)
      select k.student_id, auth.uid(), 'arrival', dist, snap from app.pickup_children() k(student_id)
      where not exists (select 1 from carline_pickups c where c.student_id = k.student_id
                          and c.day = app.school_today() and c.status in ('waiting', 'picked_up'))
    on conflict (student_id, day) where status = 'waiting' do nothing
    returning id, student_id
  )
  select array_agg(ins.id order by p.first_name), array_agg(p.first_name order by p.first_name)
    into ids, names from ins join profiles p on p.id = ins.student_id;
  if snap is not null and cardinality(ids) > 0 then update vehicles set last_used_at = now() where id = v.id; end if;
  return jsonb_build_object('state', 'open', 'checkedIn', coalesce(to_jsonb(ids), '[]'::jsonb),
                            'names', coalesce(to_jsonb(names), '[]'::jsonb));
end $$;

/** Staff see the vehicle on the board, next to the pickup number. */
create or replace function public.carline_board() returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  if not app.is_staff() then raise exception 'The car line board is for school staff.' using errcode = '42501'; end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', c.id, 'studentId', c.student_id, 'status', c.status, 'via', c.via,
      'arrivedAt', c.arrived_at, 'pickedUpAt', c.picked_up_at, 'distanceM', c.distance_m,
      'number', n.number, 'name', trim(s.first_name || ' ' || s.last_name), 'grade', s.grade,
      'parent', trim(g.first_name || ' ' || g.last_name),
      'vehicle', c.vehicle->>'label', 'vehicleColor', c.vehicle->>'color', 'vehicleKind', c.vehicle->>'kind',
      'pickedUpBy', trim(coalesce(b.first_name, '') || ' ' || coalesce(b.last_name, '')))
      order by c.arrived_at)
    from carline_pickups c
    join profiles s on s.id = c.student_id
    left join pickup_numbers n on n.student_id = c.student_id
    left join profiles g on g.id = c.guardian_id
    left join profiles b on b.id = c.picked_up_by
    where c.day = app.school_today() and c.status in ('waiting', 'picked_up')), '[]'::jsonb);
end $$;

revoke all on function app.pickup_vehicle(uuid, uuid) from public, anon, authenticated;
revoke all on function public.vehicle_save(uuid, text, text, text), public.vehicle_delete(uuid), public.vehicle_use(uuid) from public, anon;
grant execute on function public.vehicle_save(uuid, text, text, text), public.vehicle_delete(uuid), public.vehicle_use(uuid)
  to authenticated, service_role;
