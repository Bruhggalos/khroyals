-- Post stats and notification subscriptions.
--
-- Stats: the app records who has seen each post (once per person, with a
-- repeat count) and who opened each notification. Authors, group moderators
-- and admins who manage groups see a post's stats: views, how many of the
-- group that is, reactions, replies, poll votes, followers and who has seen
-- it. Notification senders see how many people opened a notification.
--
-- Subscriptions: people follow a post to hear about replies (authors and
-- repliers follow automatically; anyone can follow or unfollow), and choose in
-- My profile whether school announcements, group posts and replies reach their
-- phone. Admins can mark a school notification urgent so it reaches everyone.

-- ======================================================================
-- Views and opens
-- ======================================================================

create table public.post_views (
  post_id       uuid not null references public.posts (id) on delete cascade,
  user_id       uuid not null references public.profiles (id) on delete cascade,
  first_seen_at timestamptz not null default now(),
  last_seen_at  timestamptz not null default now(),
  times         int not null default 1,
  primary key (post_id, user_id)
);
alter table public.post_views enable row level security;   -- read only through post_stats()
revoke all on public.post_views from anon, authenticated;

/** The app saw these posts on screen. Repeat views count again after 30 minutes. */
create function public.record_post_views(p_posts uuid[]) returns void
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null or app.school_role() is null then return; end if;
  insert into post_views (post_id, user_id)
    select distinct x, auth.uid() from unnest(p_posts[1:200]) x
    join posts p on p.id = x
    where p.status = 'published' and p.author_id is distinct from auth.uid() and app.can_read_post(x)
  on conflict (post_id, user_id) do update set last_seen_at = now(), times = post_views.times + 1
    where post_views.last_seen_at < now() - interval '30 minutes';
end $$;

create table public.notification_opens (
  notification_id uuid not null references public.notifications (id) on delete cascade,
  user_id         uuid not null references public.profiles (id) on delete cascade,
  opened_at       timestamptz not null default now(),
  primary key (notification_id, user_id)
);
alter table public.notification_opens enable row level security;
create policy "own opens" on public.notification_opens for select to authenticated using (user_id = auth.uid());
grant select on public.notification_opens to authenticated;
revoke insert, update, delete on public.notification_opens from anon, authenticated;

/** Notifications the person opened (tapped, or saw in their inbox). */
create function public.mark_notifications_opened(p_ids uuid[]) returns void
language sql security definer set search_path = public as $$
  insert into notification_opens (notification_id, user_id)
    select n.id, auth.uid() from notifications n
    where n.id = any (p_ids[1:200]) and auth.uid() is not null and app.notification_for(n, auth.uid())
  on conflict do nothing
$$;

/** Senders (and push.send admins): how many people opened each notification. */
create function public.notification_open_counts(p_ids uuid[]) returns table (id uuid, opened bigint)
language sql stable security definer set search_path = public as $$
  select n.id, (select count(*) from notification_opens o where o.notification_id = n.id)
  from notifications n
  where n.id = any (p_ids) and (n.created_by = auth.uid() or app.has_permission('push.send'))
$$;

-- ======================================================================
-- Following posts, and reply notifications
-- ======================================================================

create table public.post_follows (
  post_id   uuid not null references public.posts (id) on delete cascade,
  user_id   uuid not null references public.profiles (id) on delete cascade,
  following boolean not null default true,   -- false = they unfollowed (stays off)
  primary key (post_id, user_id)
);
alter table public.post_follows enable row level security;
create policy "own follows" on public.post_follows for select to authenticated using (user_id = auth.uid());
grant select on public.post_follows to authenticated;
revoke insert, update, delete on public.post_follows from anon, authenticated;

create function app.auto_follow(p uuid, u uuid) returns void
language sql security definer set search_path = public as $$
  insert into post_follows (post_id, user_id) select p, u where u is not null on conflict do nothing
$$;

create function app.follow_own_post() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  perform app.auto_follow(new.post_id, new.author_id);   -- anonymous_authors rows
  return new;
end $$;
create function app.follow_new_post() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  perform app.auto_follow(new.id, new.author_id);
  return new;
end $$;
create trigger follow_new_post after insert on public.posts for each row execute function app.follow_new_post();
create trigger follow_own_post after insert on app.anonymous_authors for each row execute function app.follow_own_post();

/** Follow or unfollow replies on a post you can read. */
create function public.set_post_follow(p_post uuid, p_follow boolean) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not coalesce(app.can_read_post(p_post), false) then raise exception 'Post not found.'; end if;
  insert into post_follows (post_id, user_id, following) values (p_post, auth.uid(), p_follow)
  on conflict (post_id, user_id) do update set following = excluded.following;
end $$;

