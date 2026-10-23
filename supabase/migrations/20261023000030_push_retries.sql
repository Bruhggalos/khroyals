-- Durable claims and checkpoints. Only the delivery worker can use these RPCs.
alter table public.notifications
  add column push_claim_id uuid,
  add column push_claim_until timestamptz,
  add column push_retry_after timestamptz not null default now(),
  add column push_attempts int not null default 0,
  add column push_remaining text[],
  add column push_delivery_error text;
create index on public.notifications (status, push_retry_after);

create function public.push_claim() returns setof public.notifications
language plpgsql security definer set search_path = public as $$
declare n notifications%rowtype;
begin
  update notifications set status = 'failed', error = 'Push expired before delivery.', push_claim_id = null
    where (status = 'queued' or (status = 'sending' and coalesce(push_claim_until, '-infinity') < now()))
      and (created_at < now() - interval '15 minutes' or push_attempts >= 5);
  select * into n from notifications
    where created_at >= now() - interval '15 minutes' and push_attempts < 5
      and ((status = 'queued' and push_retry_after <= now())
        or (status = 'sending' and coalesce(push_claim_until, '-infinity') < now()))
    order by created_at limit 1 for update skip locked;
  if not found then return; end if;
  update notifications set status = 'sending', push_claim_id = gen_random_uuid(),
    push_claim_until = now() + interval '2 minutes', push_attempts = push_attempts + 1, error = null,
    push_remaining = coalesce(push_remaining, array(select distinct token from app.push_targets(n.id)))
    where id = n.id returning * into n;
  return next n;
end $$;

create function public.push_progress(p_id uuid, p_claim uuid, p_processed text[], p_sent int, p_error text default null)
returns boolean language plpgsql security definer set search_path = public as $$
begin
  update notifications set
    push_remaining = array(select x from unnest(push_remaining) x where not (x = any(p_processed))),
    sent_count = sent_count + greatest(0, least(p_sent, cardinality(p_processed))),
    push_delivery_error = coalesce(p_error, push_delivery_error), push_claim_until = now() + interval '2 minutes'
    where id = p_id and status = 'sending' and push_claim_id = p_claim and push_claim_until > now();
  return found;
end $$;

create function public.push_release(p_id uuid, p_claim uuid, p_error text default null)
returns void language sql security definer set search_path = public as $$
  update notifications set
    status = case when cardinality(push_remaining) = 0 then case when push_delivery_error is null then 'sent' else 'failed' end
                  when push_attempts >= 5 then 'failed' else 'queued' end,
    error = case when cardinality(push_remaining) = 0 then push_delivery_error else coalesce(p_error, push_delivery_error) end,
    push_claim_id = null, push_claim_until = null,
    push_retry_after = now() + least(push_attempts * 30, 120) * interval '1 second'
    where id = p_id and push_claim_id = p_claim and status = 'sending'
$$;

revoke all on function public.push_claim(), public.push_progress(uuid, uuid, text[], int, text), public.push_release(uuid, uuid, text)
  from public, anon, authenticated;
grant execute on function public.push_claim(), public.push_progress(uuid, uuid, text[], int, text), public.push_release(uuid, uuid, text)
  to service_role;

create function app.retry_push() returns void
language plpgsql security definer set search_path = public as $$
declare url text := app.setting('functions_url');
begin
  if url is null or not exists (select 1 from notifications
    where (status = 'queued' and push_retry_after <= now())
       or (status = 'sending' and coalesce(push_claim_until, '-infinity') < now())) then return; end if;
  perform net.http_post(url := url || '/send-push', body := '{}'::jsonb, headers := '{"Content-Type": "application/json"}'::jsonb);
exception when others then raise warning 'push retry failed: %', sqlerrm;
end $$;
revoke all on function app.retry_push() from public, anon, authenticated;
grant execute on function app.retry_push() to service_role;
do $$ begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.schedule('retry-push', '* * * * *', 'select app.retry_push()');
  end if;
end $$;
