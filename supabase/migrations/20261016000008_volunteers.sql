-- Volunteer opportunities.
--
-- Volunteer Leaders (parents or staff the office chooses in the admin portal,
-- like car line duty) post opportunities: what, when, where, and optionally how
-- many volunteers are needed. Parents and staff "Say Yes!" to join until it's
-- full, and can remove themselves again, which tells the leader. Each
-- opportunity has a chat for its volunteers and leader (the app makes the
-- leader's messages stand out). Everyone who can volunteer sees who signed up.
-- A leader deletes an opportunity with a reason, which goes to every volunteer;
-- deleted opportunities are kept for the record. Students can't take part.

alter table public.profiles add column volunteer_lead boolean not null default false;

create function app.can_volunteer(u uuid default auth.uid()) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(app.school_role(u) in ('parent', 'teacher', 'staff', 'admin'), false)
$$;

create function app.is_volunteer_lead(u uuid default auth.uid()) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select volunteer_lead from profiles where id = u), false) and app.can_volunteer(u)
$$;

create table public.volunteer_opportunities (
  id            uuid primary key default gen_random_uuid(),
  lead_id       uuid not null references public.profiles (id) on delete cascade,
  title         text not null check (char_length(trim(title)) between 1 and 100),
  description   text not null default '' check (char_length(description) <= 2000),
  starts_on     date not null,
  ends_on       date,
  start_time    time,
  end_time      time,
  location      text check (char_length(location) <= 120),
  spots         int check (spots between 1 and 500),   -- null = no limit
  status        text not null default 'open' check (status in ('open', 'deleted')),
  delete_reason text,
  created_at    timestamptz not null default now(),
  check (ends_on is null or ends_on >= starts_on)
);
create index on public.volunteer_opportunities (status, starts_on);

create table public.volunteer_signups (
  opportunity_id uuid not null references public.volunteer_opportunities (id) on delete cascade,
  user_id        uuid not null references public.profiles (id) on delete cascade,
  created_at     timestamptz not null default now(),
  primary key (opportunity_id, user_id)
);

create table public.volunteer_messages (
  id             uuid primary key default gen_random_uuid(),
  opportunity_id uuid not null references public.volunteer_opportunities (id) on delete cascade,
  author_id      uuid references public.profiles (id) on delete set null,
  body           text not null check (char_length(trim(body)) between 1 and 1000),
  created_at     timestamptz not null default now()
);
create index on public.volunteer_messages (opportunity_id, created_at);

alter table public.volunteer_opportunities enable row level security;
alter table public.volunteer_signups enable row level security;
alter table public.volunteer_messages enable row level security;

/** The opportunity's leader, or someone who said yes. */
create function app.in_volunteer_chat(o uuid, u uuid default auth.uid()) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from volunteer_opportunities where id = o and lead_id = u)
      or exists (select 1 from volunteer_signups where opportunity_id = o and user_id = u)
$$;

create policy "open opportunities, or ones you're part of" on public.volunteer_opportunities for select to authenticated
  using (app.can_volunteer() and (status = 'open' or app.in_volunteer_chat(id)) or app.has_permission('groups.manage'));
create policy "everyone who can volunteer sees who signed up" on public.volunteer_signups for select to authenticated
  using (app.can_volunteer() or app.has_permission('groups.manage'));
create policy "chat: the volunteers and the leader" on public.volunteer_messages for select to authenticated
  using (app.in_volunteer_chat(opportunity_id) or app.has_permission('groups.manage'));

-- ======================================================================
-- API
-- ======================================================================

create function public.volunteer_post(
  p_title text, p_description text, p_starts_on date, p_ends_on date default null,
  p_start_time time default null, p_end_time time default null, p_location text default null, p_spots int default null
) returns public.volunteer_opportunities
language plpgsql security definer set search_path = public as $$
declare r volunteer_opportunities%rowtype;
begin
  if not app.is_volunteer_lead() then
    raise exception 'Only Volunteer Leaders can post opportunities.' using errcode = '42501';
  end if;
  insert into volunteer_opportunities (lead_id, title, description, starts_on, ends_on, start_time, end_time, location, spots)
  values (auth.uid(), trim(p_title), coalesce(trim(p_description), ''), p_starts_on, p_ends_on, p_start_time, p_end_time,
          nullif(trim(p_location), ''), p_spots)
  returning * into r;
  return r;
end $$;

/** Say Yes! (until it's full). The leader hears about it. */
create function public.volunteer_say_yes(p_opportunity uuid) returns void
language plpgsql security definer set search_path = public as $$
declare o volunteer_opportunities%rowtype; taken int;
begin
  if not app.can_volunteer() then raise exception 'Volunteering is for parents and staff.' using errcode = '42501'; end if;
  select * into o from volunteer_opportunities where id = p_opportunity for update;  -- one sign-up at a time, so spots hold
  if not found or o.status <> 'open' then raise exception 'This opportunity isn''t available anymore.'; end if;
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

/** A volunteer removes themselves; the leader is told. */
create function public.volunteer_withdraw(p_opportunity uuid) returns void
language plpgsql security definer set search_path = public as $$
declare o volunteer_opportunities%rowtype;
begin
  delete from volunteer_signups where opportunity_id = p_opportunity and user_id = auth.uid();
  if not found then raise exception 'You''re not signed up for this.'; end if;
  select * into o from volunteer_opportunities where id = p_opportunity;
  if o.status = 'open' then
    perform app.notify_user(o.lead_id, app.short_name(auth.uid()) || ' can''t make it',
      app.short_name(auth.uid()) || ' removed themselves from ' || o.title || '.', jsonb_build_object('opportunityId', o.id));
  end if;
