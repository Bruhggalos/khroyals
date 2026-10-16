# KH Royals — cross-platform app

One Expo / React Native codebase that ships to **iOS, Android and web** for
**Kingdom Heights Preparatory School** (Huntsville, AL). The site content —
every page, news post, video and the school calendar — is imported from the
real [khroyals.com](https://www.khroyals.com/).

> **Building it or putting it on a phone?** See [DEVELOPING.md](DEVELOPING.md).
> AI coding agents: read [AGENTS.md](AGENTS.md).

## Run it

```bash
npm install
npx expo start          # press i for iOS simulator, a for Android, w for web
npm test                # permission engine tests
npm run typecheck
```

Video playback uses native modules (`expo-video`, `react-native-webview`), so use a
development build or the APK below rather than Expo Go to see the videos.

## Site content (real, from khroyals.com)

```bash
pip install beautifulsoup4
npm run import-site     # re-scrape khroyals.com into content/site/
```

`scripts/import_site.py` reads the sitemap, every page and the news collection
(Squarespace `?format=json`) and writes:

```
content/site/
  site.json        school info, colours, the site menu, footer, social links
  home.json        the home page
  pages/*.json     all 23 menu/footer pages (admissions, academies, our story, …)
  pages.ts         generated import map of those pages
  news.json        all 55 news posts with full bodies
  calendar.json    2026–27 important dates (from the official calendar PDF)
```

Each page is a list of sections → blocks (heading, paragraph, button, image,
gallery, cards, accordion, video, …) rendered natively by `src/site/Blocks.tsx`.
Links keep the site's URLs; `src/site/links.ts` opens site pages and news in-app,
videos in the in-app player, and PDFs/portals/forms in the browser.

**Videos** are the site's own:

| Where | Source | Played with |
|---|---|---|
| Home hero background, Our Story, Admissions, academy pages, Giving, Butler campus | Squarespace-hosted (HLS) | `expo-video` |
| "What parents are saying" testimonials, "Our Story" vision film | Vimeo | WebView / iframe |
| Hillsdale curriculum, CHOOSE Act, motto section | YouTube | WebView / iframe |

The tuition calculator is an interactive widget on the website, so the app links
to it. The calendar's dates are transcribed in the importer from the official PDF.

## Layout

```
content/site/    real site content (see above)
mock-db/comms/   Royals Connect demo data (npm run regen-comms); seeds Supabase
supabase/        migrations, seed, local test stubs
scripts/         import_site.py (website), gen_comms.py (Connect demo)
plugins/         Expo config plugins (withSceneLifecycle: iOS 27 UIScene life cycle)
src/api/mockApi.ts    the ONLY module screens call; swap bodies for fetch() later
src/site/             block renderer, link routing, video players
src/comms/            types, presets, permission engine, roster auto-assignment, settings UI
app/                  expo-router screens (tabs: Home · News · Calendar · Connect · More)
tests/                permission engine tests
```

## Backend (Supabase)

Royals Connect, group calendars and the admin console run on Supabase when
`app.json → expo.extra.supabaseUrl/supabaseKey` are set (otherwise the app uses
the bundled demo data). The publishable key ships in the app; **the database
enforces every rule**:

- `supabase/migrations/` — tables (profiles, rosters, groups, memberships, posts,
  replies, reactions, votes, polls, audit log, events), row-level security, and
  the API functions the app calls. `app.can()` is a port of
  `src/comms/permissions.ts` (locks, quiet hours in Central time, mutes, slow
  mode, approval queues), and roster rules keep group membership in sync
  (`app.sync_rule_memberships`, triggered by roster/guardian/profile changes).
- Writes only go through the functions (`create_post`, `add_comment`,
  `moderate_post`, `create_group`, `update_group_settings`, `set_membership`,
  `admin_update_profile`, `admin_link_guardian`, …); direct table writes are
  refused, except calendar events, which have their own policies.
- Realtime is on for posts, replies, reactions, poll votes, memberships and events.
  A private `attachments` storage bucket is ready (`<group id>/<file>`); the app
  doesn't upload yet.
- New sign-ups wait for an admin to approve them in **Connect → Admin console**.

```bash
npm test                         # includes tests/db.test.ts: migrations + seed + RLS in PGlite
python3 scripts/gen_seed.py      # rebuild supabase/seed.sql and supabase/setup_all.sql
# apply to a project (needs a personal access token for schema changes):
SUPABASE_URL=… SUPABASE_SERVICE_ROLE_KEY=… SUPABASE_ACCESS_TOKEN=… DEMO_PASSWORD=… \
  NODE_USE_ENV_PROXY=1 node scripts/supabase_setup.mjs
SUPABASE_URL=… SUPABASE_PUBLISHABLE_KEY=… DEMO_PASSWORD=… node scripts/smoke_supabase.mjs
```

Without an access token, paste `supabase/setup_all.sql` into the dashboard's SQL editor.

**Sign-up & sign-in.** People create an account with name, email and password
(an admin approves it), sign in with email + password, reset a forgotten password
by email, or sign in with an emailed link instead. Emailed links open the app
(`khroyals://auth`) or the web portal (`/auth`). Supabase's built-in email sends only
2 emails/hour, so sign-up skips the confirmation email for now (see DEVELOPING.md).

**Admins.** Admin tiers: one **Director** (all powers; only one who manages
admins; can hand the role on), **Administrators** (everything but managing admins)
and **Office** (approvals, families, school calendar, notifications, activity log);
the director can also grant single permissions to anyone. Admin tools need a code
from an authenticator app (free TOTP, enforced in the database; switch with
`app.settings.require_admin_mfa`). The admin portal is the app's **Admin portal**
screen: same on web (`npx expo export --platform web`, host the `dist/` folder),
Android and iPhone.

**Push notifications** go through Expo's free push service: new posts notify group
members (per-group preferences), and the portal sends to everyone, a role, or a
group. `supabase/functions/send-push` delivers them (deployed by the setup script).
Devices register after sign-in once the build has an Expo project id
(`eas init` → `extra.eas.projectId`) and, on Android, Firebase credentials
(`google-services.json`). Every notification also lands in the person's in-app
inbox: the bell in the top bar (`app/notifications.tsx`, `my_notifications()`).

**Demo accounts** (`u-admin@demo.khroyals.test`, `u-eng@…`, `u-s01@…`, `u-p01@…`, …)
share the password in `expo.extra.demoPassword`, which also shows one-tap demo
logins on the sign-in screen. Remove it (and the accounts) before real families use the app.

## Royals Connect — how groups work

Every group is one primitive with a **style preset** plus fully overridable settings.

| Style | Feels like | Default |
|---|---|---|
| Group Chat | GroupMe | everyone in the group talks |
| Discussion Board | Reddit | threads, nested replies, votes |
| Announcements | blog / channel | staff post, everyone subscribes, read-only |
| Q&A | ask-the-office | members ask, staff answer, questions screened |

**Every action has its own "who can" setting** — read, post, reply, react/vote, ask,
answer, attach files, polls, pin, see members, DM members, @everyone — set to
`nobody · owners · moderators · members · subscribers`. So "Announcements but parents
can comment" or "Discussion board where only students post" are just toggles.

**Lock-down & moderation**: one-tap lock with a reason; post approval queue; question
approval; anonymous questions; slow mode; quiet hours (e.g. no student posts 9 PM–7 AM);
auto-close replies after N days; content filter; per-person mute or "can't post"; pin;
close replies per post; full audit log; retained deleted content for records requests.

**Assignment**: rules auto-add people by school role, grade, class section, team or club,
optionally adding their **guardians** too (e.g. "Volleyball Families" = parents of
players). `syncRuleMemberships()` keeps groups in step with roster changes without
touching manually-added people. Groups can nest (Volleyball → Volleyball Families).

**Roles**: school admins act as owners everywhere; only staff can create groups.

The **Connect** tab has a "Viewing as" switcher so you can test as admin, teacher,
coach, student, a muted student, or a parent and watch permissions change.

## Moving to production

1. Replace `mockApi.ts` bodies with real HTTP calls (same return shapes), or run
   `npm run import-site` on a schedule to refresh content.
2. Re-run `can()` **on the server** for every write; the client copy is for UI only.
3. Roster sync: feed `syncRuleMemberships()` from the SIS (OneRoster/Clever/ClassLink).
4. Push notifications via `expo-notifications`; builds via EAS (`eas build -p all`).
5. Student data: plan for FERPA/COPPA review, records retention, and district approval.

## Web app (GitHub Pages)

**Actions → Web app (GitHub Pages)** publishes the web version (school site,
Royals Connect and the admin portal) to **https://bruhggalos.github.io/khroyals/**
on every push to `main`. One-time setup: *Settings → Pages → Source: GitHub Actions*.
The build is served under `/khroyals` (`expo.experiments.baseUrl`).

## Download the Android APK

Every push to `main` (and every pull request) runs **Actions → Android APK**:
type-check, tests, then a release build. Open the finished run and download
**khroyals-android-apk** under *Artifacts*. Unzip it and install the `.apk`
on an Android phone (allow "Install unknown apps" for your browser or Files app).
You can also start a build by hand with **Run workflow**.

The APK is signed with the default development key, which is fine for testing.
Before publishing to Google Play, create an upload keystore and store it as a
repository secret (or switch to EAS Build).
