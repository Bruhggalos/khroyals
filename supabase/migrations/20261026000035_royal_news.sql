-- Royal News: the school's emailed newsletter (made in Smore), kept in the app as an archive.
-- Everyone reads it (signed out too). push.send holders add an issue by pasting its Smore link
-- (the import-newsletter Edge Function reads the page and calls newsletter_save) or remove one.
-- `blocks` is the issue's content: headings, text items and pictures
-- (supabase/functions/import-newsletter/smore.ts).

create table public.newsletters (
  id          uuid primary key default gen_random_uuid(),
  title       text not null check (length(trim(title)) between 1 and 120),
  sent_on     date not null,
  source_url  text not null unique check (source_url ~ '^https://app\.smore\.com/n/'),
  blocks      jsonb not null check (jsonb_typeof(blocks) = 'array'),
  created_by  uuid references public.profiles (id) on delete set null,
  created_at  timestamptz not null default now()
);
create index on public.newsletters (sent_on desc);

alter table public.newsletters enable row level security;
create policy "everyone reads Royal News" on public.newsletters for select to anon, authenticated using (true);

/** push.send: add an issue, or refresh one already added from the same link. Returns its id. */
create function public.newsletter_save(p_source_url text, p_title text, p_sent_on date, p_blocks jsonb) returns uuid
language plpgsql security definer set search_path = public as $$
declare new_id uuid;
begin
  perform app.require_permission('push.send');
  if p_source_url is null or p_source_url !~ '^https://app\.smore\.com/n/' then raise exception 'Use the issue''s Smore link.'; end if;
  if p_sent_on is null then raise exception 'The issue needs its date.'; end if;
  if p_blocks is null or jsonb_typeof(p_blocks) <> 'array' or jsonb_array_length(p_blocks) = 0 then
    raise exception 'That issue has nothing in it.';
  end if;
  if length(p_blocks::text) > 300000 then raise exception 'That issue is too long to add.'; end if;
  insert into newsletters (title, sent_on, source_url, blocks, created_by)
  values (coalesce(nullif(trim(p_title), ''), 'Royal News'), p_sent_on, p_source_url, p_blocks, auth.uid())
  on conflict (source_url) do update set title = excluded.title, sent_on = excluded.sent_on, blocks = excluded.blocks
  returning id into new_id;
  perform app.audit(null, 'newsletter.saved', new_id::text, jsonb_build_object('sentOn', p_sent_on, 'url', p_source_url));
  return new_id;
end $$;

