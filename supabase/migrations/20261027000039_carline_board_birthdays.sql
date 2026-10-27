-- Car line board: birthdays.
--
-- The big-screen board (app/carline-board.tsx) puts a crown on a child's name on their
-- birthday and celebrates when they're announced. The board gets only `birthday`
-- true/false for today, never the date itself (birthdays stay in student_details).

/** Whether `b` is a birthday on `on_day` (the school's today by default); Feb 29 birthdays count on Feb 28 in other years. */
create function app.is_birthday(b date, on_day date default app.school_today()) returns boolean
language sql stable as $$
  select b is not null and (
    to_char(b, 'MM-DD') = to_char(on_day, 'MM-DD')
    or (to_char(b, 'MM-DD') = '02-29' and to_char(on_day, 'MM-DD') = '02-28'
        and extract(day from make_date(extract(year from on_day)::int, 3, 1) - 1) = 28))
$$;

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
      'birthday', app.is_birthday(d.birthday),
      'pickedUpBy', trim(coalesce(b.first_name, '') || ' ' || coalesce(b.last_name, '')))
      order by c.arrived_at)
    from carline_pickups c
    join profiles s on s.id = c.student_id
    left join student_details d on d.student_id = c.student_id
    left join pickup_numbers n on n.student_id = c.student_id
    left join profiles g on g.id = c.guardian_id
    left join profiles b on b.id = c.picked_up_by
    where c.day = app.school_today() and c.status in ('waiting', 'picked_up')), '[]'::jsonb);
end $$;
