-- Photo albums for every grade and event, by school year.
--
-- Grade albums: a week before each school year's first day (the school calendar's "First Day of School";
-- August 1 until it's on the calendar), every grade K2–12th gets an album for that year ("3rd Grade 2026–27").
-- Only staff and that grade's families see it: the students in that grade that year and their parents (never
-- Family accounts), listed in gallery_album_members. They keep it after the year ends, until their account is
-- deleted or it's taken off: by them (gallery_album_leave) or the office (gallery.manage, gallery_album_set_member).
-- A student who joins the grade during the year, or a parent linked to one, gets it right away.
--
-- Event albums: whoever starts a Volunteer event or a school calendar event can make its album at the same time
-- (gallery_event_album). They're for everyone, like other albums.

insert into public.gallery_categories (name, icon, position) values ('Grades', '🎒', 0) on conflict (name) do nothing;

alter table public.gallery_albums
  add column grade int check (grade between -3 and 12),
  add column school_year int,   -- grade albums: the year the school year ends in (2027 = 2026–27)
  add column volunteer_event_id uuid references public.volunteer_events (id) on delete set null,
  add column calendar_event_id uuid references public.events (id) on delete set null,
  add constraint grade_albums_have_a_year check ((grade is null) = (school_year is null));
create unique index gallery_albums_grade_year on public.gallery_albums (grade, school_year) where grade is not null;
create unique index gallery_albums_volunteer_event on public.gallery_albums (volunteer_event_id) where volunteer_event_id is not null;
create unique index gallery_albums_calendar_event on public.gallery_albums (calendar_event_id) where calendar_event_id is not null;

create table public.gallery_album_members (
  album_id   uuid not null references public.gallery_albums (id) on delete cascade,
  user_id    uuid not null references public.profiles (id) on delete cascade,
  added_at   timestamptz not null default now(),
  removed_at timestamptz,   -- taken off (by them or the office); the automatic grants leave it off
  removed_by uuid references public.profiles (id) on delete set null,
  primary key (album_id, user_id)
);
create index on public.gallery_album_members (user_id);
alter table public.gallery_album_members enable row level security;
create policy "your own albums; the office sees all" on public.gallery_album_members for select to authenticated
  using (user_id = auth.uid() or app.has_permission('gallery.manage'));
revoke all on public.gallery_album_members from anon;
revoke insert, update, delete on public.gallery_album_members from authenticated;
grant select on public.gallery_album_members to authenticated;
grant all on public.gallery_album_members to service_role;

/** School years whose grade albums were made (so one the office removes isn't made again). */
create table app.grade_album_years (
  school_year int primary key,
  made_at     timestamptz not null default now()
);

-- ----------------------------------------------------------------------
-- Who sees an album
-- ----------------------------------------------------------------------

/**
 * Can this person see this album? Staff see every album. Everyone else approved (not Substitutes) sees albums
 * shown to everyone, except grade albums, which only the people on them see.
 */
create or replace function app.sees_album(a uuid, u uuid default auth.uid()) returns boolean
language sql stable security definer set search_path = public as $$
  select app.school_role(u) is not null and not app.is_substitute(u)
     and exists (select 1 from gallery_albums g where g.id = a and (app.is_staff(u) or (g.visibility = 'everyone' and (g.grade is null
       or exists (select 1 from gallery_album_members m where m.album_id = g.id and m.user_id = u and m.removed_at is null)))))
$$;

drop policy "everyone approved, or staff for staff-only albums" on public.gallery_albums;
create policy "albums you can see" on public.gallery_albums for select to authenticated using (app.sees_album(id));

-- ----------------------------------------------------------------------
-- Grade albums
-- ----------------------------------------------------------------------

/** The first day of the school year ending in `y`: the school calendar's "First Day of School", or August 1. */
create function app.first_day_of_school(y int default app.school_year_end()) returns date
language sql stable security definer set search_path = public as $$
  select coalesce((select min(starts_on) from events where group_id is null and title ilike 'first day of school%'
                   and starts_on between make_date(y - 1, 7, 1) and make_date(y, 6, 30)), make_date(y - 1, 8, 1))
$$;

/** "3rd Grade 2026–27", "Kindergarten 2026–27", "K4 2026–27". */
create function app.grade_album_title(g int, y int) returns text
language sql immutable as $$
  select case when g < 0 or g = 0 then app.grade_label(g) else app.grade_label(g) || ' Grade' end
         || ' ' || (y - 1) || '–' || right(y::text, 2)
$$;

/**
 * Put the students in a grade album's grade that school year, and their parents (not Family accounts), on it.
 * `p_student` narrows it to one student (and their parents). Never undoes a removal.
 */
create function app.grant_grade_album(p_album uuid, p_student uuid default null) returns int
language plpgsql security definer set search_path = public as $$
declare g gallery_albums%rowtype; n int;
begin
  select * into g from gallery_albums where id = p_album and grade is not null;
  if not found then return 0; end if;
  insert into gallery_album_members (album_id, user_id)
  select g.id, x.id from (
    select p.id from profiles p
    where p.school_role = 'student' and p.class_of = g.school_year + 12 - g.grade and (p_student is null or p.id = p_student)
    union
    select gd.guardian_id from guardians gd join profiles p on p.id = gd.student_id
    where p.school_role = 'student' and p.class_of = g.school_year + 12 - g.grade and (p_student is null or p.id = p_student)
      and not app.is_family(gd.guardian_id)
  ) x
  on conflict (album_id, user_id) do nothing;
  get diagnostics n = row_count;
  return n;
