# KH Royals — cross-platform app (mock data)

One Expo / React Native codebase that ships to **iOS, Android and web**, backed by a
per-page mock database so the app can be built and tested before any real API exists.

> **About the content.** khroyals.com blocks automated fetching (robots.txt), so the
> pages could not be curled. Every JSON file under `mock-db/site/` is placeholder
> content shaped like a typical K-12 school site, marked `"_meta": { "mock": true }`.
> Paste in the real copy (or export it from the site's CMS) and keep the same keys —
> no screen code changes.

## Run it

```bash
npm install
npx expo start          # press i for iOS simulator, a for Android, w for web
npm test                # permission engine tests
npm run typecheck
```

Scan the QR code with **Expo Go** to try it on a real phone.

## Layout

```
mock-db/
  site/          one JSON per website page
    site.json        school info, colors, nav, footer, social, alert banner
    home.json        hero, quick links, feeds, principal message, stats
    about.json  news.json  calendar.json  academics.json  athletics.json
    activities.json  staff.json  parents.json  students.json
    enrollment.json  dining.json  contact.json
  comms/         Royals Connect (communication app)
    users.json  groups.json  memberships.json  posts.json
    comments.json  audit-log.json  roster.json
scripts/         regenerate mock data (npm run regen-mock)
src/api/mockApi.ts    the ONLY module screens call; swap bodies for fetch() later
src/comms/            types, presets, permission engine, roster auto-assignment, settings UI
app/                  expo-router screens (tabs: Home · News · Calendar · Connect · More)
tests/                permission engine tests
```

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

1. Replace `mockApi.ts` bodies with real HTTP calls (same return shapes).
2. Re-run `can()` **on the server** for every write; the client copy is for UI only.
3. Roster sync: feed `syncRuleMemberships()` from the SIS (OneRoster/Clever/ClassLink).
4. Push notifications via `expo-notifications`; builds via EAS (`eas build -p all`).
5. Student data: plan for FERPA/COPPA review, records retention, and district approval.

## Download the Android APK

Every push to `main` (and every pull request) runs **Actions → Android APK**:
type-check, tests, then a release build. Open the finished run and download
**khroyals-android-apk** under *Artifacts*. Unzip it and install the `.apk`
on an Android phone (allow "Install unknown apps" for your browser or Files app).
You can also start a build by hand with **Run workflow**.

The APK is signed with the default development key, which is fine for testing.
Before publishing to Google Play, create an upload keystore and store it as a
repository secret (or switch to EAS Build).
