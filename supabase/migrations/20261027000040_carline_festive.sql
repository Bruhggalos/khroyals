-- Car line board: festive touches, on or off.
--
-- The big-screen board (app/carline-board.tsx) shows holiday scenes and birthday celebrations
-- (src/carline/festive.ts). Car line leads and the office (app.can_run_carline) turn them all off,
-- or one at a time, for every screen at once; carline_config() reports the choice. Everything is on
-- until switched off, so touches added later start on.

/** Every festive touch the board knows; the same list as FESTIVE in src/carline/festive.ts. */
create function app.festive_keys() returns text[]
language sql immutable as $$
  select array['birthdays', 'labor-day', 'fall-break', 'veterans-day', 'thanksgiving', 'christmas', 'mlk-day',
               'valentines', 'presidents-day', 'st-patricks', 'spring-break', 'easter', 'mothers-day', 'memorial-day']
$$;

insert into app.settings (key, value) values ('carline_festive', '{"enabled": true, "off": []}') on conflict (key) do nothing;

create or replace function public.carline_config() returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'latitude', app.setting('carline_latitude')::float8,
    'longitude', app.setting('carline_longitude')::float8,
    'radius', app.setting('carline_radius_m')::float8,
    'start', app.setting('carline_start'),
    'end', app.setting('carline_end'),
    'line', app.carline_window(),
    'festive', coalesce(app.setting('carline_festive')::jsonb, '{"enabled": true, "off": []}'::jsonb),
    'canEdit', app.can_run_carline())
$$;

/** Car line leads and the office: turn the board's festive touches on or off (`p_off`: the ones switched off) for every screen. */
create function public.carline_set_festive(p_enabled boolean, p_off text[]) returns jsonb
language plpgsql security definer set search_path = public as $$
declare unknown text;
begin
  if not app.can_run_carline() then
    raise exception 'Only car line leads and the office can change car line settings.' using errcode = '42501';
  end if;
  select k into unknown from unnest(coalesce(p_off, '{}')) k where k <> all (app.festive_keys()) limit 1;
  if unknown is not null then raise exception 'Unknown festive touch: %', unknown; end if;
  insert into app.settings (key, value)
  values ('carline_festive', jsonb_build_object('enabled', coalesce(p_enabled, true),
          'off', coalesce((select jsonb_agg(distinct k order by k) from unnest(p_off) k), '[]'::jsonb))::text)
  on conflict (key) do update set value = excluded.value;
  perform app.audit(null, 'carline.festive', null, jsonb_build_object('enabled', p_enabled, 'off', p_off));
  return public.carline_config();
end $$;

revoke all on function public.carline_set_festive(boolean, text[]) from public, anon;
grant execute on function public.carline_set_festive(boolean, text[]) to authenticated, service_role;
