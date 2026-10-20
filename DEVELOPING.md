# Developing KH Royals

How to build the app, put it on a phone, and ship changes. For the project
overview see [README.md](README.md); for AI coding agents see [AGENTS.md](AGENTS.md).

| What | Where |
|---|---|
| Web app (site + Royals Connect + admin portal) | https://bruhggalos.github.io/khroyals/ |
| Android APK | GitHub → **Actions → Android APK** → latest run on `main` → **Artifacts → khroyals-android-apk** |
| iPhone (TestFlight) | App Store Connect → **KH Royals → TestFlight**; uploads come from a Mac with `scripts/testflight.sh` (§9) |
| Backend | Supabase project `twmeenkvoedoryhterpf` (dashboard: supabase.com/dashboard) |
| Branch | Everything goes to `main`; every push builds the APK and redeploys the web app |

---

## 1. Fastest way to try it (no setup)

- **Phone (Android):** download the APK artifact above, unzip it, open the `.apk`
  on the phone and allow "Install unknown apps" for your browser or Files app.
  Installing a newer APK over the old one keeps you signed in.
- **Any device:** open the web app link above.
- **Sign up / log in:** on the **Connect** tab — **Log in**: email → we email a
  6-digit code → enter it. No account yet? It switches to **Create account** (name +
  email → code); an admin approves new accounts in Admin portal → People. No
  passwords, so nothing to reset. Free Supabase email sends only ~2 emails/hour.

## 2. Set up a dev machine

Requirements: **Node 22**, npm, Git, Python 3 (only for the import scripts).

```bash
git clone https://github.com/Bruhggalos/khroyals.git
cd khroyals
npm ci              # use ci, not install, so the lockfile is respected
npm run typecheck
npm test            # app permission tests + database tests (Postgres in PGlite, no server needed)
```

No secrets are needed to run the app: the Supabase URL and publishable key are in
`app.json → expo.extra` (safe to ship; the database enforces permissions).

## 3. Run it on a phone while developing

The app uses native modules (video, WebView, notifications), so **Expo Go won't
work fully** — use a development build.

### Android, USB cable (free)

1. Install **Android Studio** (it brings the Android SDK) and **JDK 17**.
   Set `ANDROID_HOME` (e.g. `~/Library/Android/sdk` on macOS, `%LOCALAPPDATA%\Android\Sdk` on Windows).
2. On the phone: Settings → About phone → tap *Build number* 7 times → Developer
   options → turn on **USB debugging**. Plug in and accept the prompt. `adb devices` should list it.
3. Run:
   ```bash
   npx expo run:android          # builds, installs and launches on the phone
   ```
   The first build takes 5–15 minutes; after that, JS changes reload instantly
   (shake the phone or press `r` in the terminal). Rebuild only after adding a
   native package or changing `app.json` plugins.

### Android, no cable

Push to `main` and install the APK from the Actions artifact (≈25 min build), or
build a release APK yourself:
```bash
npx expo prebuild --platform android
cd android && ./gradlew assembleRelease
# → android/app/build/outputs/apk/release/app-release.apk
```

### iPhone

Needs a **Mac with Xcode** and CocoaPods (run with `LANG=en_US.UTF-8`).
`npx expo run:ios` builds and opens the iOS Simulator (`--device <name>` picks one,
or plug in an iPhone). To install on a real iPhone beyond 7-day test builds you need
an **Apple Developer account ($99/yr)**. The cloud alternative is EAS Build
(`npm i -g eas-cli && eas build -p ios`), which also needs an Expo account. There is
no iOS pipeline yet.

Apps built with Xcode 27 (iOS 27 SDK) quit at launch unless they use the UIScene
life cycle, and Expo SDK 57's template doesn't. `plugins/withSceneLifecycle.js`
switches it over during prebuild. `ios/` is generated and gitignored, so don't edit
it by hand. After changing `app.json` plugins, regenerate it with
`npx expo prebuild --platform ios --clean`.

**Install on your own iPhone (release build).** Sign into Xcode with your Apple
Developer account, plug in the phone and turn on *Settings → Privacy & Security →
Developer Mode*. Build under a test app ID so the real `com.khroyals.app` stays free
for whoever publishes the app (`app.config.js` reads the two variables; your Team ID
is in Xcode → Settings → Accounts):

