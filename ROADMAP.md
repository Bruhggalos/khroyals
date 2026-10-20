# Roadmap

What's still to do on KH Royals, and who owns each item. Build and setup steps
are in [DEVELOPING.md](DEVELOPING.md).

**How to use it**

- **Claim an item:** put your name in **Owner** and commit. Leave Owner as `—` if
  nobody has it yet.
- **Status:** `Not started`, `In progress`, `Blocked: <on what>` or
  `Waiting on <who>`.
- **Finished:** delete the row in the commit that finishes it; git history keeps
  the record.
- **New item:** add a row in the right section. Keep Notes to a line and link to
  DEVELOPING.md for the steps.
- Everyone pushes to `main`, so pull first and only change the rows you're
  working on; that keeps merge conflicts rare.

## Before families use the app

| Item | Owner | Status | Notes |
|---|---|---|---|
| Push notifications reach phones | — | Not started | Expo project + Apple push key ([DEVELOPING §7](DEVELOPING.md#7-push-notifications)). Until then notifications only show on the bell page, and critical alerts only when the app is open. |
| Push notifications on Android | — | Not started | Firebase project and `google-services.json` ([DEVELOPING §7](DEVELOPING.md#7-push-notifications)). |
| Custom email (SMTP) | — | Not started | Supabase's built-in email sends only a few messages an hour, and its template can't be changed, so sign-in emails need it to carry the code reliably. |
| iPhone app on TestFlight | Ben | Blocked: App Store Connect record | The record's Bundle ID must be `com.khroyals.app`; the build itself archives fine. |
| Remove test data from live | — | Not started | Ben's test family (his parent account and two test children) and the sample Soccer and Volleyball seasons and schedule. |

## Planned

| Item | Owner | Status | Notes |
|---|---|---|---|
| Critical Alerts entitlement | Ben | Not started | Alerts arrive as Time Sensitive now; ask Apple for Critical Alerts so they ring on silent ([DEVELOPING §10](DEVELOPING.md#10-critical-alerts-loud-on-staff-phones)). |
| Review critical alert templates | — | Not started | The starting wording for lockdown, severe weather and hold in place should match the school's safety plan (`src/alerts/kinds.ts`). |
| CarPlay | Ben | Waiting on Apple | Built; needs Apple's CarPlay entitlement and a first look at the car screen in the simulator ([DEVELOPING §8](DEVELOPING.md#8-carplay)). |
| Edit site pages and news from the admin portal | — | Not started | Site content is imported from khroyals.com today ([DEVELOPING §6](DEVELOPING.md#6-refresh-the-school-website-content)). |

## Ideas and decisions

| Item | Owner | Status | Notes |
|---|---|---|---|
| Notification switches for Activities and Ask the School | — | Needs a decision | My profile has switches for groups, replies, Marketplace, Volunteer and school announcements; these two can only be held back by quiet hours. |
| Build the iPhone app in CI | — | Not started | GitHub Actions builds Android only; iPhone builds are made on a Mac. |