/** A published reply notifies the post's followers (not the replier); replying follows the post. */
create function app.notify_reply() returns trigger
language plpgsql security definer set search_path = public as $$
declare po posts%rowtype; g groups%rowtype; who text;
begin
  if new.status <> 'published' or (tg_op = 'UPDATE' and old.status = 'published') then return new; end if;
  select * into po from posts where id = new.post_id;
  select * into g from groups where id = po.group_id;
  select nullif(trim(first_name || ' ' || last_name), '') into who from profiles where id = new.author_id;
  insert into notifications (audience, user_id, group_id, post_id, title, body, data, urgent, created_by)
    select 'user', f.user_id, po.group_id, po.id,
           '💬 ' || coalesce(who, 'Someone') || ' replied',
           left(coalesce(nullif(po.title, ''), g.name) || ': ' || new.body, 200),
           jsonb_build_object('groupId', po.group_id, 'postId', po.id, 'commentId', new.id, 'reply', true),
           false, new.author_id
    from post_follows f
    where f.post_id = po.id and f.following and f.user_id is distinct from new.author_id
      and app.can_read_post(po.id, f.user_id);
  perform app.auto_follow(po.id, new.author_id);
  return new;
end $$;
create trigger notify_reply after insert or update of status on public.comments
  for each row execute function app.notify_reply();

-- ======================================================================
-- My profile: more push choices; urgent school notifications
-- ======================================================================

alter table public.user_settings
  add column push_school  boolean not null default true,   -- school-wide notifications that aren't urgent
  add column push_replies boolean not null default true;   -- replies on posts you follow

drop function public.update_my_settings(boolean, boolean, boolean, time, time);
create function public.update_my_settings(
  p_push_groups boolean, p_push_marketplace boolean, p_push_volunteer boolean,
  p_quiet_start time default null, p_quiet_end time default null,
  p_push_school boolean default true, p_push_replies boolean default true
) returns public.user_settings
language plpgsql security definer set search_path = public as $$
declare row user_settings%rowtype;
begin
  if auth.uid() is null then raise exception 'Sign in first.' using errcode = '42501'; end if;
  if (p_quiet_start is null) <> (p_quiet_end is null) then raise exception 'Set both quiet-hours times, or neither.'; end if;
  insert into user_settings (user_id, push_groups, push_marketplace, push_volunteer, quiet_start, quiet_end, push_school, push_replies)
  values (auth.uid(), p_push_groups, p_push_marketplace, p_push_volunteer, p_quiet_start, p_quiet_end, p_push_school, p_push_replies)
  on conflict (user_id) do update set push_groups = excluded.push_groups, push_marketplace = excluded.push_marketplace,
    push_volunteer = excluded.push_volunteer, quiet_start = excluded.quiet_start, quiet_end = excluded.quiet_end,
    push_school = excluded.push_school, push_replies = excluded.push_replies, updated_at = now()
  returning * into row;
  return row;
end $$;

/** Urgent school notifications always push; everything else follows the person's choices. */
create or replace function app.wants_push(n public.notifications, u uuid, at timestamptz default now()) returns boolean
language plpgsql stable security definer set search_path = public as $$
declare st user_settings%rowtype; t time;
begin
  if n.audience in ('everyone', 'roles') and n.urgent then return true; end if;
  select * into st from user_settings where user_id = u;
  if not found then return true; end if;
  if n.audience in ('everyone', 'roles') and not st.push_school then return false; end if;
  if n.data ? 'reply' then
    if not st.push_replies then return false; end if;
  elsif n.audience = 'group' and not st.push_groups then return false;
  end if;
  if n.data ? 'listingId' and not st.push_marketplace then return false; end if;
  if n.data ? 'opportunityId' and not st.push_volunteer then return false; end if;
  if st.quiet_start is not null then
    t := (at at time zone 'America/Chicago')::time;
    if (st.quiet_start <= st.quiet_end and t >= st.quiet_start and t < st.quiet_end)
       or (st.quiet_start > st.quiet_end and (t >= st.quiet_start or t < st.quiet_end)) then
      return false;
    end if;
  end if;
  return true;
end $$;

drop function public.send_notification(text, text, text, uuid, text[]);
/** Admins (push.send) or a group's moderators send a notification; urgent ones ignore people's settings. */
create function public.send_notification(
  p_title text, p_body text, p_audience text, p_group uuid default null, p_roles text[] default null,
  p_urgent boolean default false
) returns public.notifications
language plpgsql security definer set search_path = public as $$
declare row notifications%rowtype;
begin
  if coalesce(trim(p_title), '') = '' or coalesce(trim(p_body), '') = '' then raise exception 'Add a title and a message.'; end if;
  if not (app.has_permission('push.send') or (p_audience = 'group' and app.is_moderator(p_group))) then
    perform app.require_permission('push.send');
  end if;
  insert into notifications (audience, group_id, roles, title, body, data, urgent, created_by)
  values (p_audience, p_group, p_roles, trim(p_title), trim(p_body),
          case when p_group is null then '{}'::jsonb else jsonb_build_object('groupId', p_group) end,
          coalesce(p_urgent, false) or p_audience = 'group', auth.uid())
  returning * into row;
  perform app.audit(p_group, 'notification.sent', row.id::text,
                    jsonb_build_object('audience', p_audience, 'roles', p_roles, 'title', p_title, 'urgent', p_urgent));
  return row;
end $$;

-- ======================================================================
-- Stats
-- ======================================================================