```bash
APPLE_TEAM_ID=YOURTEAMID IOS_BUNDLE_ID=com.khroyals.app.dev npx expo prebuild --platform ios --clean
cd ios && xcodebuild -workspace KHRoyals.xcworkspace -scheme KHRoyals -configuration Release \
  -destination id=YOUR_DEVICE_UDID -derivedDataPath build -allowProvisioningUpdates -allowProvisioningDeviceRegistration build
xcrun devicectl device install app --device YOUR_DEVICE_UDID build/Build/Products/Release-iphoneos/KHRoyals.app
```

`xcrun devicectl list devices` shows the UDID. Use `xcodebuild` rather than
`npx expo run:ios --device` for this: only `-allowProvisioningUpdates` lets Xcode
create the signing profile and register the phone. Release builds run without the
Mac, and the web app's `/khroyals` prefix is kept out of them (see `app.config.js`).

### Web

```bash
npx expo start --web        # dev server at http://localhost:8081
npx expo export --platform web --output-dir dist   # production build (served under /khroyals)
```

## 4. Ship a change

1. Make the change, then `npm run typecheck && npm test`.
2. Commit and push to **`main`**.
3. GitHub Actions runs:
   - **Android APK** — typecheck + tests, then a release APK (≈25 min) → artifact.
   - **Web app (GitHub Pages)** — web export → https://bruhggalos.github.io/khroyals/ (≈2 min).
4. If a run fails at `npm ci` with `ECONNRESET`, it's a network blip on the
   runner: use **Re-run failed jobs**. Anything else is a real failure — read the log.

GitHub Pages must be set to **Settings → Pages → Source: GitHub Actions**. If
it's "Deploy from a branch", GitHub publishes the README instead of the app.

## 5. Backend (Supabase)

The schema lives in `supabase/migrations/` and is tested locally by `tests/db.test.ts`.

**Change the database:**
1. Add a new file `supabase/migrations/<timestamp>_<name>.sql` (never edit one that's been applied).
2. If seed data changes: `python3 scripts/gen_seed.py` (rewrites `supabase/seed.sql` and `supabase/setup_all.sql`).
3. `npm test` until green.
4. Apply to the live project (needs a Supabase **personal access token**, created at
   supabase.com/dashboard/account/tokens — keep it in an env var, never in git or chat):
   ```bash
   export SUPABASE_URL=https://twmeenkvoedoryhterpf.supabase.co
   export SUPABASE_SERVICE_ROLE_KEY=...   # Project Settings → API keys (secret)
   export SUPABASE_ACCESS_TOKEN=sbp_...   # personal access token
   node scripts/supabase_setup.mjs        # applies only new migrations, redeploys send-push
   # (a throwaway project can get demo accounts + groups with --demo and DEMO_PASSWORD=…)
   ```
   (Behind a corporate/agent proxy, prefix with `NODE_USE_ENV_PROXY=1`.)
5. On a `--demo` project, check it end to end:
   ```bash
   SUPABASE_URL=... SUPABASE_PUBLISHABLE_KEY=... DEMO_PASSWORD=... node scripts/smoke_supabase.mjs
   ```
   The smoke test posts a few rows marked `[smoke test]`; delete them afterwards.

**Admins:** `patguettler@gmail.com` is a director. Directors manage everything in
Admin portal → **Admins & roles**: add/remove directors (several allowed, never
zero — add the replacement before stepping down), create roles with chosen
permissions, and assign roles or single permissions to staff. For a fresh project
(or if every director left), run `node scripts/supabase_setup.mjs --director=email`
after that person has logged in once. Demo accounts never get admin powers.

**Accounts & email:** sign-in is an emailed 6-digit code (`signInWithOtp` →
`verifyOtp`, code length 6, valid 10 minutes). On Supabase's built-in email
(free plan) the template can't be changed, so the email shows a *sign-in button*
instead of the code, and only **2 emails/hour** go out for the whole project.
**Fix:** Dashboard → Authentication → Emails → **SMTP Settings** → enable custom
SMTP (e.g. Gmail: `smtp.gmail.com`, port 465, your address, a Google *App
Password*), then re-run `node scripts/supabase_setup.mjs` — it switches the
templates to show `{{ .Token }}`. Raise the email rate limit under Authentication →
Rate Limits. Emailed links still work as a fallback (`app/+native-intent.tsx`,
`app/auth.tsx`).

### Android Auto (car line)

Parents see the car line on the car's screen: each child's status (not checked
in, waiting with their place in line, picked up) and an **I'm here** button.
It's an Android-only local module, `modules/car-line` (car app library, IOT
category); the phone app gives it a car pass at sign-in (`src/carline/carPass.ts`)
that can only show and check in that parent's children.

