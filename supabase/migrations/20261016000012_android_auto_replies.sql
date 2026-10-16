-- Replies from Android Auto (and the phone's notification shade).
--
-- Android Auto reads group messages aloud and lets the driver answer by voice,
-- but only for notifications with a working Reply action that doesn't open the
-- app. The app's native code can't use the person's sign-in, so each group
-- push carries a reply pass: a random token, stored hashed, that lets that one
-- person reply in that one group for 24 hours, with all the usual permission
-- checks (app.can) applied as that person.
--   Chat groups: the reply is a new message.
--   Other groups: the reply is a comment on the post that was notified.

create table app.push_reply_tokens (
  token_hash text primary key,
  user_id    uuid not null references public.profiles (id) on delete cascade,
  group_id   uuid not null references public.groups (id) on delete cascade,
  post_id    uuid references public.posts (id) on delete cascade,
  expires_at timestamptz not null default now() + interval '24 hours'
);
create index on app.push_reply_tokens (expires_at);
revoke all on app.push_reply_tokens from public, anon, authenticated;

create function app.token_hash(t text) returns text
language sql immutable as $$ select encode(sha256(convert_to(t, 'UTF8')), 'hex') $$;

/** send-push (service role): a reply pass for each recipient of a group post notification. */
create function public.push_reply_tokens(p_notification uuid) returns table (user_id uuid, token text)
language plpgsql security definer set search_path = public as $$
declare n notifications%rowtype; u uuid; t text;
begin
  delete from app.push_reply_tokens where expires_at < now();
  select * into n from notifications where id = p_notification;
  if not found or n.audience <> 'group' or n.post_id is null then return; end if;
  for u in select distinct pt.user_id from app.push_targets(p_notification) pt loop
    t := replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', '');
    insert into app.push_reply_tokens (token_hash, user_id, group_id, post_id)
    values (app.token_hash(t), u, n.group_id, n.post_id);
    user_id := u; token := t;
    return next;
  end loop;
end $$;

/** Anyone holding a reply pass: reply as its owner, in its group only. */
create function public.reply_from_push(p_token text, p_text text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare r app.push_reply_tokens%rowtype; mode text; new_id uuid;
begin
  select * into r from app.push_reply_tokens where token_hash = app.token_hash(coalesce(p_token, '')) and expires_at > now();
  if not found then raise exception 'This reply link has expired. Open the app to reply.' using errcode = '42501'; end if;
  if coalesce(trim(p_text), '') = '' then raise exception 'Write something first.'; end if;
  if length(p_text) > 1000 then raise exception 'That reply is too long.'; end if;
  -- Act as the pass's owner for the rest of this call, so every normal check applies.
  perform set_config('request.jwt.claim.sub', r.user_id::text, true);
  perform set_config('request.jwt.claims', json_build_object('sub', r.user_id, 'role', 'authenticated', 'aal', 'aal1')::text, true);
  select settings->>'mode' into mode from groups where id = r.group_id;
  if mode = 'chat' or r.post_id is null then
    select (public.create_post(r.group_id, 'message', trim(p_text))).id into new_id;
    return jsonb_build_object('postId', new_id);
  end if;
  select (public.add_comment(r.post_id, trim(p_text))).id into new_id;
  return jsonb_build_object('commentId', new_id);
end $$;

-- The phone shows group messages as a conversation, so the push carries the
-- sender and group separately (title/body stay as before for other devices).
create or replace function app.notify_post() returns trigger
language plpgsql security definer set search_path = public as $$
declare g groups%rowtype; who text;
begin
  if new.status <> 'published' or (tg_op = 'UPDATE' and old.status = 'published') then return new; end if;
  select * into g from groups where id = new.group_id;
  select nullif(trim(first_name || ' ' || last_name), '') into who from profiles where id = new.author_id;
  insert into notifications (audience, group_id, post_id, title, body, data, urgent, created_by)
  values ('group', new.group_id, new.id,
          g.icon || ' ' || g.name,
          coalesce(who || ': ', '') || left(coalesce(nullif(new.title, ''), new.body), 160),
          jsonb_build_object('groupId', new.group_id, 'postId', new.id, 'groupName', g.name,
                             'sender', coalesce(who, 'Anonymous'),
                             'text', left(concat_ws(' — ', nullif(new.title, ''), nullif(new.body, '')), 400)),
          new.kind = 'announcement',
          new.author_id);
  return new;
end $$;

revoke all on function app.token_hash(text) from public, anon, authenticated;
revoke all on function public.push_reply_tokens(uuid) from public, anon, authenticated;
grant execute on function public.push_reply_tokens(uuid) to service_role;
revoke all on function public.reply_from_push(text, text) from public;
grant execute on function public.reply_from_push(text, text) to anon, authenticated, service_role;