/** May this person see a post's stats? Its author, the group's moderators (incl. admins who manage groups). */
create function app.can_see_post_stats(p uuid, u uuid default auth.uid()) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select po.author_id = u or app.is_moderator(po.group_id, u)
                     or exists (select 1 from app.anonymous_authors a where a.post_id = po.id and a.author_id = u)
                   from posts po where po.id = p), false)
$$;

/** One post's stats, for its author and the group's moderators. */
create function public.post_stats(p_post uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare po posts%rowtype; member_count int;
begin
  if not app.can_see_post_stats(p_post) then
    raise exception 'Only the author and the group''s moderators can see these stats.' using errcode = '42501';
  end if;
  select * into po from posts where id = p_post;
  select count(*) into member_count from memberships m
    where m.group_id = po.group_id and m.user_id is distinct from po.author_id and app.can_view_content(po.group_id, m.user_id);
  return jsonb_build_object(
    'postId', po.id, 'groupId', po.group_id, 'title', coalesce(nullif(po.title, ''), left(po.body, 80)),
    'createdAt', po.created_at,
    'audience', member_count,
    'viewers', (select count(*) from post_views where post_id = po.id),
    'views', (select coalesce(sum(times), 0) from post_views where post_id = po.id),
    'reactions', coalesce((select jsonb_object_agg(emoji, n) from (
                   select emoji, count(*) n from reactions where post_id = po.id group by emoji) r), '{}'::jsonb),
    'replies', (select count(*) from comments where post_id = po.id and status = 'published'),
    'repliers', (select count(distinct author_id) from comments where post_id = po.id and status = 'published'),
    'pollVotes', (select count(*) from poll_votes where post_id = po.id),
    'score', po.score,
    'followers', (select count(*) from post_follows where post_id = po.id and following),
    'notificationOpens', (select count(*) from notification_opens o join notifications n on n.id = o.notification_id
                          where n.post_id = po.id and n.audience = 'group'),
    'pushDevices', (select coalesce(sum(sent_count), 0) from notifications where post_id = po.id and audience = 'group'),
    'byDay', coalesce((select jsonb_agg(jsonb_build_object('day', d, 'viewers', n) order by d) from (
                 select (first_seen_at at time zone 'America/Chicago')::date d, count(*) n
                 from post_views where post_id = po.id group by 1) x), '[]'::jsonb),
    'seenBy', coalesce((select jsonb_agg(jsonb_build_object('name', trim(p.first_name || ' ' || p.last_name),
                                                           'role', p.school_role, 'at', v.first_seen_at)
                                         order by v.first_seen_at desc)
                        from (select * from post_views where post_id = po.id order by first_seen_at desc limit 200) v
                        join profiles p on p.id = v.user_id), '[]'::jsonb)
  );
end $$;

/** A group's recent posts with their numbers, for the group's moderators. */
create function public.group_post_stats(p_group uuid, p_limit int default 50) returns table (
  post_id uuid, title text, kind text, created_at timestamptz, author text,
  viewers bigint, audience bigint, reactions bigint, replies bigint
)
language plpgsql stable security definer set search_path = public as $$
declare members bigint;
begin
  if not app.is_moderator(p_group) then
    raise exception 'Only the group''s moderators can see its stats.' using errcode = '42501';
  end if;
  select count(*) into members from memberships m where m.group_id = p_group and app.can_view_content(p_group, m.user_id);
  return query
    select po.id, coalesce(nullif(po.title, ''), left(po.body, 80)), po.kind, po.created_at,
           coalesce(nullif(trim(pr.first_name || ' ' || pr.last_name), ''), 'Anonymous'),
           (select count(*) from post_views v where v.post_id = po.id),
           greatest(members - case when po.author_id is null then 0 else 1 end, 0),
           (select count(*) from reactions r where r.post_id = po.id),
           (select count(*) from comments c where c.post_id = po.id and c.status = 'published')
    from posts po left join profiles pr on pr.id = po.author_id
    where po.group_id = p_group and po.status = 'published'
    order by po.created_at desc
    limit least(greatest(coalesce(p_limit, 50), 1), 200);
end $$;

-- ======================================================================
-- Privileges
-- ======================================================================

revoke all on function app.auto_follow(uuid, uuid), app.can_see_post_stats(uuid, uuid) from public, anon, authenticated;
revoke all on function public.record_post_views(uuid[]), public.mark_notifications_opened(uuid[]),
  public.notification_open_counts(uuid[]), public.set_post_follow(uuid, boolean),
  public.update_my_settings(boolean, boolean, boolean, time, time, boolean, boolean),
  public.send_notification(text, text, text, uuid, text[], boolean),
  public.post_stats(uuid), public.group_post_stats(uuid, int) from public, anon;
grant execute on function public.record_post_views(uuid[]), public.mark_notifications_opened(uuid[]),
  public.notification_open_counts(uuid[]), public.set_post_follow(uuid, boolean),
  public.update_my_settings(boolean, boolean, boolean, time, time, boolean, boolean),
  public.send_notification(text, text, text, uuid, text[], boolean),
  public.post_stats(uuid), public.group_post_stats(uuid, int) to authenticated, service_role;
grant all on public.post_views, public.notification_opens, public.post_follows to service_role;
