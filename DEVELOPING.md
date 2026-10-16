# Developing KH Royals

How to build the app, put it on a phone, and ship changes. For the project
overview see [README.md](README.md); for AI coding agents see [AGENTS.md](AGENTS.md).

| What | Where |
|---|---|
| Web app (site + Royals Connect + admin portal) | https://bruhggalos.github.io/khroyals/ |
| Android APK | GitHub → **Actions → Android APK** → latest run on `main` → **Artifacts → khroyals-android-apk** |
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

### Android Auto

Group messages show on the car screen: Android Auto reads them aloud and the
driver can reply by voice (`plugins/withAndroidAuto.js` adds the native code;
see the comment at its top). It needs working push notifications (section 7).

- **Sideloaded APKs:** Android Auto hides apps that didn't come from the Play
  Store. On the phone: Android Auto settings → scroll down → tap **Version**
  10 times → ⋮ → **Developer settings** → turn on **Unknown sources**.
- **Try it without a car:** install *Desktop Head Unit* (Android SDK Manager →
  SDK Tools → Android Auto Desktop Head Unit Emulator), start the head unit server
  from Android Auto's developer settings, then `adb forward tcp:5277 tcp:5277`
  and run `desktop-head-unit`.
- Replies use a reply pass in each push (`reply_from_push`, 24 hours, one group,
  normal permission checks), because native code can't use the app's sign-in.
- Publishing to the Play Store with Android Auto needs Google's messaging-app review.

## 6. Refresh the school website content

```bash
pip install beautifulsoup4
npm run import-site        # re-scrapes khroyals.com into content/site/
npm run typecheck && npm test
```

## 7. Not set up yet

- **Push to phones:** code and server are done; needs an Expo account (`eas init`
  → `extra.eas.projectId` in `app.json`) and a Firebase project (`google-services.json`
  + FCM key uploaded to Expo). Until then pushes are queued and shown in the admin
  portal's history but not delivered.
- **iOS builds**, **custom email (SMTP, needed for codes in the email)**, **editing site pages/news from the admin portal**.
