-- Live updates for chat/feeds/calendars, and storage for post attachments.

alter publication supabase_realtime add table
  public.posts, public.comments, public.reactions, public.poll_votes, public.memberships, public.events;

-- Attachments live under "<group id>/<file>" in a private bucket.
insert into storage.buckets (id, name, public) values ('attachments', 'attachments', false)
on conflict (id) do nothing;

create function app.storage_group(object_name text) returns uuid
language plpgsql immutable as $$
begin
  return ((storage.foldername(object_name))[1])::uuid;
exception when others then
  return null;
end $$;
grant execute on function app.storage_group(text) to authenticated;

create policy "group members read attachments" on storage.objects for select to authenticated
  using (bucket_id = 'attachments' and app.can_view_content(app.storage_group(name)));
create policy "people allowed to attach files upload" on storage.objects for insert to authenticated
  with check (bucket_id = 'attachments'
              and coalesce((app.can(app.storage_group(name), 'attachFiles')->>'allowed')::boolean, false));
create policy "uploaders and moderators delete" on storage.objects for delete to authenticated
  using (bucket_id = 'attachments' and (owner = auth.uid() or app.is_moderator(app.storage_group(name))));
