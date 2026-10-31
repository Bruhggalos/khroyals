-- Today's vehicle: the button under Check In (and My vehicles → Use for next pickup) picks the vehicle you're
-- using. It becomes your default, as before, and if you're already in line staff see the new one on the board
-- straight away; you keep your place.

/** Make one of your vehicles today's: the default for the next pickup, and what staff look for if you're in line. */
create or replace function public.vehicle_use(p_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare v vehicles%rowtype;
begin
  update vehicles set last_used_at = now() where id = p_id and owner_id = auth.uid() returning * into v;
  if not found then raise exception 'That vehicle isn''t one of yours.' using errcode = '42501'; end if;
  update carline_pickups set vehicle = app.vehicle_snapshot(v)
   where guardian_id = auth.uid() and day = app.school_today() and status = 'waiting';
end $$;
