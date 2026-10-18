-- Car line on the car's screen (Android Auto; CarPlay can use the same calls).
--
-- The car screen runs as native code that can't use the app's sign-in, so a
-- parent's phone gets a car pass when they sign in: a random token, stored
-- hashed, that can do exactly two things for that parent — show today's car
-- line status for their own children, and check them in. Nothing else. Passes
-- last 90 days from last use and are revoked on sign-out.

create table app.car_passes (
  token_hash   text primary key,
  user_id      uuid not null references public.profiles (id) on delete cascade,
  created_at   timestamptz not null default now(),
  last_used_at timestamptz not null default now()
);
create index on app.car_passes (user_id);
revoke all on app.car_passes from public, anon, authenticated;

create function app.car_token_hash(t text) returns text
language sql immutable as $$ select encode(sha256(convert_to(coalesce(t, ''), 'UTF8')), 'hex') $$;

/** Signed-in parent: a car pass for this phone (returned once; only its hash is kept). */
create function public.create_car_pass() returns text
language plpgsql security definer set search_path = public as $$
declare t text;
begin
  if app.school_role() is null then raise exception 'Sign in first.' using errcode = '42501'; end if;
  if not exists (select 1 from guardians where guardian_id = auth.uid()) then
    raise exception 'The car screen is for parents with children linked to their account.' using errcode = '42501';
  end if;
  delete from app.car_passes where last_used_at < now() - interval '90 days';
  -- Keep a handful of devices per parent.
  delete from app.car_passes where token_hash in (
    select token_hash from app.car_passes where user_id = auth.uid() order by last_used_at desc offset 4);
  t := replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', '');
  insert into app.car_passes (token_hash, user_id) values (app.car_token_hash(t), auth.uid());
  return t;
end $$;

/** Sign-out: the pass stops working. */
create function public.revoke_car_pass(p_token text) returns void
language sql security definer set search_path = public as $$
  delete from app.car_passes where token_hash = app.car_token_hash(p_token)
$$;

/** Check a pass and act as its parent for the rest of this call. */
create function app.use_car_pass(p_token text) returns uuid
language plpgsql security definer set search_path = public as $$
declare u uuid;
begin
  update app.car_passes set last_used_at = now()
  where token_hash = app.car_token_hash(p_token) and last_used_at > now() - interval '90 days'
  returning user_id into u;
  if u is null or app.school_role(u) is null then
    raise exception 'Open KH Royals on your phone and sign in again.' using errcode = '42501';
  end if;
  perform set_config('request.jwt.claim.sub', u::text, true);
  perform set_config('request.jwt.claims', json_build_object('sub', u, 'role', 'authenticated', 'aal', 'aal1')::text, true);
  return u;
end $$;

/** Today's car line for the pass holder's children: {line, children: [{name, status, position}]}. */
create function public.car_carline_status(p_token text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare u uuid := app.use_car_pass(p_token);
begin
  return jsonb_build_object(
    'line', app.carline_window(),
    'children', coalesce((
      select jsonb_agg(jsonb_build_object(
               'name', trim(p.first_name),
               'status', coalesce(c.status, 'none'),
               'position', case when c.status = 'waiting' then (
                 select count(*) from carline_pickups w
                 where w.day = app.school_today() and w.status = 'waiting' and w.arrived_at <= c.arrived_at) end)
             order by p.first_name)
      from guardians g join profiles p on p.id = g.student_id
      left join lateral (
        select * from carline_pickups x
        where x.student_id = g.student_id and x.day = app.school_today() and x.status in ('waiting', 'picked_up')
        order by (x.status = 'waiting') desc, x.arrived_at desc limit 1) c on true
      where g.guardian_id = u), '[]'::jsonb));
end $$;

/** "I'm here": check in the pass holder's children, then return the new status. */
create function public.car_carline_check_in(p_token text) returns jsonb
language plpgsql security definer set search_path = public as $$
begin
  perform app.use_car_pass(p_token);
  if app.carline_window()->>'state' = 'closed' then
    raise exception 'The car line is closed right now.';
  end if;
  perform public.carline_check_in(null);
  return public.car_carline_status(p_token);
end $$;

revoke all on function app.car_token_hash(text), app.use_car_pass(text) from public, anon, authenticated;
revoke all on function public.create_car_pass() from public, anon;
grant execute on function public.create_car_pass() to authenticated, service_role;
revoke all on function public.revoke_car_pass(text), public.car_carline_status(text), public.car_carline_check_in(text) from public;
grant execute on function public.revoke_car_pass(text), public.car_carline_status(text), public.car_carline_check_in(text)
  to anon, authenticated, service_role;
