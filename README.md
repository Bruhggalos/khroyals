# KH Royals — cross-platform app

One Expo / React Native codebase that ships to **iOS, Android and web** for
**Kingdom Heights Preparatory School** (Huntsville, AL). The site content —
every page, news post, video and the school calendar — is imported from the
real [khroyals.com](https://www.khroyals.com/).

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
mock-db/comms/   Royals Connect demo data (npm run regen-comms)
scripts/         import_site.py (website), gen_comms.py (Connect demo)
src/api/mockApi.ts    the ONLY module screens call; swap bodies for fetch() later
src/site/             block renderer, link routing, video players
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

1. Replace `mockApi.ts` bodies with real HTTP calls (same return shapes), or run
   `npm run import-site` on a schedule to refresh content.
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