- **Sideloaded APKs:** Android Auto hides apps that didn't come from the Play
  Store. On the phone: Android Auto settings → scroll down → tap **Version** 10
  times → ⋮ → **Developer settings** → turn on **Unknown sources**.
- **Try it without a car:** Android SDK Manager → SDK Tools → *Android Auto Desktop
  Head Unit Emulator*; in Android Auto's developer settings choose **Start head unit
  server**, then `adb forward tcp:5277 tcp:5277` and run `desktop-head-unit`.
- **CarPlay** needs Apple to grant the *CarPlay Driving Task* entitlement first
  (developer.apple.com/contact/carplay). The server calls (`car_carline_status`,
  `car_carline_check_in`) are ready for it; the iPhone app has no CarPlay code yet.

## 6. Refresh the school website content

```bash
pip install beautifulsoup4
npm run import-site        # re-scrapes khroyals.com into content/site/
npm run typecheck && npm test
```

## 7. Push notifications

The app asks permission to show notifications after sign-in, and the school's
notifications always reach the bell page. Making them buzz the phone needs an Expo
project holding Apple and Google push credentials. One-time setup, by whoever owns
the team's (free) Expo account:

```bash
npx eas-cli@latest login
npx eas-cli@latest init                    # adds extra.eas.projectId to app.json; commit it (not a secret)
npx eas-cli@latest credentials -p ios      # Push Notifications → set up a push key (signs in to Apple)
npx eas-cli@latest credentials -p android  # upload the Firebase (FCM V1) service account key
```

- **iPhone:** the iOS project already has the Push Notifications entitlement
  (`aps-environment`, from the expo-notifications plugin), and Xcode's automatic
  signing turns the capability on for the app ID. Expo stores push credentials per
  bundle ID, so a developer test build (`IOS_BUNDLE_ID=com.khroyals.app.dev`) needs
  `credentials -p ios` run with that variable set too; it can reuse the same key.
- **Android:** also needs `google-services.json` from a Firebase project
  (`android.googleServicesFile` in `app.json`).

Then rebuild the app, sign in and allow notifications. Test by sending from Admin
portal → Notifications, or with another account (Dibs on a Marketplace post). Until
this is done, notifications are queued, shown in the admin portal's history and on
the bell page, but not delivered to phones. On the simulator, see a push with
`xcrun simctl push booted com.khroyals.app payload.apns` (data goes under `"body"`).

## 8. CarPlay

The iPhone app is a CarPlay **driving task** app: on the car's screen, a parent
sees today's car line for their children, with pickup numbers, and taps *I'm here*
(or checks in one child, or cancels a check-in). The car line notifications ("You're checked
in", "The car line is open") show on CarPlay too. Parts:

- `modules/carplay/`: a local Expo module (Swift). It owns the CarPlay scene and
  draws a list (CPListTemplate) with alerts to confirm or report something.
- `src/carplay/screen.ts` decides what the list shows, and `src/carplay/controller.ts`
  loads it and handles taps with the same sign-in and car line functions as the phone
  (`carline_announce` with the phone's location, so the server's radius check applies).
  Sign-in happens on the phone; CarPlay only shows "Sign in on your iPhone". Unlike
  Android Auto (`modules/car-line`), CarPlay runs in the app's own process, so it uses
  the signed-in session rather than a car pass.
- `plugins/withCarPlay.js` adds the CarPlay scene to Info.plist and a
  `CarPlaySceneDelegate` to AppDelegate.swift. That delegate starts React Native
  when CarPlay launches the app without its phone window.

**Try it in the simulator** (works now, before Apple's approval: simulator builds
use `plugins/carplay/Simulator.entitlements`):

```bash
npx expo run:ios
```

In the Simulator: *I/O → External Displays → CarPlay*, then open KH Royals on the
CarPlay screen. Sign in on the simulated iPhone first.

**Getting Apple's approval.** CarPlay apps need an entitlement Apple grants per team:

1. The team's Account Holder or an Admin requests it at
   https://developer.apple.com/carplay (*Request a CarPlay entitlement*), choosing
   the **Driving Task** category. Describe the feature plainly: during school pickup
   the parent, sitting in the car line, taps one button on the car's screen so the
   staff on duty know they've arrived; it shows only their children's pickup status.
   No video, no typing, no browsing.
2. When Apple approves, enable **CarPlay Driving Task** for the app ID
   (`com.khroyals.app`, and any test ID such as `com.khroyals.app.dev`) under
   *Certificates, Identifiers & Profiles → Identifiers → (app ID) → Capabilities*
   (it may be under *Additional Capabilities*). Then let Xcode refresh the
   provisioning profiles.
3. Build for iPhone with the entitlement turned on:

   ```bash
   CARPLAY_ENTITLEMENT=1 npx expo prebuild --platform ios --clean
   ```

   (add `APPLE_TEAM_ID` / `IOS_BUNDLE_ID` as in section 3 for a test build). Without
   `CARPLAY_ENTITLEMENT=1` the iPhone app builds as before, with no CarPlay. Signing
   fails if it's set before Apple approves, because the profile can't include the
   entitlement.
4. Test in a car, or with Apple's CarPlay Simulator for Mac (*Additional Tools for
   Xcode*) and an iPhone connected by cable.
