-- Email parents when their child is picked up from the car line.
--
-- When staff mark a pickup, every parent of the child gets an email saying who
-- picked the child up (the parent or family member who announced, with their
-- vehicle when one was saved), which staff member released them, and when.
-- The other parents also get it in the app (bell + push).
--
-- Emails wait a minute before going out, so a mis-tap that staff undo
-- (carline_reopen) cancels the email instead of alarming a parent. They are
-- sent by the send-email Edge Function through Resend (RESEND_API_KEY is a
-- Supabase function secret, never in the repo); pg_cron runs it every minute.

insert into app.settings values
  ('email_from', 'Kingdom Heights Car Line <noreply@keytrainlearning.com>'),
  ('school_phone', '(256) 210-1343')
on conflict (key) do nothing;

create table app.email_queue (
  id         uuid primary key default gen_random_uuid(),
  to_email   text not null,
  subject    text not null,
  body       text not null,                       -- plain text; the function also sends it as simple HTML
  pickup_id  uuid references public.carline_pickups (id) on delete cascade,
  send_after timestamptz not null default now(),
  status     text not null default 'queued' check (status in ('queued', 'sending', 'sent', 'failed', 'cancelled')),
  error      text,
  created_at timestamptz not null default now(),
  sent_at    timestamptz
);
create index on app.email_queue (status, send_after);
revoke all on app.email_queue from public, anon, authenticated;
grant all on app.email_queue to service_role;

/** "3:12 PM" in the school's time zone. */
create function app.school_clock(t timestamptz) returns text
language sql stable as $$ select trim(to_char(t at time zone 'America/Chicago', 'FMHH12:MI AM')) $$;

/** A pickup was confirmed: queue the parents' emails and tell the other parents in the app. */
create function app.pickup_confirmed() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  kid profiles%rowtype; by_name text; by_role text; staff text; num text; vehicle text; line text; g record;
begin
  if new.status <> 'picked_up' or old.status = 'picked_up' then return new; end if;
  select * into kid from profiles where id = new.student_id;
  select number into num from pickup_numbers where student_id = new.student_id;
  select nullif(trim(first_name || ' ' || last_name), ''),
         case when exists (select 1 from guardians where guardian_id = new.guardian_id and student_id = new.student_id) then 'parent'
              when school_role = 'family' then 'family member' else school_role end
    into by_name, by_role from profiles where id = new.guardian_id;
  select nullif(trim(first_name || ' ' || last_name), '') into staff from profiles where id = new.picked_up_by;
  vehicle := new.vehicle->>'label';
  line := coalesce(kid.first_name, 'Your child') || ' was picked up at ' || app.school_clock(coalesce(new.picked_up_at, now()))
          || coalesce(' by ' || by_name, '') || '.';

  for g in
    select gg.guardian_id, pp.email from guardians gg left join profile_private pp on pp.id = gg.guardian_id
    where gg.student_id = new.student_id
  loop
    if g.email is not null and g.email like '%@%' then
      insert into app.email_queue (to_email, subject, body, pickup_id, send_after)
      values (g.email,
        trim(kid.first_name) || ' was picked up at ' || app.school_clock(coalesce(new.picked_up_at, now())),
        concat_ws(E'\n\n',
          trim(kid.first_name || ' ' || kid.last_name) || ' was picked up from the Kingdom Heights car line at '
            || app.school_clock(coalesce(new.picked_up_at, now())) || ' on '
            || to_char(coalesce(new.picked_up_at, now()) at time zone 'America/Chicago', 'FMDay, FMMonth FMDD') || '.',
          'Picked up by: ' || coalesce(by_name || ' (' || by_role || ')', 'not recorded')
            || coalesce(E'\nVehicle: ' || vehicle, '')
            || coalesce(E'\nReleased by: ' || staff || ' (school staff)', '')
            || coalesce(E'\nPickup number: ' || num, ''),
          'If you weren''t expecting this, call the school office right away at '
            || coalesce(app.setting('school_phone'), 'the school') || '.',
          'Kingdom Heights Preparatory School · Royals Connect'),
        new.id, now() + interval '1 minute');
    end if;
    if g.guardian_id is distinct from new.guardian_id then
      perform app.notify_user(g.guardian_id, '🚗 ' || coalesce(kid.first_name, 'Your child') || ' was picked up', line,
                              jsonb_build_object('carline', 'picked-up', 'pickupId', new.id));
    end if;
  end loop;
  return new;
end $$;
create trigger pickup_confirmed after update of status on public.carline_pickups
  for each row execute function app.pickup_confirmed();

/** Undone within the minute: the email never goes out. */
create function app.pickup_reopened() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if old.status = 'picked_up' and new.status <> 'picked_up' then
    update app.email_queue set status = 'cancelled' where pickup_id = new.id and status = 'queued';
  end if;
  return new;
end $$;
create trigger pickup_reopened after update of status on public.carline_pickups
  for each row execute function app.pickup_reopened();

-- ======================================================================
-- Sending (send-email Edge Function, service role only)
-- ======================================================================

/** Claim the emails that are due (oldest first) so two runs never send one twice. */
create function public.email_claim(p_limit int default 20)
returns table (id uuid, to_email text, subject text, body text, sender text)
language sql security definer set search_path = public as $$
  update app.email_queue q set status = 'sending'
  where q.id in (select x.id from app.email_queue x where x.status = 'queued' and x.send_after <= now()
                 order by x.send_after limit greatest(1, least(coalesce(p_limit, 20), 100)) for update skip locked)
  returning q.id, q.to_email, q.subject, q.body, coalesce(app.setting('email_from'), 'Royals Connect <noreply@keytrainlearning.com>')
$$;

create function public.email_done(p_id uuid, p_error text default null) returns void
language sql security definer set search_path = public as $$
  update app.email_queue set status = case when p_error is null then 'sent' else 'failed' end,
    error = p_error, sent_at = case when p_error is null then now() end
  where id = p_id
$$;

/** Run every minute: wake the send-email function when something is due. */
create function app.kick_email() returns void
language plpgsql security definer set search_path = public as $$
declare url text := app.setting('functions_url');
begin
  if url is null or not exists (select 1 from app.email_queue where status = 'queued' and send_after <= now()) then return; end if;
  begin
    perform net.http_post(url := url || '/send-email', body := '{}'::jsonb, headers := '{"Content-Type": "application/json"}'::jsonb);
  exception when others then
    raise warning 'email kick failed: %', sqlerrm;
  end;
end $$;

do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.schedule('send-email', '* * * * *', 'select app.kick_email()');
  end if;
exception when others then
  raise notice 'could not schedule send-email: %', sqlerrm;
end $$;

revoke all on function app.pickup_confirmed(), app.pickup_reopened(), app.kick_email() from public, anon, authenticated;
revoke all on function public.email_claim(int), public.email_done(uuid, text) from public, anon, authenticated;
grant execute on function public.email_claim(int), public.email_done(uuid, text) to service_role;