end $$;

/** The leader (or an admin) deletes an opportunity; every volunteer gets the reason. */
create function public.volunteer_delete(p_opportunity uuid, p_reason text) returns void
language plpgsql security definer set search_path = public as $$
declare o volunteer_opportunities%rowtype; v record; why text := nullif(trim(p_reason), '');
begin
  select * into o from volunteer_opportunities where id = p_opportunity for update;
  if not found or o.status <> 'open' then raise exception 'This opportunity is already gone.'; end if;
  if o.lead_id <> auth.uid() and not app.has_permission('groups.manage') then
    raise exception 'Only the leader can delete this opportunity.' using errcode = '42501';
  end if;
  if why is null then raise exception 'Say why you''re deleting it; volunteers will see the reason.'; end if;
  update volunteer_opportunities set status = 'deleted', delete_reason = why where id = o.id;
  for v in select user_id from volunteer_signups where opportunity_id = o.id loop
    perform app.notify_user(v.user_id, 'Cancelled: ' || o.title,
      app.short_name(auth.uid()) || ' cancelled this volunteer opportunity: ' || why, jsonb_build_object('opportunityId', o.id));
  end loop;
  if o.lead_id <> auth.uid() then
    perform app.audit(null, 'volunteer.deleted', o.lead_id::text, jsonb_build_object('opportunity', o.id, 'title', o.title, 'reason', why));
  end if;
end $$;

/** Post in an opportunity's chat (its volunteers and leader). */
create function public.volunteer_send(p_opportunity uuid, p_body text) returns public.volunteer_messages
language plpgsql security definer set search_path = public as $$
declare r volunteer_messages%rowtype;
begin
  if not app.in_volunteer_chat(p_opportunity) then
    raise exception 'Say Yes! to join the conversation.' using errcode = '42501';
  end if;
  if not exists (select 1 from volunteer_opportunities where id = p_opportunity and status = 'open') then
    raise exception 'This opportunity was deleted.';
  end if;
  insert into volunteer_messages (opportunity_id, author_id, body) values (p_opportunity, auth.uid(), trim(p_body)) returning * into r;
  return r;
end $$;

/** Office staff (people.family) choose the Volunteer Leaders. */
create function public.admin_set_volunteer_lead(p_user uuid, p_on boolean) returns void
language plpgsql security definer set search_path = public as $$
begin
  perform app.require_permission('people.family');
  if p_on and not app.can_volunteer(p_user) then raise exception 'Volunteer Leaders must be parents or staff.'; end if;
  update profiles set volunteer_lead = p_on where id = p_user;
  if not found then raise exception 'No such person.'; end if;
  perform app.audit(null, case when p_on then 'volunteer.lead_on' else 'volunteer.lead_off' end, p_user::text);
end $$;

-- The admin portal's people list shows Volunteer Leaders too.
drop function public.admin_list_people();
create function public.admin_list_people() returns table (
  id uuid, first_name text, last_name text, school_role text, grade int, email text,
  admin_tier text, permissions text[], carline_duty boolean, volunteer_lead boolean, created_at timestamptz
)
language plpgsql stable security definer set search_path = public as $$
begin
  perform app.require_permission('people.view');
  return query
    select p.id, p.first_name, p.last_name, p.school_role, p.grade, pp.email, p.admin_tier, p.permissions,
           p.carline_duty, p.volunteer_lead, p.created_at
    from profiles p left join profile_private pp on pp.id = p.id
    order by p.school_role nulls first, p.last_name, p.first_name;
end $$;

-- ======================================================================
-- Privileges
-- ======================================================================

revoke all on function app.can_volunteer(uuid), app.is_volunteer_lead(uuid), app.in_volunteer_chat(uuid, uuid) from public, anon;
grant execute on function app.can_volunteer(uuid), app.is_volunteer_lead(uuid), app.in_volunteer_chat(uuid, uuid) to authenticated, service_role;
revoke all on function public.volunteer_post(text, text, date, date, time, time, text, int), public.volunteer_say_yes(uuid),
  public.volunteer_withdraw(uuid), public.volunteer_delete(uuid, text), public.volunteer_send(uuid, text),
  public.admin_set_volunteer_lead(uuid, boolean), public.admin_list_people() from public, anon;
grant execute on function public.volunteer_post(text, text, date, date, time, time, text, int), public.volunteer_say_yes(uuid),
  public.volunteer_withdraw(uuid), public.volunteer_delete(uuid, text), public.volunteer_send(uuid, text),
  public.admin_set_volunteer_lead(uuid, boolean), public.admin_list_people() to authenticated, service_role;

-- Reads go through RLS; writes only through the functions above.
revoke all on public.volunteer_opportunities, public.volunteer_signups, public.volunteer_messages from anon;
revoke insert, update, delete on public.volunteer_opportunities, public.volunteer_signups, public.volunteer_messages from authenticated;
grant select on public.volunteer_opportunities, public.volunteer_signups, public.volunteer_messages to authenticated;
grant all on public.volunteer_opportunities, public.volunteer_signups, public.volunteer_messages to service_role;

alter publication supabase_realtime add table public.volunteer_opportunities, public.volunteer_signups, public.volunteer_messages;
