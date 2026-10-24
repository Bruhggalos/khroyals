# Roadmap

What's still to do on KH Royals, and who owns each item. Build and setup steps
are in [DEVELOPING.md](DEVELOPING.md).

**How to use it**

- **Claim an item:** put your name in **Owner** and commit. Leave Owner as `—` if
  nobody has it yet.
- **Status:** `Not started`, `In progress`, `Blocked: <on what>`,
  `Waiting on <who>`, `Needs a decision` or `Recurring`.
- **Finished:** delete the row in the commit that finishes it; git history keeps
  the record. If it's something people will use, add a line to
  [Already built](#already-built).
- **New item:** add a row in the right phase. Keep Notes to a line and link to
  DEVELOPING.md for the steps.
- Everyone pushes to `main`, so pull first and only change the rows you're
  working on; that keeps merge conflicts rare.

## Phases

The work follows the program timeline: build for the school's RFI, present for
approval, integrate with the school, field a beta, then release. Approval is the
gate: Phase 1 needs only Ben, and everything that depends on the school's systems,
documents or accounts waits for Phase 2.

1. **[RFI development](#phase-1--rfi-development)** — the app as presented
2. **[Full integration](#phase-2--full-integration)** — starts at approval; connects the school's systems
3. **[Beta fielding](#phase-3--beta-fielding)** — a group of families and staff use it
4. **[Full release](#phase-4--full-release)** — the app stores, for every family
5. **[Future features and bug fixes](#phase-5--future-features-and-bug-fixes)** — ongoing

## Phase 1 — RFI development

What the presentation should show. All of it can be built and demoed without the
school. Build in table order: the tutorial comes last so it can show each user type
only the apps they'll have.

| Item | Owner | Status | Notes |
|---|---|---|---|
| Views and app availability by user type | Ben | In progress | Set which apps and home view each user type gets (parent, student, teacher, staff, admin, family). Done: students see Student, Calendar, News, Activities, Handbook, Ask the Teacher, Assignments and Campus Map (`src/appTiles.ts`); staff get the Standard / Staff switch. |
| Elevated app versions for Admin and Faculty | Ben | In progress | Done: a Standard / Staff switch on the Main Page for teachers, staff and admins; Staff shows Alerts, the admin portal and the staff versions of Car Line (duty board) and Ask the School (assigned questions), marked in gold. Still to decide: staff versions of Activities (coaches) and Volunteer (leaders), and whether Standard should hide coach and leader controls. |
| Replace the More tab with a Profile tab | Ben | Not started | One tab for every setting: profile, notifications, My children, My vehicles, sign out (plus Car line settings and Admin portal for staff). More's contents (site menu, contact, social, quick links) move to the Planner tab. |
| Planner tab: school life essentials | Ben | In progress | Address with directions, office phone and email, bullying policy and reporting (the Bullying page is already imported), report an issue. Built from the website's content; extra items are confirmed with the school in Phase 2. Done: the tab is renamed Planner (it was Info); the website’s home page sections are off it, and it now shows the date, a greeting, the next two weeks a day at a time (swipe or tap the date strip: uniform, assignments, a card per child for parents, events, activities, volunteering, car line hours), Coming Up and Latest News. Uniform photos (boys and girls, daily and Chapel) still to come from the school: `src/info/uniformImages.ts`. |
| Chat look and feel | Ben | Not started | Texting-style Group Chat: bubbles (yours on the right), newest at the bottom, sender and time grouped. Same style for Volunteer chat. Today messages are cards like board posts. Prompt if team agrees on path forward "In the Connect Tab within a Group, the chat feature should start with a card at the top with the title and a short summary of what the group is about along with a graphic. The texting style for Group Chat should have bubbles for each response with the User's bubble being a different color and on the right. Newest should be at the bottom. Sender and time grouped. Same style as the Volunteer chat."|
| Volunteer app redesign to match Activities | Ben | In progress | Same style and feel as Activities: category pills (e.g. classroom help, events, fundraising, carpool), search, carousels (Your sign-ups, Upcoming opportunities with countdowns), venue with Directions. Done: banner art on every opportunity, details split into section cards, the clapping celebration on Say Yes!, and item requests ("24 boxes of tissues") with pledges and quantity progress. |
| App tutorial | Ben | Not started | Walkthrough that highlights each feature with a one-sentence explanation and Next and Back buttons. |
| Demo data for the presentation | Ben | Not started | Realistic sample families, groups and car line so every user type can be shown. Demo accounts never get admin powers. |
| Proposal package | Ben | Not started | What it costs to run and who supports it: Apple Developer ($99/year), Google Play ($25 one-time), a paid Supabase plan, a possible FACTS API fee, hosting and post-launch support. |
| Demo script and rehearsal | Ben | Not started | Walkthrough by user type (parent, teacher, admin, Family account) to show the role-based views. |

## Phase 2 — Full integration

Starts at approval. Most items need the school's systems, documents or sign-off.
The first three come first: the agreement, the school's developer accounts (slow to
set up) and a private repo. Do the data review before FACTS grades come into the app.

| Item | Owner | Status | What's needed from the school | Notes |
|---|---|---|---|---|
| Agreement and ownership | Ben | Not started | Agreement on who owns the code and data, a data-privacy agreement and support terms | Settle first, at approval. |
| School-owned developer accounts | — | Not started | Apple Developer enrollment as an organization (needs a D-U-N-S number, which can take a couple of weeks) and a Google Play account | Start right away: TestFlight and push notifications depend on it. |
| Make the repo private | Ben | Not started | — | The repo is public today; fine for a prototype, not once it handles student data. |
| Student data review (FERPA/COPPA) | — | Not started | Approval of how student data is stored and shown | Gate for the FACTS grades work. Include Ask the Teacher: students and teachers message each other, and parents and admins with Student messages can read it. |
| FACTS SIS API integration (read-only) | Ben | Not started | A read-only API key from someone with FACTS admin rights (People, Academics, Gradebook: Read; Admissions, Billing: None) | Also needs a vendor subscription key from FACTS. Nightly roster sync (including class sections and their teachers, which Ask the Teacher and Assignments use) plus grades, report cards and schedules in the Student app; keys stay on the server. |
| Campus map image and places | — | Not started | The school's campus or building map, and the places to mark on it (office, gym, library, car line) | The Campus Map shows the address, front office and car line spot until then; add the map and pins in `src/campus/campus.ts`. |
| Class sections on live | — | Not started | Each class's teacher and students | Set them up in Admin portal → Classes (or from FACTS). Until then students see no teachers in Ask the Teacher and get no class assignments. |
| Custom email (SMTP) | — | Not started | DNS access for khroyals.com, to send sign-in emails from the school's address | Needed before beta: Supabase's built-in email sends only a few messages an hour, and its template can't be changed to carry the sign-in code. |
| Push notifications on iPhone and Android | — | Not started | Which Apple and Google accounts the app is published under | Expo project + Apple push key; Firebase project and `google-services.json` for Android ([DEVELOPING §7](DEVELOPING.md#7-push-notifications)). Until then notifications only show on the bell page, and critical alerts only when the app is open. |
| Review critical alert templates | — | Not started | The school's safety plan and sign-off on wording | Lockdown, severe weather and hold-in-place templates (`src/alerts/kinds.ts`). |
| Critical Alerts entitlement | Ben | Not started | A school safety use case for Apple's request | Alerts arrive as Time Sensitive now; Apple's approval lets them ring on silent ([DEVELOPING §10](DEVELOPING.md#10-critical-alerts-loud-on-staff-phones)). |
| Secure web interface for elevated users | Ben | Not started | Security requirements, e.g. whether staff sign in with school Google or Microsoft accounts | Dedicated admin and faculty portal; candidates include separate hosting, session timeouts, SSO and login monitoring. |
| Edit site pages and news from the admin portal | — | Not started | Who on staff will maintain content | Site content is re-imported from khroyals.com today ([DEVELOPING §6](DEVELOPING.md#6-refresh-the-school-website-content)). |
| Confirm Planner tab contents | Ben | Not started | Hours, lunch, key contacts and how "report an issue" is handled | Finishes the Phase 1 Planner tab. |
| Production setup | Ben | Not started | — | Paid Supabase plan (the free plan has no automatic backups), separate test and live environments, crash reporting (none today). |
| Load test at car line time | Ben | Not started | — | Every parent uses the app in the same 15-minute window; check the live board and check-ins against Supabase's realtime connection limits. |
| Accessibility review | — | Not started | Whether the school is held to a specific standard (often WCAG) | Screen reader support, text sizes, contrast. |
| Real data load | Ben | Not started | Family and roster data (via FACTS) and the car line entrance location | Assign pickup numbers; move the car line geofence from the street address to the actual entrance. |

## Phase 3 — Beta fielding

Gets test builds onto beta testers' phones and makes new builds quick to ship as
feedback comes in.

| Item | Owner | Status | Notes |
|---|---|---|---|
| iPhone app on TestFlight | Ben | In progress | First build (0.1.0, 2026.1021.1932) uploaded Oct 21, 2026. Next: internal testers, then an external group through Beta App Review ([DEVELOPING §9](DEVELOPING.md#9-testflight-iphone-testers)). |
| Google Play release signing | — | Not started | The APK uses the development key; needs an upload keystore or EAS Build, then a Play testing track. |
| Build the iPhone app in CI | — | Not started | GitHub Actions builds Android only; iPhone builds are made on a Mac. |
| Check the app on iPhone Duo | — | Not started | The inner display runs it in both orientations (iPhone Duo ignores the portrait lock), and the app resizes as it folds. Built for it but never seen: needs an iPhone Duo simulator (not in Xcode 27.0) or a device. |
| Penetration testing | — | Not started | Must pass before Full release. Run on the integrated beta build: phone apps, admin web portal, database permissions and API functions, sign-in, and the FACTS connection. Fix and retest any findings before Phase 4. |
| Account deletion in the app | Ben | Not started | Apple requires it for any app that lets people create accounts; App Store review rejects the app without it. None exists today. |
| Beta plan | Ben | Not started | Who's in the beta, how testers send feedback, and what has to be true to go ahead with release. |

## Phase 4 — Full release

Starts once penetration testing has passed. Cleans out everything used for testing
and publishes the app to every family.

| Item | Owner | Status | Notes |
|---|---|---|---|
| Remove test data from live | — | Not started | Ben's test family (two test children linked to his account), the sample Soccer and Volleyball seasons and schedule, and the "Test Leader" account (no login) with its four Volunteer opportunities. Also decide whether Ben's account stays a director (made Admin + director on Oct 21, 2026 to test the staff view). |
| Remove demo roles | — | Not started | The demo Teacher's Car line lead and Volunteer Leader roles must go with the demo accounts before real families use the app. |
| Publish to the App Store and Google Play | Ben | Not started | Privacy policy URL, Apple’s privacy labels, store listings and screenshots (iPad screenshots too, since the app runs on iPad); allow time for App Store review, then public release. |
| Staff training and parent rollout | — | Not started | A short guide, an announcement to families and a support contact. |

## Phase 5 — Future features and bug fixes

Ongoing after release; bugs reported in beta and after release go here too.

| Item | Owner | Status | Notes |
|---|---|---|---|
| CarPlay | Ben | Waiting on Apple | Built; needs Apple's CarPlay entitlement and a first look at the car screen in the simulator ([DEVELOPING §8](DEVELOPING.md#8-carplay)). |
| File and photo attachments in Connect posts | — | Not started | The storage bucket and "attach files" permission exist, but the app has no upload button. |
| Tuition calculator | — | Not started | Links to the website's widget instead of running in the app. |
| Notification switches for Activities and Ask the School | — | Needs a decision | My profile has switches for groups, replies, Marketplace, Volunteer and school announcements; these two can only be held back by quiet hours. |
| Yearly upkeep | — | Recurring | Load the new school calendar (typed in by hand from the PDF), update the handbook, check the July 1 grade rollover, upgrade Expo once a year for new iOS and Android versions. |

## Open decisions

- [ ] Add notification switches for Activities and Ask the School? (Phase 5)
- [ ] Should Family accounts see the F.A.Q.s? They moved from the Info tab (now Planner) to Ask the School
  (`app/questions/faq.tsx`), and Family accounts don't get the Ask the School tile. The F.A.Q.s
  screen itself is open to everyone, so a link elsewhere would do it without opening Ask the School.
- [ ] Ask FACTS how a developer gets a vendor subscription key for the SIS API, and
  what it costs ([FACTS partners](https://factsmgt.com/become-a-partner/)).
- [ ] Confirm who at the school has FACTS admin rights to generate the read-only
  API key.

## Already built

Working in the app and on the server today.

| Area | Feature | What it does |
|---|---|---|
| Accounts | Passwordless sign-in | Email a 6-digit code (10 min); new accounts wait for admin approval |
| Accounts | My profile | Photo, name, push settings per group, quiet hours |
| Accounts | My children | Parents edit photo, bio, birthday, allergies, health notes; grades move up every July 1 |
| Accounts | Family accounts | Grandparents and relatives get car line, Volunteer, Activities; kept out of groups, Marketplace, Student, Ask the School |
| School site | Website content in-app | All 23 pages, 55 news posts, home page and videos imported from khroyals.com |
| School site | News | News carousel and articles (Apps → News) |
| School site | Calendar | 2026–27 dates, "Show past events" toggle, group calendars |
| School site | Share tab | QR code, share sheet and link to khroyals.com |
| School site | Handbook | Page-by-page reader with search and highlighting, works signed out |
| Royals Connect | Groups | Chat, Discussion Board, Announcements and Q&A styles, each action's "who can" set separately |
| Royals Connect | Moderation | Lock, approval queues, slow mode, quiet hours, mutes, pinning, audit log |
| Royals Connect | Auto-membership | Rules add people by role, grade, section, team or club, plus their guardians |
| Royals Connect | Post stats and following | Who saw each post, opens, reactions; follow a post for reply notifications |
| Car Line | Parent check-in | Check In with a location check, pickup numbers, saved vehicles, and the traffic flow map with each family’s line (blue for K2–K4, red for K–12th) |
| Car Line | Automatic check-in | Geofence checks children in on arrival; skips no-school days |
| Car Line | Duty board | Live board for staff, "Picked up" with Undo, daily pickup record |
| Car Line | Pickup emails | Every parent is emailed who picked the child up, which staff member released them, and when (undo within a minute cancels it) |
| Car Line | Approved pickup people | Parents (or the office) let another account holder pick a child up, for today, until a date, or until removed; at most one mother and one father per child |
| Accounts | Duplicate children | One record per child: same name and birthday is refused; likely matches (typos, nicknames, birthday, grade) are shown to the office, which links the parent to the existing child |
| Car Line | Car line settings | Spot, radius and hours set by leads and the office |
| Car Line | Android Auto | Car-screen status and "I'm here" button |
| Alerts | Critical alerts | Templates for weather, lockdown, hold; staff answer "I'm safe" / "I need help"; live roll call and all clear |
| Activities | Sports, theater, music, art, clubs | Seasons, schedules, follow, sign-ups with coach approval |
| Activities | Events and RSVPs | Countdown carousel, directions, Going / Not going, attendance for coaches, team photos |
| Marketplace | Buy and sell | Terms gate, photos, Dibs or Offer with one counter, deal card |
| Volunteer | Opportunities and item requests | Leaders post, "Say Yes!" sign-ups with spot limits, item requests people pledge toward with quantity progress, chat per opportunity |
| Ask the School | Questions | Ask and follow up; routers assign to staff; ages turn amber and red |
| Student | Student app | Lists your children; links to the FACTS Family Portal for grades; parents read each child's messages with teachers |
| Student | Ask the Teacher | Students message the teachers of their classes; teachers reply or start a conversation; parents and admins with Student messages can read |
| Student | Assignments | Teachers assign work to a class; students add their own, sorted overdue / today / coming up, and check them off privately |
| Student | Campus Map | The school's map with numbered places once it's added; directions and the front office until then |
| Admin portal | Classes | Class sections with their teacher and students, for Ask the Teacher and Assignments |
| Notifications | Bell page | Inbox of everything sent to you, swipe to delete, clear all |
| Admin portal | People and roles | Directors, custom roles, single permissions, authenticator-app code required |
| Admin portal | Students, questions, push | Add children, approve family requests, route questions, send pushes |
| Builds | Web, Android and iPad | Web app on GitHub Pages and an Android APK built on every push; on iPads and tablets pages sit in a centered column with five Main Page tiles across |