5. In App Store Connect, tell App Review the app supports CarPlay, how to reach it,
   and give them a demo parent account with linked children.

Driving task apps may only use a few simple templates with shallow navigation, and
nothing that needs reading at length; Apple's *CarPlay Developer Guide* lists the
current limits. This app uses one list plus alerts. Check the guide before adding
screens to `src/carplay/screen.ts`.

## 9. TestFlight (iPhone testers)

The app is `com.khroyals.app` in App Store Connect, on the Apple team **Never Ending
Technology, Inc.** (`NH4U6X4G8C`). iPhone builds are uploaded from a Mac (CI only
builds Android):

```bash
APPLE_TEAM_ID=NH4U6X4G8C scripts/testflight.sh
```

- Xcode must be signed in (**Settings → Accounts**) to an account on that team with
  the Admin or App Manager role; it makes the distribution certificate and profile.
- The script runs a clean prebuild with the real app ID, archives, and uploads. Each
  upload gets a new build number from the date and time (`2026.1019.1432`); set
  `IOS_BUILD_NUMBER` to choose one. Bump `version` in `app.json` for a new release.
- It replaces your test-phone setup in `ios/`; prebuild again with
  `IOS_BUNDLE_ID=com.khroyals.app.dev` (§3) before the next test-phone build.
- `app.json` declares that the app only uses standard encryption (HTTPS), so
  builds skip the export compliance question.
- Apple takes 10–30 minutes to process a build. Then, in **TestFlight**:
  - **Internal testing:** add people who are users on the App Store Connect team
    (up to 100). No review; they get each build right away.
  - **External testing:** a group with email invites or a public link (up to
    10,000). The first build of each version goes through Beta App Review
    (about a day), which needs "What to Test" notes and a way for the reviewer to
    sign in. Sign-in is by emailed code, so either point them at the signed-out
    screens or give them a review account with no admin powers.
  - Testers install the **TestFlight** app and accept the invite. Builds expire
    after 90 days.
- Push notifications reach TestFlight installs only after the Expo push setup in §7.
  CarPlay stays off until Apple grants the entitlement (§8).

## 10. Critical alerts (loud on staff phones)

Critical alerts go to every teacher and staff member and always push, whatever their
settings or quiet hours. How loud they are on an iPhone depends on Apple:

- **Now (no approval needed):** they arrive as **Time Sensitive** notifications, which
  break through Focus modes but not the silent switch. The app has the Time Sensitive
  entitlement already; Xcode turns the capability on when it signs.
- **After Apple approves:** they ring even on silent and Do Not Disturb.
  1. Request the **Critical Alerts** entitlement for `com.khroyals.app`
     (https://developer.apple.com/contact/request/notifications-critical-alerts-entitlement/). Explain that it's for school
     emergencies (lockdowns, severe weather) sent only to staff by the administration.
  2. Once granted, build with `CRITICAL_ALERTS_ENTITLEMENT=1` (prebuild, test phone and
     `scripts/testflight.sh`; signing fails before Apple grants it).
  3. When that build is out, turn the loud level on for pushes:
     `update app.settings set value = 'on' where key = 'critical_alerts';`
     Staff are then asked once to allow critical alerts.
- **Android:** alerts use the "Critical alerts" channel (max importance, allowed to ring
  through Do Not Disturb if the person grants it).
- Phones only get any of this after the push setup in §7; until then alerts still fill
  the screen when the app is open and land on the bell page.

## 11. Not set up yet

Open work, and who owns each item, is tracked in [ROADMAP.md](ROADMAP.md).