end $$;

/**
 * Make the grade albums (K2–12th) for a school year once it's a week from starting, each with its grade's students
 * and parents (run daily). Without `y`, this school year, once; with `y`, that year now (for the office or tests).
 * Albums already made get anyone new in their grade.
 */
create function app.make_grade_albums(y int default null) returns int
language plpgsql security definer set search_path = public as $$
declare yr int := coalesce(y, app.school_year_end()); cat uuid; g int; a uuid; n int := 0;
begin
  if y is null and app.school_today() < app.first_day_of_school(yr) - 7 then return 0; end if;
  if not exists (select 1 from app.grade_album_years where school_year = yr) then
    select id into cat from gallery_categories where name = 'Grades';
    for g in -3..12 loop
      a := null;
      insert into gallery_albums (title, description, taken_on, category_id, visibility, grade, school_year)
      values (app.grade_album_title(g, yr), 'Photos of ' || case when g <= 0 then app.grade_label(g) else 'the ' || app.grade_label(g) || ' grade' end
                || ' this school year, for its families and staff.', app.first_day_of_school(yr), cat, 'everyone', g, yr)
      on conflict (grade, school_year) where grade is not null do nothing
      returning id into a;
      if a is not null then n := n + 1; end if;
    end loop;
    insert into app.grade_album_years (school_year) values (yr);
  end if;
  perform app.grant_grade_album(id) from gallery_albums where school_year = yr and grade is not null;
  return n;
end $$;

/** During the school year, a student new to a grade (or a parent newly linked to one) gets that grade's album. */
create function app.grade_album_follow() returns trigger
language plpgsql security definer set search_path = public as $$
declare s uuid;
begin
  if tg_table_name = 'guardians' then s := new.student_id; else s := new.id; end if;
  perform app.grant_grade_album(a.id, s) from gallery_albums a
  where a.grade is not null and a.school_year = app.school_year_end()
    and a.school_year + 12 - a.grade = (select class_of from profiles where id = s);
  return new;
end $$;
create trigger grade_album_parent after insert on public.guardians
  for each row execute function app.grade_album_follow();
create trigger grade_album_student after insert or update of grade, class_of, school_role on public.profiles
  for each row execute function app.grade_album_follow();

