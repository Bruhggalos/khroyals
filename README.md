# KH Royals — cross-platform app

One Expo / React Native codebase that ships to **iOS, Android and web** for
**Kingdom Heights Preparatory School** (Huntsville, AL). The site content —
every page, news post, video and the school calendar — is imported from the
real [khroyals.com](https://www.khroyals.com/).

> **Building it or putting it on a phone?** See [DEVELOPING.md](DEVELOPING.md).
> AI coding agents: read [AGENTS.md](AGENTS.md).
> What's left to do, and who owns it: [ROADMAP.md](ROADMAP.md).

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
supabase/        migrations, seed, local test stubs, Edge Functions (send-push)
scripts/         import_site.py (website), gen_comms.py (Connect demo)
plugins/         Expo config plugins (withSceneLifecycle: iOS 27 UIScene life cycle;
                 withGradleMemory: 4 GB for the Android release build)
app.config.js    build-time tweaks: iPhone test signing, no web prefix in iOS release bundles
src/api/mockApi.ts    the ONLY module screens call; swap bodies for fetch() later
src/site/             block renderer, link routing, video players
src/comms/            types, presets, permission engine, roster auto-assignment, settings UI
src/carline/          Car Line parent and duty views, automatic check-in
src/market/           Marketplace terms gate and helpers
src/volunteer/        Volunteer gate and helpers
src/handbook/         Handbook reader: pages, paragraphs, search
src/questions/        Ask the School gate and helpers
src/share/            QR codes drawn with plain views (qrcode-generator encodes)
src/calendar/         past events: the school's date, "Show past events", greyed-out style
src/ScreenEdge.tsx    the thin red line around every light screen (navigators' screenLayout)
src/sports/           Activities: categories, season and sign-up rules, sample data, shared pieces
src/carplay/          what the CarPlay screen shows and does (car line check-in)
modules/carplay/      local Expo module: the CarPlay scene and templates (Swift)
app/                  expo-router screens (tabs: Info · Share · Home · Connect · More;
                      Home is the shield button, labeled along its curve, which opens
                      the Apps page: Car Line, Student, Calendar, News, …)
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
SUPABASE_URL=… SUPABASE_SERVICE_ROLE_KEY=… SUPABASE_ACCESS_TOKEN=… \
  NODE_USE_ENV_PROXY=1 node scripts/supabase_setup.mjs     # add --demo (+ DEMO_PASSWORD) for demo data
SUPABASE_URL=… SUPABASE_PUBLISHABLE_KEY=… DEMO_PASSWORD=… node scripts/smoke_supabase.mjs
```

Without an access token, paste `supabase/setup_all.sql` into the dashboard's SQL editor.

**Sign-up & sign-in (no passwords).** *Log in*: enter your email, we email a
6-digit one-time code, type it in. An email with no account moves you to *Create
account* (name + email → code); an admin then approves the account. There is no
password to forget — a lost-access user just logs in again with a fresh code.
Codes last 10 minutes. The email shows the code only once the project has custom
SMTP (see DEVELOPING.md); until then Supabase's default email has a sign-in
button, which the app also accepts (`khroyals://auth`, web `/auth`).

**Admins.** **Directors** have every permission and manage admins and roles.
There can be several, never zero (a database trigger blocks removing the last
one), so changing personnel = add the new director, then the old one steps down.
Directors create **roles** (bundles of permissions — *Administrator* and *Office*
come built in and are editable) and assign them to staff, and can grant single
extra permissions to anyone. The portal's people list is paged and searchable
server-side (`admin_list_people`). Admin tools need a code
from an authenticator app (free TOTP, enforced in the database; switch with
`app.settings.require_admin_mfa`). The admin portal is the app's **Admin portal**
screen: same on web (`npx expo export --platform web`, host the `dist/` folder),
Android and iPhone.

**My profile** (person button in the top bar, or your name on Connect): profile
photo (private `avatars` bucket, signed URLs; staff with *people.roles* can remove
one), name, and push settings — group posts, Marketplace, Volunteering, quiet
hours, and a level per group. School-wide announcements always push. Settings only
filter pushes (`app.wants_push`); the in-app inbox still lists everything.

**Android Auto:** the car line on the car's screen — each child's status and an
"I'm here" button (`modules/car-line`, using a per-phone car pass that can only do
that). CarPlay does the same on iPhone (see **CarPlay** below).

**Stats.** The app records who saw each post (`record_post_views`, once per person
plus repeat counts) and who opened each notification. Authors and group moderators
(admins with *groups.manage* too) get **📊 Stats** on a post (`post_stats`: % of the
group who saw it, views, reactions, replies, poll votes, followers, push opens, views
by day, who saw it) and a **Group stats** screen (`group_post_stats`); the portal's
notification history shows opens. **Following:** authors and repliers follow a post
automatically; anyone can follow/unfollow (🔔), and new replies notify followers
(`app.notify_reply`). My profile toggles: school announcements (urgent ones always
push), group posts, replies, Marketplace, Volunteering, quiet hours, per-group level.

**Children.** Children are students without a login: profiles with `managed = true`
(no auth account), linked to any approved adult through `guardians`, so the car line,
family groups and grade-based groups work for them. The office adds them (Admin portal
→ **Students**) or approves parents' requests (`request_child`, `request_child_edit` →
`admin_decide_family_request`). Parents edit photo, bio, birthday, allergies and health
notes themselves (**My children**); those details (`student_details`, child photos under
`avatars/children/<id>/`) are visible only to the child's parents and staff. Grades come
from the graduation year (`class_of`) and move up every July 1 (`app.refresh_grades`,
daily via pg_cron). K2 = -3, K3 = -2, K4 = -1, Kindergarten = 0.

**Family accounts.** A school role for grandparents and other relatives who pick
children up (`school_role = 'family'`). The office approves the account as Family and
links it to children in Admin portal → **Students**; those links go in `family_pickups`,
never `guardians`. Family accounts get the car line for those children (with their pickup
numbers, but no allergies, health notes or photos), Volunteer and its chat, Activities
(browse and follow, no sign-ups), and the news, calendar and Handbook everyone sees.
They're kept out of Royals Connect groups, the Student app, the Marketplace, Ask the School
and family requests, by the database as well as the app.

**Car line (like PikMyKid).** Every student has a pickup number (auto-assigned,
editable by the office/car line leads; siblings may share). Parents tap **I'm here**
(or Android Auto, or automatic check-in) and the app sends their location; the server
only accepts it within the radius of the pickup spot during pickup hours (or when staff
opened the line today). Only a child's linked parents, or a Family account linked to
them, can announce them. All staff see
the live board (number, name, grade, parent, distance) and mark pickups. Car line leads
and the office set the spot ("Use my location"), radius (feet) and hours in **Car line
settings**.

**Notifications.** Everything sent to a person lands on the Notifications page
(the bell in the top bar, `app/notifications.tsx`): the school's notifications
(`public.notifications` via `my_notifications()`: group posts, announcements,
Marketplace, Volunteer, Ask the School) merged with the ones the phone shows by
itself (the car line's, kept on the phone by `src/comms/localInbox.ts`). Tapping
one opens what it's about (`notificationHref()` in `src/comms/inbox.ts`). New ones
are marked; swipe one (or tap ✕) to delete it, or *Clear all* (`dismiss_notifications`,
`clear_my_notifications`; the phone's own are deleted on the phone). After
sign-in the iPhone and Android apps ask permission to show notifications; the page
says when they're off and links to Settings.

**Push** goes through Expo's free push service: new posts notify group members
(per-group preferences), and the portal sends to everyone, a role, or a group.
`supabase/functions/send-push` delivers them (deployed by the setup script). Phones
register after sign-in once the build has an Expo project id (`eas init` →
`extra.eas.projectId`) and that Expo project has an APNs key (iPhone) or Firebase
credentials (Android); see DEVELOPING.md §7.

**CarPlay** (iPhone). On the car's screen, KH Royals shows today's car line for the
parent's children with their pickup numbers: *I'm here* checks everyone in (with the
phone's location, which the server checks like the phone app's), each child's row
checks in just them or (after a confirmation) cancels, and statuses update live as
staff confirm pickups. Nothing is tappable while the line is closed. The car line notifications show on CarPlay too. It's a CarPlay *driving task*
app: Apple has to grant the entitlement before iPhone builds include it; simulator
builds have it already. Setup and Apple's approval steps: DEVELOPING.md §8.

**Share** (the second tab). A QR code for the school website (khroyals.com) that
anyone can scan with a phone camera, plus *Share the link* (the phone's share sheet)
and *Open the website*. The code is drawn with plain views (`src/share/QrCode.tsx`),
so no native module is needed. **News** moved from its tab to Apps → News.

**Car line** (Apps → Car Line). Parents tap *I'm in the car line* for the children
they're picking up; staff on car line duty see arrivals live and tap *Picked up*
(with Undo for mis-taps). Office staff with *Families & rosters* put staff on duty
in Admin portal → People. Duty isn't an admin permission, so it needs no
authenticator code. Check-ins are kept as the day's pickup record
(`carline_pickups`), and the line starts fresh each day (Central time). The seed puts
the demo Teacher on duty so the staff side can be tried.

Parents can also turn on **Check in automatically** (phones only): a geofence
around the car line (`src/carline/autoCheckIn.ts`) wakes the app on arrival, and
`carline_arrived()` checks the children in if it's pickup time on a school day,
followed by a "You're checked in" notification with *Cancel check-in*. Arriving up
to 45 minutes early schedules a reminder for opening time instead. The zone and
hours live in `app.settings` (`carline_latitude`, `carline_longitude`,
`carline_radius_m`, `carline_start`, `carline_end`, `carline_days`,
`carline_first_day`, `carline_last_day`); No School, Teacher In-Service and
E-Learning days on the school calendar are skipped. The zone starts at the school's
street address; move it to the car line entrance.

**Marketplace** (Apps → Marketplace). Parents and staff buy and sell uniforms and
school-related items after accepting the Marketplace terms (text and version in
`app.settings`: `market_terms`, `market_terms_version`; bump the version to ask
everyone again). A post has an optional photo (private `marketplace` bucket, one
folder per seller), price, quantity (the whole bundle goes to one buyer) and
condition. Buyers call **Dibs** (take it as posted) or make an **Offer**; the
seller accepts or counters once, and the buyer accepts or declines. The seller
sees everyone in line in the order they responded, selects a buyer whose price is
agreed, and confirms; then both get a deal card to hand the item off at school.
Every step notifies the other side through the inbox (`notifications.audience =
'user'`). Admins with *Manage all groups* can remove any post, and the seller is
told why. Students can't use it.

**Volunteer** (Apps → Volunteer). Volunteer Leaders (parents or staff the office
chooses in Admin portal → People) post opportunities with a description, date,
optional times, place and an optional number of spots. Parents and staff tap
**Say Yes!** until it's full; the opportunity joins their *My sign-ups* list and
they can **Remove me** (the leader is told). A people icon shows everyone the count
and who signed up. Each opportunity has a chat for its volunteers and leader; the
leader's messages are highlighted. A leader deletes an opportunity with a reason
that every volunteer is sent. Students can't take part. The seed makes the demo
Teacher a Volunteer Leader.

**Handbook** (Apps → Handbook). The Student / Parent Handbook to read page by page,
with search that highlights every match and jumps to its page; works signed out. The
text is extracted from the school's PDF (`src/handbook/text.ts`, regenerated with
`swift scripts/import_handbook.swift`) and rebuilt into headings and paragraphs by
`src/handbook/handbook.ts`. Page numbers are the PDF's.

**Activities** (Apps → Activities: the basketball-and-masks tile). Sports, theater,
music, art and clubs, picked with the category pills at the top (or All). Anyone
(signed out too) sees what's **happening now**, seasons **coming up** with dates,
eligible grades, details, an info link and sign-up dates, and each activity's
**schedule**: games, practices, tryouts and tournaments for sports; rehearsals,
auditions and performances for theater and music; meetings, competitions and exhibits
for art and clubs; home/away and cancellations. People with an approved account tap an
activity's ★ button to **follow** it, and parents **sign up** their children during a
season's sign-up window; its coach or director approves, and only then is the child
registered. **Your schedule** lists what's coming up for the activities you're involved
in: followed, or a child (or you, as a student) registered. Managers: the *Manage
activities* permission (`sports.manage`; Director and Administrator roles to start; add
it to a role like "Athletic Director") adds activities and their coaches or directors,
who (staff, no authenticator code needed) run its seasons, schedule and sign-ups.
Notifications: schedule changes go to everyone involved, sign-up decisions to the
parent, new sign-ups to the coaches/directors (or the activity managers), and "sign-ups
are open" to followers on the opening day (`app.announce_sport_signups`, daily via
pg_cron). Activities live in the `sports` tables (named before theater was added;
`sports.category` says which kind) and the `app/activities` screens. Without the school
server the app shows sample activities (`src/sports/sample.ts`).

**Ask the School** (Apps → Ask the School). Anyone with an approved account sends
the school a question (topic, subject, message); it stays in *My questions* with the
whole conversation, so they can come back for the answer and follow up. Routers (the
*Route questions* permission, in the Director, Administrator and Office roles to
start) work from Admin portal → Questions: oldest waiting first, with ages that turn amber
after a day and red after three, and they assign each question to a faculty or staff
member, who sees it under *Assigned to me* and answers it. Only the asker, the
assignee and routers can see a question. Routers are told about new questions,
assignees about assignments and follow-ups, and askers about answers.

**Demo data** (accounts like `u-eng@demo.khroyals.test` with groups and posts) is
only created with `supabase_setup.mjs --demo`, for local or throwaway projects. The
app has no demo logins.

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
