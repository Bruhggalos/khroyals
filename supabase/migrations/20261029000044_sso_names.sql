-- Google and Apple sign-in: name new accounts from what the provider sends.
--
-- Signing up with an email code sends first_name/last_name; Google sends full_name (and name),
-- and Apple's token carries no name (the app saves the one Apple shows it, src/api/auth.ts).
-- An existing account that signs in with Google or Apple under the same email is linked by
-- Supabase, so this only runs for brand-new people, who still wait for the office to approve them.
-- Same function as in migration 36, with the name fallbacks.

create or replace function app.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  kid profiles%rowtype;
  meta jsonb := coalesce(new.raw_user_meta_data, '{}'::jsonb);
  whole text := trim(coalesce(nullif(trim(meta->>'full_name'), ''), meta->>'name', ''));
  first text := coalesce(nullif(trim(meta->>'first_name'), ''), nullif(trim(meta->>'given_name'), ''), split_part(whole, ' ', 1));
  last text := coalesce(nullif(trim(meta->>'last_name'), ''), nullif(trim(meta->>'family_name'), ''),
                        trim(substr(whole, length(split_part(whole, ' ', 1)) + 1)));
begin
  select * into kid from profiles where id = new.id;
  if found then
    update profiles set managed = false where id = new.id;
    insert into profile_private (id, email) values (new.id, new.email) on conflict (id) do update set email = excluded.email;
    insert into app.email_queue (to_email, subject, body) values (new.email,
      'Your KH Royals login is ready',
      concat_ws(E'\n\n',
        'Hi ' || trim(kid.first_name) || ',',
        'Your family set up Royals Connect for you: Kingdom Heights'' school app, with your classes, assignments, activities and school news.',
        'To sign in, open the KH Royals app (or https://royalrockinapps.github.io/khroyals/), tap Log in, and enter this email address: '
          || new.email || '. We''ll email you a 6-digit code. There''s no password to remember.',
        'Kingdom Heights Preparatory School'));
    return new;
  end if;
  insert into profiles (id, first_name, last_name) values (new.id, coalesce(first, ''), coalesce(last, ''));
  insert into profile_private (id, email) values (new.id, new.email);
  return new;
end $$;