/** Take a grade album off your own account. It doesn't come back by itself; the office can give it back. */
create function public.gallery_album_leave(p_album uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  update gallery_album_members set removed_at = now(), removed_by = auth.uid()
  where album_id = p_album and user_id = auth.uid() and removed_at is null;
  if not found then raise exception 'That album isn''t on your account.'; end if;
end $$;

/** gallery.manage: the people on a grade album, including anyone taken off (and whether they did it themselves). */
create function public.gallery_album_people(p_album uuid)
returns table (user_id uuid, name text, school_role text, removed boolean, removed_by_self boolean)
language plpgsql stable security definer set search_path = public as $$
begin
  perform app.require_permission('gallery.manage');
  return query
    select m.user_id, trim(p.first_name || ' ' || p.last_name), p.school_role, m.removed_at is not null, m.removed_by = m.user_id
    from gallery_album_members m join profiles p on p.id = m.user_id
    where m.album_id = p_album
    order by m.removed_at is not null, p.last_name, p.first_name;
end $$;

/** gallery.manage: take someone off a grade album, or put them on it (back). */
create function public.gallery_album_set_member(p_album uuid, p_user uuid, p_on boolean) returns void
language plpgsql security definer set search_path = public as $$
begin
  perform app.require_permission('gallery.manage');
  if not exists (select 1 from gallery_albums where id = p_album and grade is not null) then
    raise exception 'Only grade albums have a list of people.';
  end if;
  if p_on then
    if app.school_role(p_user) is null or app.is_substitute(p_user) then
      raise exception 'Only approved accounts (not substitutes) can have a grade album.';
    end if;
    insert into gallery_album_members (album_id, user_id) values (p_album, p_user)
    on conflict (album_id, user_id) do update set removed_at = null, removed_by = null, added_at = now();
  else
    update gallery_album_members set removed_at = now(), removed_by = auth.uid()
    where album_id = p_album and user_id = p_user and removed_at is null;
  end if;
  perform app.audit(null, case when p_on then 'gallery.member_added' else 'gallery.member_removed' end, p_album::text,
                    jsonb_build_object('user', p_user));
end $$;

-- ----------------------------------------------------------------------
-- Event albums
-- ----------------------------------------------------------------------

/**
 * An event's photo album: a Volunteer event (its leader, or staff) or an event on the school calendar (staff, or
 * calendar.school holders). Returns the album, made now or already there.
 */
create function public.gallery_event_album(p_volunteer_event uuid default null, p_calendar_event uuid default null) returns uuid
language plpgsql security definer set search_path = public as $$
declare v volunteer_events%rowtype; e events%rowtype; cat uuid; a uuid;
begin
  if (p_volunteer_event is null) = (p_calendar_event is null) then raise exception 'Choose one event.'; end if;
  select id into cat from gallery_categories where name = 'Events';
  if p_volunteer_event is not null then
    select * into v from volunteer_events where id = p_volunteer_event and status = 'open';
    if not found then raise exception 'That event is gone.'; end if;
    if not (v.lead_id = auth.uid() or app.is_staff()) then
      raise exception 'Only the event''s leader or staff can make its photo album.' using errcode = '42501';
    end if;
    insert into gallery_albums (title, description, taken_on, created_by, category_id, visibility, volunteer_event_id)
    values (left(v.title, 80), '', v.starts_on, auth.uid(), cat, 'everyone', v.id)
    on conflict (volunteer_event_id) where volunteer_event_id is not null do nothing;
    select id into a from gallery_albums where volunteer_event_id = v.id;
  else
    select * into e from events where id = p_calendar_event;
    if not found or e.group_id is not null then raise exception 'Photo albums are for events on the school calendar.'; end if;
    if not (app.is_staff() or app.can_edit_calendar(null)) then
      raise exception 'Only staff can make a calendar event''s photo album.' using errcode = '42501';
    end if;
    insert into gallery_albums (title, description, taken_on, created_by, category_id, visibility, calendar_event_id)
    values (left(e.title, 80), '', e.starts_on, auth.uid(), cat, 'everyone', e.id)
    on conflict (calendar_event_id) where calendar_event_id is not null do nothing;
    select id into a from gallery_albums where calendar_event_id = e.id;
  end if;
  return a;
end $$;

-- ----------------------------------------------------------------------
-- Telling people about new photos: a grade album's news goes to its people only
-- ----------------------------------------------------------------------

create or replace function public.gallery_album_save(
  p_id uuid, p_title text, p_description text, p_taken_on date, p_notify boolean default false,
  p_category uuid default null, p_visibility text default 'everyone'
) returns uuid
language plpgsql security definer set search_path = public as $$
declare new_id uuid; g int; u uuid;
begin
  if not app.is_staff() then raise exception 'Only staff post to the photo gallery.' using errcode = '42501'; end if;
  if coalesce(trim(p_title), '') = '' then raise exception 'Give the album a name, like "Fall Fest 2026".'; end if;
  if coalesce(p_visibility, '') not in ('everyone', 'staff') then raise exception 'Choose who sees the album.'; end if;
  if p_category is null or not exists (select 1 from gallery_categories where id = p_category) then
    raise exception 'Pick a category for the album.';
  end if;
  if p_id is null then
    insert into gallery_albums (title, description, taken_on, created_by, category_id, visibility)
    values (trim(p_title), coalesce(trim(p_description), ''), coalesce(p_taken_on, current_date), auth.uid(), p_category, p_visibility)
    returning id into new_id;
  else
    if not app.can_edit_album(p_id) then raise exception 'You can only change albums you started.' using errcode = '42501'; end if;
    update gallery_albums set title = trim(p_title), description = coalesce(trim(p_description), ''),
      taken_on = coalesce(p_taken_on, taken_on), category_id = p_category, visibility = p_visibility
    where id = p_id returning id, grade into new_id, g;
  end if;
  if p_notify then
    perform app.require_permission('push.send');
    if p_visibility <> 'everyone' then raise exception 'Show the album to everyone before letting everyone know.'; end if;
    if g is null then
      insert into notifications (audience, title, body, data, created_by)
      values ('everyone', '📸 New photos: ' || trim(p_title), 'See the album in the KH Royals photo gallery.',
              jsonb_build_object('albumId', new_id), auth.uid());
    else
      for u in select user_id from gallery_album_members where album_id = new_id and removed_at is null loop
        perform app.notify_user(u, '📸 New photos: ' || trim(p_title), 'See the album in the KH Royals photo gallery.',
                                jsonb_build_object('albumId', new_id));
      end loop;
    end if;
  end if;
  return new_id;
end $$;

-- ----------------------------------------------------------------------
-- Daily, and now for this school year
-- ----------------------------------------------------------------------

do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.schedule('grade-albums', '20 6 * * *', 'select app.make_grade_albums()');
  end if;
end $$;
select app.make_grade_albums();

revoke all on function app.first_day_of_school(int), app.grant_grade_album(uuid, uuid), app.make_grade_albums(int)
  from public, anon, authenticated;
grant execute on function app.first_day_of_school(int), app.grant_grade_album(uuid, uuid), app.make_grade_albums(int) to service_role;
revoke all on function public.gallery_album_leave(uuid), public.gallery_album_people(uuid), public.gallery_album_set_member(uuid, uuid, boolean),
  public.gallery_event_album(uuid, uuid) from public, anon;
grant execute on function public.gallery_album_leave(uuid), public.gallery_album_people(uuid), public.gallery_album_set_member(uuid, uuid, boolean),
  public.gallery_event_album(uuid, uuid) to authenticated, service_role;
