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
- **Sign up / sign in:** on the **Connect** tab — **Create account** (name, email,
  password; an admin approves new accounts in the Admin portal → People), **Sign in**
  with email + password, *Forgot password?* (emails a reset link), *Email me a
  sign-in link* (passwordless), or tap a demo account (Teacher, Coach, Student,
  Silenced student, Parent). Open emailed links **on the same device**.

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
   export DEMO_PASSWORD=...               # value of expo.extra.demoPassword in app.json
   node scripts/supabase_setup.mjs --no-seed     # applies only new migrations, redeploys send-push
   ```
   (Behind a corporate/agent proxy, prefix with `NODE_USE_ENV_PROXY=1`.)
5. Check it end to end:
   ```bash
   SUPABASE_URL=... SUPABASE_PUBLISHABLE_KEY=... DEMO_PASSWORD=... node scripts/smoke_supabase.mjs
   ```
   The smoke test posts a few rows marked `[smoke test]`; delete them afterwards.

**Admins:** the director is `patguettler@gmail.com`. Make someone else director
from the app (Admin portal → Admins & permissions → *Make … the director*), or for
a fresh project: `node scripts/supabase_setup.mjs --director=email` after they've
signed in once. Demo accounts deliberately have **no** admin powers (their password
is public in `app.json`).

**Accounts & email:** people sign up with email + password (min 8 characters).
Sign-up doesn't send a confirmation email (`mailer_autoconfirm`), because Supabase's
built-in email allows only **2 emails/hour** for the whole project; admin approval
still gates access. Emailed links (password reset, passwordless sign-in) are handled
by `app/+native-intent.tsx` on phones and `app/auth.tsx` on the web; reset links open
`app/set-password.tsx`. Adding custom SMTP (e.g. Resend) lifts the limit; then run the
setup script with `REQUIRE_EMAIL_CONFIRMATION=1` to require confirming the email.

## 6. Refresh the school website content

```bash
pip install beautifulsoup4
npm run import-site        # re-scrapes khroyals.com into content/site/
npm run typecheck && npm test
```

## 7. The Assistant

The `assistant` Edge Function answers with Claude through an Anthropic API key
(console.anthropic.com → API keys; usage is billed to that account). To switch it
on, add `ANTHROPIC_API_KEY=…` to the environment when you run the setup script; it
deploys the function and stores the key as a Supabase secret without printing it:

```bash
ANTHROPIC_API_KEY=sk-ant-… SUPABASE_URL=… SUPABASE_SERVICE_ROLE_KEY=… SUPABASE_ACCESS_TOKEN=… DEMO_PASSWORD=… \
  node scripts/supabase_setup.mjs --no-seed
```

(Or set the secret in the dashboard: Edge Functions → Secrets.) When the school
publishes a new handbook, run `swift scripts/import_handbook.swift` (macOS), check
`npm test`, commit `supabase/functions/assistant/handbook.ts` and redeploy. Change
the model or daily limit in `app.settings` (`assistant_model`,
`assistant_daily_limit`; 0 = no limit), and the staff list in
`public.assistant_contacts`. `app.assistant_usage` shows questions and tokens per
person per day. The prompt itself is in `supabase/functions/assistant/prompt.ts`.

## 8. Push notifications

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

## 9. Not set up yet

- **iOS builds**, **custom email (SMTP)**, **editing site pages/news from the admin portal**.
