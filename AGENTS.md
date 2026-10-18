# Instructions for AI coding agents

Read [DEVELOPING.md](DEVELOPING.md) for build/run/deploy steps and
[README.md](README.md) for the architecture. This file is the short list of
rules and traps.

## Workflow

- **Work on `main` and push to `main`.** No feature branches or PRs unless the
  owner asks. Each push builds the Android APK and redeploys the web app
  (https://bruhggalos.github.io/khroyals/).
- Before every push: `npm run typecheck && npm test` must pass (CI runs both and
  blocks the APK otherwise).
- For UI changes, also check the web build renders: `npx expo export --platform web`.
- Keep commits focused; describe the user-visible change in the message.

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
- **Car line:** parents announce with their location (`carline_announce`; the server
  checks the radius — never add a check-in path without it). All staff see the board
  (`carline_board`) with pickup numbers (`pickup_numbers`: staff + the child's parents
  only). **Car line leads** (`carline_duty`) and people.family set the spot, radius,
  hours and "open now" (`carline_set_config`, `carline_open_now`).
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
- **Every notification must reach the bell page.** The school's are rows in
  `public.notifications` (`app.notify_user()` for one person). Ones the phone shows
  by itself must use `notifyLocal()` (`src/comms/localInbox.ts`), never
  `scheduleNotificationAsync` directly (`tests/inbox.test.ts` checks). Add tap
  targets to `notificationHref()` in `src/comms/inbox.ts`.
- **Don't edit an applied migration.** Add a new timestamped file. Regenerate
  `supabase/seed.sql` + `supabase/setup_all.sql` with `python3 scripts/gen_seed.py`.
- `tests/db.test.ts` runs every migration + the seed in PGlite with stubs
  (`supabase/tests/supabase_stubs.sql`). If you use a new Supabase feature
  (schema, extension, function), add a stub there.
- All writes go through `SECURITY DEFINER` functions that call `app.can()` /
  `app.require_permission()`; tables are read-only to clients (except `events`).
  Keep it that way — new write paths need a function + a DB test.
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