/** push.send: remove an issue. */
create function public.newsletter_delete(p_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare gone date;
begin
  perform app.require_permission('push.send');
  delete from newsletters where id = p_id returning sent_on into gone;
  if gone is not null then perform app.audit(null, 'newsletter.deleted', p_id::text, jsonb_build_object('sentOn', gone)); end if;
end $$;

revoke all on function public.newsletter_save(text, text, date, jsonb), public.newsletter_delete(uuid) from public, anon;
grant execute on function public.newsletter_save(text, text, date, jsonb), public.newsletter_delete(uuid) to authenticated, service_role;

-- Reads go through row-level security; writes only through the functions above.
revoke insert, update, delete on public.newsletters from anon, authenticated;
grant select on public.newsletters to anon, authenticated;
grant all on public.newsletters to service_role;

-- The October 23, 2026 issue.
insert into public.newsletters (title, sent_on, source_url, blocks) values
  ('Royals News', '2026-10-23', 'https://app.smore.com/n/ms70g-royals-news', $news$[{"kind": "heading", "text": "Important Information"}, {"kind": "text", "title": "PE Uniform Store Open", "paragraphs": [[{"text": "The PE Uniform Store is open again. Please place your order by "}, {"text": "Sunday, October 23", "bold": true}, {"text": "."}], [{"text": "To order, visit "}, {"text": "www.khroyals.com ", "bold": true}, {"text": "and navigate to"}, {"text": " Student Life > PE Uniform Store.", "bold": true}]]}, {"kind": "text", "title": "KH Merch Store", "paragraphs": [[{"text": "Show your Royals spirit wherever you go! The KH Merch Store is the perfect place to find gear for students, parents, grandparents, and supporters. Whether you're cheering on our student athletes, attending school events, or representing Kingdom Heights around town, there's something for everyone."}], [{"text": "Visit the KH Merch Store here!", "href": "https://khroyals.printful.me/"}]]}, {"kind": "text", "title": "Save the Date: K-12 Parent Meeting", "paragraphs": [[{"text": "Parents are asked to attend one of our upcoming parent meetings on "}, {"text": "Thursday, November 5", "bold": true}, {"text": ". Two sessions will be offered to accommodate family schedules: "}, {"text": "Session 1:", "bold": true}, {"text": " 1:45 PM | "}, {"text": "Session 2:", "bold": true}, {"text": " 6:00 PM. Please plan to attend the session that works best for your family."}]]}, {"kind": "text", "title": "Save the Dates: Spirit Week", "paragraphs": [[{"text": "Spirit Week is October 26–30! We invite all students to join in the fun by participating in each day's themed dress-up activities as we celebrate school spirit together. The "}, {"text": "Book Fair", "bold": true}, {"text": " will also be on campus all week."}], [{"text": "The week will conclude with our annual Fall Fest on Friday, a favorite tradition filled with games, activities, and community celebration."}]]}, {"kind": "image", "src": "https://cdn.smore.com/u/41af/fd4379908e725054da77cef57f0a77d3.png"}, {"kind": "text", "title": "Fall Fest 🍂", "paragraphs": [[{"text": "Join us on "}, {"text": "Friday, October 30", "bold": true}, {"text": ", as we wrap up Spirit Week with our annual Fall Fest - a day of fall fun and fellowship for our Royals!"}], [{"text": "• K2-K4:", "bold": true}, {"text": " 9:00-10:30 AM"}], [{"text": "• Kindergarten-12th Grade:", "bold": true}, {"text": " 12:00-2:30 PM"}], [{"text": "Students will enjoy bounce houses, face painting, games, and more! "}, {"text": "Kona Ice", "bold": true, "href": "https://www.khroyals.com/s/07_Toms_Kingdom-Heights-Harvest-Fest_10-30.pdf"}, {"text": " and "}, {"text": "Tom's Coffee Truck", "bold": true, "href": "https://www.khroyals.com/s/07_Toms_Kingdom-Heights-Harvest-Fest_10-30.pdf"}, {"text": " will also be on campus with items available for purchase for"}, {"text": " K-12th grade", "bold": true}, {"text": "."}], [{"text": "If you'd like to be part of making this event a success, we invite you to sign up to volunteer. You're also welcome to share the signup link with family and friends who may be interested in supporting Fall Fest through a donation. Thank you for helping us make this a special day for our school community!"}], [{"text": "Sign up here.", "href": "https://my.cheddarup.com/c/fall-festival-volunteers-91147/forms"}]]}, {"kind": "text", "title": "Dunk Tank for D.C. 💦", "paragraphs": [[{"text": "We're looking for enthusiastic volunteers to take a turn in the dunk tank during Fall Fest to help raise funds for our 8th grade Washington, D.C., field trip!"}], [{"text": "Whether you're a "}, {"text": "dad, grandparent, mom, pastor, teacher, dean, or another member of our school community", "bold": true}, {"text": ", we'd love to have you participate. Volunteer time slots are just "}, {"text": "15 minutes", "bold": true}, {"text": " long, and you're welcome to sign up for as many as you'd like."}], [{"text": "Students will have the chance to test their aim for "}, {"text": "$2 for 3 throws", "bold": true}, {"text": ", with all proceeds benefiting the Washington, D.C., field trip fund. "}, {"text": "Sign up here!", "bold": true, "href": "https://my.cheddarup.com/c/concession-stand-volunteer-sign-up-form-85996/forms"}]]}, {"kind": "image", "src": "https://cdn.smore.com/u/6c1d/9fea8d7f94ffe455d885e074ca3cdb46.jpeg"}, {"kind": "text", "title": "Rocktober Family Night", "paragraphs": [[{"text": "The Rock Family Worship Center is hosting a "}, {"text": "Family Night", "bold": true}, {"text": " on "}, {"text": "Sunday, October 25, from 4:00–7:00 PM", "bold": true}, {"text": ". Tickets are "}, {"text": "$5 per person", "bold": true}, {"text": "."}], [{"text": "Bring the whole family for an evening of food trucks, a petting zoo, pumpkin decorating, and fellowship with our community. "}, {"text": "Register here!", "bold": true, "href": "https://therockfamily.churchcenter.com/registrations/events/3936053"}]]}]$news$::jsonb);
