# Instructions for AI coding agents

Read [DEVELOPING.md](DEVELOPING.md) for build/run/deploy steps and
[README.md](README.md) for the architecture. This file is the short list of
rules and traps.

## Workflow

- **Work on `main` and push to `main`.** No feature branches or PRs unless the
  owner asks. Each push builds the Android APK and redeploys the web app
  (https://royalrockinapps.github.io/khroyals/), and the Supabase workflow applies new
  migrations to the **live** database and redeploys the Edge Functions. So a pushed
  migration is live within minutes: don't apply them by hand, and never push one that
  isn't covered by `npm test`.
- Before every push: `npm run typecheck && npm test` must pass (CI runs both and
  blocks the APK otherwise).
- For UI changes, also check the web build renders: `npx expo export --platform web`.
- Keep commits focused; describe the user-visible change in the message.
- Open work and its owners are in [ROADMAP.md](ROADMAP.md). When a change finishes
  an item, delete its row in the same commit (and add a line to its "Already built"
  table if people will use it); add a row for work you leave unfinished.

## Stack

Expo SDK 57 / React Native 0.86 / expo-router (file routes in `app/`), TypeScript
strict. Backend is Supabase (Postgres + Auth + Realtime + Edge Functions).

- `src/api/connect.ts` — the only module screens use for Royals Connect,
  calendar, admin and auth. Falls back to `src/api/mockApi.ts` demo data when
  Supabase isn't configured.
- `src/site/` — renders the imported khroyals.com content (`content/site/`).
- `supabase/migrations/` — schema, row-level security and the RPC functions the
  app calls. **The database is the source of truth for permissions**;
  `app.can()` mirrors `src/comms/permissions.ts`. Change both together.
- `app/+native-intent.tsx` — handles email sign-in deep links (`khroyals://auth#…`).

## Rules and traps

- **Never commit secrets.** Only the Supabase URL and *publishable* key belong in
  the repo (`app.json → expo.extra`). Service-role keys, `sb_secret_…` keys and
  `sbp_…` access tokens go in environment variables. The repo is public.
- **Sign-in is passwordless**: email → 6-digit code (`sendEmailCode` /
  `verifyEmailCode`). Don't reintroduce passwords or demo logins in the app.
- **Demo accounts (`--demo` only) must never get admin powers.** Admin roles
  (`admin_roles`; director is built in) and permissions are only for real accounts.
  There may be several directors but never zero (trigger `app.keep_a_director`);
  `patguettler@gmail.com` is a director.
- **Deleting accounts** (`admin_delete_user`) needs `people.delete` (directors by default; they can
  give it to a role or person). It refuses yourself, directors and children (remove them as students),
  and admins unless the caller also has `admins.manage`. It deletes their posts (anonymous ones too) and
  comments so nothing is left looking anonymous, and logs `user.deleted` with their name and email.
- **Car line:** parents announce with their location (`carline_announce`; the server
  checks the radius — never add a check-in path without it). All staff see the board
  (`carline_board`) with pickup numbers (`pickup_numbers`: staff + the child's parents
  only). **Car line leads** (`carline_duty`) and people.family set the spot, radius,
  hours and "open now" (`carline_set_config`, `carline_open_now`).
- **Family accounts** (`school_role = 'family'`: grandparents, other relatives) are closed
  by default. They get car line pickup for the children the office links in
  `family_pickups` (never `guardians`), Volunteer, Activities (follow, no sign-ups) and the
  public screens. Groups refuse them (`app.effective_role`, the `no_family_in_groups`
  trigger, `app.rule_targets`), and so do Ask the School, the Marketplace, child details and
  family requests. Car line code reads `app.pickup_children()` / `app.can_pick_up()`, not
  `guardians` directly. A new feature stays closed to Family unless you open it on purpose.
- **Critical alerts** (`critical_alerts`, `critical_alert_responses`) are for teachers, staff
  and admins only (`app.is_staff()`); only `alerts.send` holders send them and give the all
  clear. Anything with `data.alertId` always pushes (`app.wants_push`), and `data.level` sets
  how loud the push is (`app.alert_level()`, the `critical_alerts` setting). Alert kinds are
  in both `src/alerts/kinds.ts` and the database checks. Keep the full-screen alert
  (`src/alerts/AlertTakeover.tsx`) mounted in `app/_layout.tsx`.
  On Android they ring on the `emergency` channel (`src/alerts/loudness.ts`: alarm volume, so
  silent mode doesn't mute it; Do Not Disturb access lets it through DND); `send-push/delivery.ts`
  names the same channel. Channel sound settings can't change once made: change the id instead.
- **Parents and pickup people:** a child has at most two parents, one mother and one
  father (`guardians.relation`, enforced by `app.check_parents`); links made before that
  may have no relation until the office sets it. Anyone else who picks up must have an
  account and is added by the child's parents or the office (`pickup_authorizations`,
  `add_pickup_person`, optionally for a date range); they get the car line for that child
  only, through `app.pickup_children()`, never `guardians`.
- **Student logins:** a child added by the office has no login (`profiles.managed`). Their parents
  (`app.is_guardian_of`, so never Family accounts) or `people.family` give them one by email: the
  `student-login` Edge Function runs `student_login_request` as the caller, then creates the auth
  user **with the child's profile id**, so every link to the child carries over; `app.handle_new_user`
  keeps that profile and emails the child how to sign in. `student_login_remove` takes it away again
  (the child stays, `managed` again). Never give a child a new profile id.
- **No duplicate children.** Two students can never share a normalized first + last name
  and birthday (`app.require_unique_child`, enforced by triggers). Creating a student
  (`admin_create_student`, or approving a parent's request) refuses a likely duplicate
  (`app.child_match_score` ≥ 6: names with typos/nicknames/hyphens, birthday, grade;
  a different first name counts against, so twins pass) unless the office confirms it's a
  different child (`p_force`). Parents never see other families' children; matches are
  shown to the office only (`admin_family_requests().matches`).
- **Car line pickup emails:** confirming a pickup queues an email to every parent of the
  child (`app.pickup_confirmed` → `app.email_queue`, sent a minute later by the
  `send-email` Edge Function through Resend; `carline_reopen` cancels it). The Resend key
  is the `RESEND_API_KEY` function secret, never in the repo; the sender is
  `app.settings.email_from`.
- **Students' apps** (Ask the Teacher, Assignments) use class sections (`rosters` with kind
  'section': a lead teacher and its students; Admin portal → Classes). In Ask the Teacher only the
  student and a teacher of one of their sections write (`teacher_send`, `app.teaches`); the student's
  parents and `messages.review` holders only read (`app.reads_teacher_thread`). Checking an assignment
  off (`assignment_done`) is private to the student. Parents see their children's class assignments
  (`child_assignments`, for the Planner tab), never the student's own entries or check-offs; Family
  accounts see none. Students' Main Page is the short list in
  `src/appTiles.ts` (`student: false` hides a tile from them).
- **Forms** (`forms`, `form_recipients`, `form_responses`; the Forms app): teachers send to the
  class sections they lead, coaches and directors to their activity seasons' registered students
  (`app.can_manage_sport`), and `forms.send` holders to grades or the whole school (`form_send`).
  Parents sign once per child (`form_sign`, `app.signs_form`: guardians only, never Family accounts);
  either parent's signature counts. A form can't be changed once sent; senders see signatures in
  `form_status` and remind or close it. Screens read `my_forms` / `sent_forms` / `form_status`.
  A form's fee (`forms.fee_cents`) is paid outside the app; senders record each child's payment
  (`form_record_payment`: amount, method, where it was handed in, date) and parents see their own.
  The methods are listed in both `src/schoolForms/payments.ts` and the database check.
- **Car line vehicles** (`vehicles`, `carline_pickups.vehicle`): the types and colors are
  listed in both `src/carline/vehicles.ts` and the database checks, so change them together.
  A pickup stores a snapshot of the vehicle, so editing or deleting one never rewrites the line.
- **Car line lead** isn't an admin power (no MFA), but it changes car line settings and pickup numbers. The seed gives it to the demo Teacher for testing; it must go
  with the demo accounts (`--demo` projects only) before real families use the app. The same goes for
  **Volunteer Leader**, which the seed also gives the demo Teacher.
- **Activities** (the Activities app; sports, theater, music, art, clubs) are stored in
  the `sports` tables, with `sports.category`. Categories and schedule kinds are listed
  in both `src/sports/categories.ts` and the database checks, so change them together.
  Coaching or directing an activity (`sport_coaches`, staff only) isn't an admin power;
  it lets them run that activity's seasons, schedule and sign-ups
  (`app.can_manage_sport`). Adding activities and their coaches needs `sports.manage`.
  Sign-ups only count once approved (`sport_registrations.status = 'registered'`).
  "Are you going?" answers (`sport_event_rsvps`, `sport_rsvp`) are only for registered
  participants, given by their parents (`app.my_students()`, so never Family accounts) or
  themselves; only the activity's leaders see attendance.
- **Dress-up days** (Spirit Week; `dress_days`): a theme for a school day, for everyone or a grade
  range. Everyone reads them (signed out too); `calendar.school` holders add, change and remove them
  (`dress_day_save` / `dress_day_delete`; the Calendar app → Dress-up days). The Planner's "What to
  wear" card shows the day's themes for the person's grade or children above the usual uniform
  (`dressFor` in `src/info/today.ts`).
- **Royal News** (`newsletters`; the newsletter made in Smore): everyone reads the archive (signed out
  too); `push.send` holders add an issue by pasting its Smore link (the `import-newsletter` Edge
  Function fetches only `app.smore.com/n/…` pages, parses them with `smore.ts` and saves through
  `newsletter_save` as the caller) or delete one. The parser drops Smore's tracking links (they can
  carry the reader's email); keep it that way.
- **Photo gallery** (`gallery_albums`, `gallery_photos`, private `gallery` bucket): every approved
  account sees it (Family and students too); any staff member starts albums and adds photos
  (`gallery_album_save`, `gallery_add_photos`; files go in their own `<uid>/` folder, a 1600 px JPEG
  plus a `_t.jpg` 400 px thumbnail made on the phone). The poster, the album's creator or
  `gallery.manage` remove; only `push.send` holders can notify everyone about an album. Apps → Photos,
  and Latest Photos on the Planner. Albums have a category (`gallery_categories`, kept by
  `gallery.manage`) and a visibility: `everyone` or `staff`; `app.sees_album` applies it to albums,
  photos **and** the storage files (thumbnails `_t.jpg` follow their photo). Search is by album name,
  description, category and photo captions.
- **Dates and times are picked, never typed.** Use `DateField` / `TimeField`
  (`src/forms/DateTimeField.tsx`): a calendar for dates, a time wheel for times, the
  browser's pickers on the web. Values are always `YYYY-MM-DD` and 24-hour `HH:MM`
  (`src/forms/dates.ts`). `tests/datetime.test.ts` fails on a typed date or time box.
- **Calendars hide the past.** Every list of dated events (the Calendar app, activity
  schedules, Volunteer) shows what's still to come; past events stay out of view behind
  `PastToggle` and look greyed out (`PAST_STYLE`) when shown. Track it with
  `usePastToggle()`: it starts collapsed and collapses again whenever the screen is
  left. Use `splitPast` with
  `isPastDay` / `isPastTime` from `src/calendar/past.ts`, which go by the school's date
  (Central time), not UTC.
- **Every notification must reach the bell page.** The school's are rows in
  `public.notifications` (`app.notify_user()` for one person). Ones the phone shows
  by itself must use `notifyLocal()` (`src/comms/localInbox.ts`), never
  `scheduleNotificationAsync` directly (`tests/inbox.test.ts` checks). Add tap
  targets to `notificationHref()` in `src/comms/inbox.ts`.
- **New tables need explicit grants.** Supabase no longer auto-grants new `public`
  tables to the Data API (from Oct 30, 2026), so the migration that creates a table must
  `grant select … to authenticated` (and `anon` if signed-out visitors read it) and
  `grant all … to service_role`; writes still go through functions. `tests/db.test.ts`
  fails on a table without them (private tables are listed there).
- **Don't edit an applied migration.** Add a new timestamped file. Regenerate
  `supabase/seed.sql` + `supabase/setup_all.sql` with `python3 scripts/gen_seed.py`.
- `tests/db.test.ts` runs every migration + the seed in PGlite with stubs
  (`supabase/tests/supabase_stubs.sql`). If you use a new Supabase feature
  (schema, extension, function), add a stub there.
- All writes go through `SECURITY DEFINER` functions that call `app.can()` /
  `app.require_permission()`; tables are read-only to clients (except `events`).
  Keep it that way — new write paths need a function + a DB test.
- **Reads ride out a dropped connection** (`src/api/retryFetch.ts`): table reads and the
  functions in `READ_ONLY_RPCS` are sent again when no answer came back; writes never
  are. Only list `STABLE` functions there (`tests/retry-fetch.test.ts` checks). Show
  failures with `errorText()` so a dropped connection reads as one.
- Admin powers only count in an authenticator-verified session (`aal2`).
  Tests simulate this with `as(user, true)`.
- **React is pinned to 19.2.3** to match `react-dom` for the web build. Use
  `npx expo install <pkg>` (not `npm install`) for anything native so versions
  match the Expo SDK.
- Native modules (expo-video, react-native-webview, expo-notifications) mean
  **Expo Go isn't enough**; test with `npx expo run:android`, `npx expo run:ios`
  or the CI APK.
- **The app entry is `index.js`**, not `expo-router/entry`: background tasks (the
  car line geofence) must be defined before expo-router starts. Keep new
  `TaskManager.defineTask` calls in modules it imports.
- **iOS 27 requires the UIScene life cycle.** `plugins/withSceneLifecycle.js`
  rewrites the template AppDelegate during prebuild; `ios/` is generated, so never
  edit it by hand. If an Expo upgrade makes the plugin throw, check whether the
  new template already uses `ExpoAppSceneDelegate` and drop the plugin if so.
- **Android Auto** = the car line only, in `modules/car-line` (Android-only local
  Expo module: CarLineCarService + a car pass in SharedPreferences). The Kotlin only
  compiles in the CI APK build, so check it after changes. Car passes may only ever
  reach `car_carline_status` / `car_carline_check_in`.
- **Every screen has a way back.** `app/_layout.tsx` sets `unstable_settings.initialRouteName
  = '(tabs)'`, so a screen opened straight from a link (khroyals://…, a web address, a
  notification that starts the app) still has the tabs underneath and a back button. Keep it.
- **Long reading screens** (Royal News issues, news articles, website pages) use `ReadingScroll`
  (`src/Reading.tsx`): a floating Top button once scrolled down and a Done button at the end, so
  nobody has to scroll back up to leave. Use it for any new screen people read top to bottom.
- **Light screens have a thin red edge line** (`src/ScreenEdge.tsx`): under the blue
  header, down the sides and along the bottom of the phone. Both navigators add it with
  `screenLayout={edgeLayout(…)}` and the tab bar draws its part (`tabBarBackground`), so
  new screens get it for free. A screen with a dark background goes in the root
  layout's `skip` list (like `video`).
- The web build is served under `/khroyals` (`expo.experiments.baseUrl`); use
  expo-router links, not hard-coded absolute paths.
- **CarPlay** (`modules/carplay`, `src/carplay`, `plugins/withCarPlay.js`): iPhone
  builds get the `com.apple.developer.carplay-driving-task` entitlement only with
  `CARPLAY_ENTITLEMENT=1`, once Apple has granted it (signing fails otherwise);
  simulator builds always have it. Driving task apps may only use simple CarPlay
  templates; keep the car screen to the list in `src/carplay/screen.ts`.
- Supabase free plan: built-in email sends only a few messages/hour and email
  templates can't be changed. Don't spam sign-in emails while testing — use the
  demo accounts.
- Node's built-in `fetch` ignores `HTTPS_PROXY`; in sandboxed/proxied
  environments run scripts with `NODE_USE_ENV_PROXY=1`.
- A CI failure at `npm ci` with `ECONNRESET` is a runner network blip — re-run once.
