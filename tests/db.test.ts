/**
 * Runs the Supabase migrations + seed in PGlite (real Postgres compiled to
 * WASM) and checks the server-side permission rules and row-level security —
 * the same scenarios as permissions.test.ts, enforced by the database.
 */
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { PGlite } from '@electric-sql/pglite';
import users from '../mock-db/comms/users.json';

const ROOT = join(__dirname, '..');
const sql = (p: string) => readFileSync(join(ROOT, p), 'utf8');
const db = new PGlite();

const id = (legacy: string) => `md5('khroyals:${legacy}')::uuid`;
const CHI = (t: string) => `'${t} America/Chicago'::timestamptz`;

async function asSuper() {
  await db.exec(`reset role; select set_config('request.jwt.claim.sub', '', false), set_config('request.jwt.claims', '', false);`);
}
/** Act as a demo person; `mfa` = session verified with an authenticator app (aal2). */
async function as(legacy: string, mfa = false) {
  await asSuper();
  await db.exec(`select set_config('request.jwt.claim.sub', ${id(legacy)}::text, false),
                        set_config('request.jwt.claims', json_build_object('sub', ${id(legacy)}, 'aal', '${mfa ? 'aal2' : 'aal1'}')::text, false);
                 set role authenticated;`);
}
async function one<T = any>(q: string): Promise<T> { return (await db.query<any>(q)).rows[0]; }
async function rows<T = any>(q: string): Promise<T[]> { return (await db.query<any>(q)).rows; }
async function can(legacy: string, group: string, action: string, at = '2026-10-14 15:00') {
  await asSuper();
  return (await one(`select app.can(${id(group)}, '${action}', ${id(legacy)}, ${CHI(at)}) as d`)).d as { allowed: boolean; needsApproval?: boolean; reason?: string };
}
async function rejects(q: string, re: RegExp) {
  await assert.rejects(db.query(q), (e: any) => re.test(e.message));
}

before(async () => {
  await db.exec(sql('supabase/tests/supabase_stubs.sql'));
  for (const f of readdirSync(join(ROOT, 'supabase/migrations')).sort()) await db.exec(sql(join('supabase/migrations', f)));
  for (const u of users.users) {
    await db.query(`insert into auth.users (id, email, raw_user_meta_data) values (${id(u.id)}, $1, $2)`,
      [`${u.id}@demo.khroyals.test`, { first_name: u.firstName, last_name: u.lastName }]);
  }
  await db.exec(sql('supabase/seed.sql'));
  // Test admins (the public seed gives demo accounts no admin powers).
  await db.exec(`update profiles set school_role = 'admin' where id in (${id('u-admin')}, ${id('u-ap')});
                 select app.bootstrap_director('u-admin@demo.khroyals.test');
                 update profiles set admin_tier = 'administrator' where id = ${id('u-ap')};`);
});

test('seed: rule sync builds memberships from the roster', async () => {
  const n = await one(`select count(*)::int as n from memberships where source = 'rule'`);
  assert.ok(n.n > 50);
  // Guardians follow students: parent of a 10th grader is a member of the Class of 2029 parents Q&A.
  assert.equal((await one(`select role from memberships where group_id = ${id('g-c2029-parents')} and user_id = ${id('u-p01')}`)).role, 'member');
  assert.equal(await one(`select 1 from memberships where group_id = ${id('g-c2029-parents')} and user_id = ${id('u-p07')}`), undefined);
  // Manual owner preserved.
  assert.equal((await one(`select role from memberships where group_id = ${id('g-c2029-parents')} and user_id = ${id('u-ap')}`)).role, 'owner');
});

test('broadcast: subscribers read and react, cannot post or comment', async () => {
  assert.equal((await can('u-s01', 'g-announce', 'viewContent')).allowed, true);
  assert.equal((await can('u-s01', 'g-announce', 'react')).allowed, true);
  assert.equal((await can('u-s01', 'g-announce', 'post')).allowed, false);
  assert.equal((await can('u-s01', 'g-announce', 'comment')).allowed, false);
  assert.equal((await can('u-libr', 'g-announce', 'post')).allowed, true);
});

test('Q&A: questions held for approval; only moderators answer', async () => {
  const d = await can('u-p01', 'g-c2029-parents', 'askQuestion');
  assert.deepEqual([d.allowed, d.needsApproval], [true, true]);
  assert.equal((await can('u-p01', 'g-c2029-parents', 'answerQuestion')).allowed, false);
  assert.equal((await can('u-couns', 'g-c2029-parents', 'answerQuestion')).allowed, true);
});

test('lockdown, quiet hours, silence and mute', async () => {
  assert.match((await can('u-s01', 'g-homecoming', 'post')).reason!, /Paused/);
  assert.equal((await can('u-ap', 'g-homecoming', 'post')).allowed, true);
  assert.equal((await can('u-s01', 'g-eng-p3', 'post', '2026-10-14 22:30')).allowed, false);
  assert.equal((await can('u-s01', 'g-eng-p3', 'post', '2026-10-14 15:00')).allowed, true);
  assert.equal((await can('u-s08', 'g-eng-p3', 'post')).allowed, false);
  assert.equal((await can('u-s08', 'g-eng-p3', 'react')).allowed, true);
  assert.equal((await can('u-s03', 'g-vb', 'post', '2026-10-15 14:00')).allowed, false);
  assert.equal((await can('u-s03', 'g-vb', 'post', '2026-10-15 16:00')).allowed, true);
});

test('private and hidden groups; admins act as owners', async () => {
  assert.equal((await can('u-p01', 'g-faculty', 'viewContent')).allowed, false);
  assert.equal((await can('u-s01', 'g-robotics', 'viewContent')).allowed, false);
  await asSuper();
  assert.equal((await one(`select app.effective_role(${id('g-vb')}, ${id('u-admin')}) as r`)).r, 'owner');
  assert.equal((await one(`select app.effective_role(${id('g-vb')}, ${id('u-s07')}) as r`)).r, 'moderator');
});

test('RLS: a parent only sees groups and posts they are allowed to', async () => {
  await as('u-p01');
  const names = (await rows<{ slug: string }>('select slug from groups')).map((g) => g.slug);
  assert.ok(names.includes('g-announce'));
  assert.ok(!names.includes('g-faculty'), 'hidden staff group is invisible');
  assert.equal((await rows(`select id from posts where group_id = ${id('g-faculty')}`)).length, 0);
  assert.ok((await rows(`select id from posts where group_id = ${id('g-announce')}`)).length > 0);
  // Can't read the email directory.
  assert.equal((await rows(`select * from profile_private where id <> ${id('u-p01')}`)).length, 0);
  // Direct writes are blocked; only the API functions write.
  await rejects(`insert into posts (group_id, kind, body) values (${id('g-announce')}, 'message', 'hi')`, /permission denied/);
  await rejects(`update groups set name = 'x'`, /permission denied/);
});

test('API: posting follows the rules (approval queue, denial reasons)', async () => {
  await as('u-p01');
  const q = await one(`select status, author_id from create_post(${id('g-c2029-parents')}, 'question', 'When is picture day?', 'Pictures', true)`);
  assert.equal(q.status, 'pending');
  assert.equal(q.author_id, null, 'anonymous question hides the author');
  await rejects(`select create_post(${id('g-announce')}, 'announcement', 'Hello')`, /Only moderators/);

  await as('u-ap');
  const pending = await rows(`select id from posts where group_id = ${id('g-c2029-parents')} and status = 'pending'`);
  assert.ok(pending.length >= 1, 'moderator sees the queue');
  const pid = pending[pending.length - 1].id;
  assert.equal((await one(`select anonymous_author('${pid}') as a`)).a !== null, true);
  await one(`select moderate_post('${pid}', 'approve')`);
  assert.equal((await one(`select status from posts where id = '${pid}'`)).status, 'published');
  assert.ok((await rows(`select * from audit_log where target_id = '${pid}'`)).length === 1);
});

test('API: slow mode and comments', async () => {
  await asSuper();
  // Posts at the real clock time, so turn off this group's quiet hours (tested separately with fixed times).
  await db.exec(`update groups set settings = jsonb_set(jsonb_set(settings, '{slowModeSeconds}', '60'), '{quietHours}', 'null') where id = ${id('g-eng-p3')}`);
  await as('u-s01');
  await one(`select create_post(${id('g-eng-p3')}, 'thread', 'First thought', 'Q')`);
  await rejects(`select create_post(${id('g-eng-p3')}, 'thread', 'Second thought', 'Q')`, /Slow mode/);
  await as('u-s01');
  const p = await one(`select id from posts where group_id = ${id('g-eng-p3')} and status = 'published' order by created_at desc limit 1`);
  await one(`select add_comment('${p.id}', 'Agree!')`);
  await as('u-p01');
  await rejects(`select add_comment('${p.id}', 'hi')`, /not found/i);
});

test('API: only staff create groups; owners edit settings; rules sync immediately', async () => {
  await as('u-s01');
  await rejects(`select create_group('X', '', '💬', null, 'class', '{}'::jsonb)`, /Only staff/);
  await as('u-eng');
  const g = await one(`select id from create_group('Period 3 Parents', '', '👪', null, 'parents',
      (select settings from groups where slug = 'g-eng-p3-parents'),
      '[{"sectionIds":["eng10-p3"],"schoolRoles":["student"],"assignAs":"subscriber","includeGuardiansAs":"member"}]'::jsonb)`);
  await asSuper();
  const role = async (u: string) => (await one(`select role from memberships where group_id = '${g.id}' and user_id = ${id(u)}`))?.role;
  assert.equal(await role('u-eng'), 'owner');
  assert.equal(await role('u-s01'), 'subscriber', 'Period 3 student added by the rule');
  assert.equal(await role('u-p01'), 'member', 'and their guardian');
  await as('u-s01');
  await rejects(`select update_group_settings('${g.id}', '{"locked":true}')`, /Only owners/);
  await as('u-eng');
  await one(`select update_group_settings('${g.id}', '{"locked":true,"lockReason":"Paused","permissions":{"comment":"members"}}')`);
  const s = (await one(`select settings from groups where id = '${g.id}'`)).settings;
  assert.equal(s.locked, true);
  assert.equal(s.permissions.comment, 'members');
  assert.equal(s.permissions.viewContent, 'subscribers', 'other permissions kept');
});

test('calendar: anyone reads the school calendar; only admins edit it; group events follow the group', async () => {
  await asSuper();
  await db.exec(`set role anon`);
  assert.ok((await rows('select id from events where group_id is null')).length >= 30);
  assert.equal((await rows('select id from events where group_id is not null')).length, 0);
  await as('u-s01');
  await rejects(`insert into events (title, starts_on) values ('Party', '2026-11-01')`, /row-level security/);
  await as('u-admin', true);
  await one(`insert into events (title, starts_on) values ('Picture day', '2026-11-05') returning id`);
  await as('u-vbcoach');
  await one(`insert into events (group_id, title, starts_on) values (${id('g-vb')}, 'Team dinner', '2026-10-30') returning id`);
  await as('u-s05');
  assert.equal((await rows(`select title from events where title = 'Team dinner'`)).length, 1, 'players see team events');
  await as('u-p02');
  assert.equal((await rows(`select title from events where title = 'Team dinner'`)).length, 0, 'non-members do not');
});

test('admin console: approve sign-ups and manage roles', async () => {
  await asSuper();
  await db.query(`insert into auth.users (id, email, raw_user_meta_data) values ('00000000-0000-0000-0000-0000000000aa', 'new@demo.khroyals.test', '{"first_name":"New","last_name":"Parent"}')`);
  await as('u-s01');
  await rejects(`select admin_list_people()`, /permission/);
  await db.exec(`reset role; select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000aa', false), set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000aa","aal":"aal1"}', false); set role authenticated;`);
  assert.equal((await rows('select id from groups')).length, 0, 'unapproved sign-ups see nothing');
  await as('u-admin', true);
  const pending = await rows(`select * from admin_list_people() where school_role is null`);
  assert.equal(pending.length, 1);
  assert.equal(pending[0].email, 'new@demo.khroyals.test');
  await one(`select admin_update_profile('00000000-0000-0000-0000-0000000000aa', 'parent')`);
  await one(`select admin_link_guardian('00000000-0000-0000-0000-0000000000aa', ${id('u-s03')})`);
  await asSuper();
  const vbFamily = await one(`select role from memberships where group_id = ${id('g-vb-parents')} and user_id = '00000000-0000-0000-0000-0000000000aa'`);
  assert.ok(vbFamily, 'linking a guardian adds them to their student\'s family groups');
});

test('admin tiers: one director; admin powers need an authenticator-verified session', async () => {
  await asSuper();
  assert.equal((await one(`select admin_tier from profiles where id = ${id('u-admin')}`)).admin_tier, 'director');
  await rejects(`update profiles set admin_tier = 'director' where id = ${id('u-ap')}`, /profiles_one_director|duplicate/);

  await as('u-admin');  // signed in with email only
  await rejects(`select * from admin_list_people()`, /MFA_REQUIRED/);
  assert.equal((await rows(`select id from groups where slug = 'g-faculty'`)).length, 1, 'admins are members of the staff lounge');
  assert.equal((await one(`select my_access() as a`)).a.mfaRequired, true);
  await as('u-admin', true);
  assert.ok((await rows(`select * from admin_list_people()`)).length >= 25);
  assert.equal((await one(`select my_access() as a`)).a.permissions.includes('admins.manage'), true);
});

test('admin tiers: director grants tiers and permissions; others cannot', async () => {
  await as('u-ap', true);  // administrator
  await rejects(`select admin_set_access(${id('u-libr')}, 'office')`, /permission/);
  await one(`select admin_update_profile(${id('u-s02')}, 'student', 11)`);  // administrators manage roles/grades
  await rejects(`select admin_update_profile(${id('u-admin')}, 'teacher')`, /permission/);

  await as('u-admin', true);
  await one(`select admin_set_access(${id('u-libr')}, 'office')`);
  await rejects(`select admin_set_access(${id('u-s01')}, 'office')`, /staff accounts/);
  await rejects(`select admin_set_access(${id('u-eng')}, null, array['admins.manage'])`, /can't be granted/);
  await one(`select admin_set_access(${id('u-eng')}, null, array['calendar.school'])`);  // a teacher runs the school calendar

  await as('u-eng', true);
  await one(`insert into events (title, starts_on) values ('Spirit week', '2026-11-09') returning id`);
  await as('u-libr', true);  // office tier
  await rejects(`select admin_update_profile(${id('u-s03')}, 'teacher')`, /permission/);
  assert.ok((await rows(`select * from audit_log`)).length > 0, 'office staff read the activity log');
});

test('admin tiers: the director role can be transferred', async () => {
  await as('u-admin', true);
  await rejects(`select admin_update_profile(${id('u-admin')}, 'teacher')`, /Transfer the director/);
  await one(`select transfer_director(${id('u-ap')})`);
  await asSuper();
  const tiers = await rows(`select id, admin_tier from profiles where admin_tier is not null order by admin_tier`);
  assert.equal(tiers.filter((t) => t.admin_tier === 'director').length, 1);
  assert.equal((await one(`select admin_tier from profiles where id = ${id('u-ap')}`)).admin_tier, 'director');
  assert.equal((await one(`select admin_tier from profiles where id = ${id('u-admin')}`)).admin_tier, 'administrator');
  await as('u-ap', true);
  await one(`select transfer_director(${id('u-admin')})`);  // hand it back for the other tests
});

test('push: new posts queue a notification for members, not the author or non-members', async () => {
  await as('u-vbcoach');
  const vb = id('g-vb');
  const post = await one(`select id from create_post(${vb}, 'message', 'Practice moved to 4pm')`);
  await asSuper();
  const n = await one(`select * from notifications where post_id = '${post.id}'`);
  assert.ok(n, 'notification queued');
  assert.match(n.body, /Practice moved/);
  await db.exec(`insert into push_tokens values ('ExponentPushToken[s05]', ${id('u-s05')}, 'android'),
                 ('ExponentPushToken[coach]', ${id('u-vbcoach')}, 'ios'), ('ExponentPushToken[p02]', ${id('u-p02')}, 'android')`);
  const targets = (await rows(`select user_id from app.push_targets('${n.id}')`)).map((r) => r.user_id);
  const uid = async (l: string) => (await one(`select ${id(l)} as u`)).u;
  assert.ok(targets.includes(await uid('u-s05')), 'teammate gets it');
  assert.ok(!targets.includes(await uid('u-vbcoach')), 'author does not');
  assert.ok(!targets.includes(await uid('u-p02')), 'non-member does not');
  await db.exec(`update memberships set notification = 'none' where group_id = ${vb} and user_id = ${id('u-s05')}`);
  assert.equal((await rows(`select 1 from app.push_targets('${n.id}')`)).length, 0, 'muted notifications respected');

  await as('u-s01');
  await rejects(`select send_notification('Hi', 'everyone', 'everyone')`, /permission/);
  await rejects(`select * from app.push_targets('${n.id}')`, /permission denied/);
  await as('u-admin', true);
  const blast = await one(`select * from send_notification('Snow day', 'School is closed tomorrow.', 'roles', null, array['parent'])`);
  await asSuper();
  const parents = await rows(`select distinct user_id from app.push_targets('${blast.id}')`);
  assert.equal(parents.length, 1, 'only the parent with a registered device');
});

test('inbox: my_notifications lists only what was sent to me', async () => {
  // Uses the volleyball post and the parent "Snow day" blast from the push test.
  const inbox = async (who: string, mfa = false) => {
    await as(who, mfa);
    return (await rows(`select body from my_notifications()`)).map((n) => n.body).join('\n');
  };
  const vb = id('g-vb');
  assert.match(await inbox('u-p02'), /School is closed/, 'parents get the parent blast');
  assert.doesNotMatch(await inbox('u-p02'), /Practice moved/, 'non-members miss group posts');
  assert.doesNotMatch(await inbox('u-s05'), /Practice moved/, 'a muted group stays out of the inbox');
  await asSuper();
  await db.exec(`update memberships set notification = 'all' where group_id = ${vb} and user_id = ${id('u-s05')}`);
  assert.match(await inbox('u-s05'), /Practice moved/, 'teammates get the group post');
  assert.doesNotMatch(await inbox('u-s05'), /School is closed/, 'students miss the parent blast');

  // The table shows authors their own posts and push.send admins everything; the inbox doesn't.
  await as('u-vbcoach');
  assert.ok((await rows(`select 1 from notifications where body like '%Practice moved%'`)).length > 0);
  assert.doesNotMatch(await inbox('u-vbcoach'), /Practice moved/, 'no notification for your own post');
  assert.doesNotMatch(await inbox('u-admin', true), /School is closed/, 'senders see it in the portal history, not their inbox');

  await asSuper();
  await db.exec(`set role anon`);
  await rejects(`select * from my_notifications()`, /permission denied/);
  await asSuper();
  await db.exec(`update memberships set notification = 'none' where group_id = ${vb} and user_id = ${id('u-s05')}`);
});

test('car line: parents check in their own children; staff on duty see the line and confirm pickups', async () => {
  const uid = async (l: string) => (await one(`select ${id(l)} as u`)).u as string;
  const [ava, eng] = [await uid('u-s01'), await uid('u-eng')];
  const today = async (who: string) => { await as(who); return rows(`select * from carline_today()`); };

  // Rosa Reyes (u-p01) is Ava's (u-s01) parent.
  await as('u-p01');
  const [checkin] = await rows(`select * from carline_check_in()`);
  assert.equal(checkin.student_id, ava);
  assert.equal(checkin.status, 'waiting');
  assert.equal((await rows(`select * from carline_check_in(array[${id('u-s01')}])`)).length, 1, 'checking in twice keeps one place in line');
  await rejects(`select * from carline_check_in(array[${id('u-s02')}])`, /own children/);
  await rejects(`insert into carline_pickups (student_id) values (${id('u-s02')})`, /permission denied/);

  // Other parents and staff who aren't on duty see nothing; the demo Teacher (u-eng) is on duty.
  assert.equal((await today('u-p02')).length, 0);
  assert.equal((await today('u-sci')).length, 0);
  await as('u-sci');
  await rejects(`select carline_confirm('${checkin.id}')`, /car line duty/);
  assert.deepEqual((await today('u-eng')).map((r) => r.student_id), [ava]);
  await as('u-eng');
  const done = await one(`select * from carline_confirm('${checkin.id}')`);
  assert.equal(done.status, 'picked_up');
  assert.equal(done.picked_up_by, eng);
  await rejects(`select carline_confirm('${checkin.id}')`, /isn't waiting/);
  assert.equal((await today('u-p01'))[0].status, 'picked_up', 'the parent sees the pickup');

  // Staff can undo a mis-tap; parents can cancel, but only for their own children.
  await as('u-eng');
  assert.equal((await one(`select * from carline_reopen('${checkin.id}')`)).status, 'waiting');
  await as('u-p02');
  await rejects(`select carline_cancel('${checkin.id}')`, /can't be cancelled/);
  await as('u-p01');
  await one(`select carline_cancel('${checkin.id}')`);
  assert.equal((await today('u-eng')).filter((r) => r.status === 'waiting').length, 0);

  // The line starts fresh each day.
  await asSuper();
  await db.exec(`insert into carline_pickups (student_id, day) values (${id('u-s01')}, app.school_today() - 1)`);
  assert.equal((await today('u-p01')).length, 1, "only today's check-in");

  await asSuper();
  await db.exec(`set role anon`);
  await rejects(`select * from carline_today()`, /permission denied/);
});

test('car line duty: office staff assign it, and only to staff', async () => {
  await as('u-s01');
  await rejects(`select admin_set_carline_duty(${id('u-sci')}, true)`, /permission/);
  await as('u-admin', true);
  await rejects(`select admin_set_carline_duty(${id('u-p02')}, true)`, /Only staff/);
  await one(`select admin_set_carline_duty(${id('u-sci')}, true)`);
  assert.equal((await one(`select carline_duty from admin_list_people() where id = ${id('u-sci')}`)).carline_duty, true);
  await as('u-sci');
  assert.ok((await rows(`select * from carline_today()`)).length > 0, 'now sees the line');
  await as('u-admin', true);
  await one(`select admin_set_carline_duty(${id('u-sci')}, false)`);
  await as('u-sci');
  assert.equal((await rows(`select * from carline_today()`)).length, 0);
});

test('car line auto check-in: only during pickup hours on school days', async () => {
  await asSuper();
  const at = async (t: string) => (await one(`select app.carline_window(${CHI(t)}) as w`)).w;
  assert.equal((await at('2026-10-14 15:00')).state, 'open', 'a Wednesday at 3:00');
  const early = await at('2026-10-14 14:30');
  assert.equal(early.state, 'early');
  assert.equal(new Date(early.opensAt).getTime(), new Date('2026-10-14T14:45:00-05:00').getTime(), 'opens at 2:45 Central');
  assert.equal((await at('2026-10-14 15:31')).state, 'closed');
  assert.equal((await at('2026-10-17 15:00')).state, 'closed', 'Saturday');
  assert.equal((await at('2026-11-11 15:00')).state, 'closed', "Veteran's Day (No School)");
  assert.equal((await at('2026-07-15 15:00')).state, 'closed', 'summer');

  // Open the line all day, every day, so the rest doesn't depend on when the tests run.
  await db.exec(`update app.settings set value = '00:00' where key = 'carline_start';
                 update app.settings set value = '24:00' where key = 'carline_end';
                 update app.settings set value = '1,2,3,4,5,6,7' where key = 'carline_days';
                 update app.settings set value = null where key in ('carline_first_day', 'carline_last_day');
                 update events set category = 'Academic' where group_id is null
                   and category in ('No School', 'Teacher In-Service', 'E-Learning')
                   and app.school_today() between starts_on and coalesce(ends_on, starts_on);`);

  // Wei Chen (u-p02) is Liam's (u-s02) parent and hasn't used the car line today.
  await as('u-p02');
  assert.equal((await one(`select carline_config() as c`)).c.radius, 150);
  const first = (await one(`select carline_arrived() as r`)).r;
  assert.equal(first.state, 'open');
  assert.deepEqual(first.names, ['Liam']);
  assert.deepEqual((await one(`select carline_arrived() as r`)).r.checkedIn, [], 'arriving again adds nobody');
  assert.equal((await rows(`select via from carline_today()`))[0].via, 'arrival');
  await as('u-eng');
  await one(`select carline_confirm('${first.checkedIn[0]}')`);
  await as('u-p02');
  assert.deepEqual((await one(`select carline_arrived() as r`)).r.checkedIn, [], 'not again once picked up');

  await asSuper();
  await db.exec(`set role anon`);
  await rejects(`select carline_arrived()`, /permission denied/);
  await rejects(`select carline_config()`, /permission denied/);
});

test('marketplace: dibs and offers line up; the seller counters, picks a buyer and confirms', async () => {
  const uid = async (l: string) => (await one(`select ${id(l)} as u`)).u as string;
  const [rosa, wei, dana] = [await uid('u-p01'), await uid('u-p02'), await uid('u-p03')];
  const mine = async (listing: string) => rows(`select body from my_notifications() where data->>'listingId' = '${listing}'`);

  const accept = `select market_accept_terms((market_terms()->>'version')::int)`;
  await as('u-s01');
  await rejects(`select * from market_post('Bike', '', 5000, 1, 'good')`, /parents and staff/);
  await rejects(accept, /parents and staff/);

  // Everyone accepts the terms first.
  await as('u-p01');
  assert.equal((await one(`select market_terms() as t`)).t.accepted, false);
  assert.match((await one(`select market_terms() as t`)).t.text, /uniforms and other school-related items/);
  await rejects(`select * from market_post('Polos', '', 1500, 3, 'good')`, /Accept the Marketplace terms/);
  await rejects(`select market_accept_terms(99)`, /terms have changed/);
  await one(accept);
  assert.equal((await one(`select market_terms() as t`)).t.accepted, true);

  // Rosa (u-p01) sells three polos.
  const post = await one(`select * from market_post('Polo shirts, size M', 'Navy', 1500, 3, 'like_new', '${rosa}/polos.jpg')`);
  assert.equal(post.status, 'open');
  await rejects(`select * from market_post('x', '', 100, 1, 'good', '${wei}/x.jpg')`, /isn't yours/);
  await rejects(`insert into market_listings (seller_id, title, price_cents, condition) values ('${rosa}', 'x', 1, 'good')`, /permission denied/);
  await rejects(`select * from market_dibs('${post.id}')`, /your own post/);
  await as('u-s01');
  assert.equal((await rows(`select 1 from market_listings`)).length, 0, 'students see no posts');

  // Wei (u-p02) calls dibs first, then Dana (u-p03) offers $10. Nobody sees posts before accepting the terms.
  await as('u-p02');
  assert.equal((await rows(`select 1 from market_listings`)).length, 0);
  await rejects(`select * from market_dibs('${post.id}')`, /Accept the Marketplace terms/);
  await one(accept);
  for (const p of ['u-p03', 'u-p04']) { await as(p); await one(accept); }
  await as('u-p02');
  const dibs = await one(`select * from market_dibs('${post.id}')`);
  assert.equal(dibs.status, 'agreed');
  assert.equal(dibs.agreed_cents, 1500);
  await rejects(`select * from market_dibs('${post.id}')`, /already in line/);
  await as('u-p03');
  const offer = await one(`select * from market_offer('${post.id}', 1000, 'Would you take $10?')`);
  assert.equal(offer.status, 'offered');
  assert.equal((await rows(`select 1 from market_responses`)).length, 1, 'buyers only see their own line');

  // Rosa sees both lines in the order they came in, and was told about each.
  await as('u-p01');
  assert.deepEqual((await rows(`select kind from market_responses where listing_id = '${post.id}' order by created_at`)).map((r) => r.kind), ['dibs', 'offer']);
  const told = (await mine(post.id)).map((n) => n.body).join('\n');
  assert.match(told, /Wei C\. called dibs at \$15\.00/);
  assert.match(told, /Dana B\. offered \$10\.00/);
  await as('u-p02');
  await rejects(`select * from market_answer_offer('${offer.id}', true)`, /Only the seller/);
  await as('u-p01');
  await rejects(`select * from market_select('${offer.id}')`, /Agree on a price/);
  assert.equal((await one(`select * from market_answer_offer('${offer.id}', false, 1200)`)).status, 'countered');
  await as('u-p03');
  assert.match((await mine(post.id))[0].body, /countered at \$12\.00/);
  assert.equal((await one(`select * from market_answer_counter('${offer.id}', true)`)).agreed_cents, 1200);

  // Rosa picks Dana's line and confirms: the sale is pending and the line is closed.
  await as('u-p01');
  const sale = await one(`select * from market_select('${offer.id}')`);
  assert.equal(sale.status, 'pending');
  assert.equal(sale.buyer_id, dana);
  assert.equal(sale.sale_cents, 1200);
  await as('u-p04');
  await rejects(`select * from market_dibs('${post.id}')`, /isn't available/);
  await rejects(`select market_cancel_sale('${post.id}')`, /no pending sale of yours/);

  // Dana backs out, so the post reopens; someone else joins and leaves the line.
  await as('u-p03');
  await one(`select market_cancel_sale('${post.id}')`);
  await as('u-p04');
  const late = await one(`select * from market_dibs('${post.id}')`);
  await one(`select market_withdraw('${late.id}')`);
  await rejects(`select market_withdraw('${late.id}')`, /Nothing to withdraw/);

  // Rosa goes with Wei's dibs and marks it sold; only the two of them still see it.
  await as('u-p01');
  await one(`select * from market_select('${dibs.id}')`);
  await as('u-p02');
  assert.match((await mine(post.id))[0].body, /chose you at \$15\.00/);
  await rejects(`select market_complete('${post.id}')`, /no pending sale/);
  await as('u-p01');
  await one(`select market_complete('${post.id}')`);
  await as('u-p04');
  assert.equal((await rows(`select 1 from market_listings where id = '${post.id}'`)).length, 0, 'sold posts drop out');
  await as('u-p02');
  assert.equal((await one(`select status from market_listings where id = '${post.id}'`)).status, 'sold');

  // Sellers take down their own posts; admins can take down anyone's.
  const extra = await one(`select * from market_post('Lunchbox', '', 300, 1, 'fair')`);
  await as('u-p01');
  await rejects(`select market_remove('${extra.id}')`, /Only the seller/);
  await as('u-admin', true);
  await one(`select market_remove('${extra.id}')`);
  await as('u-p02');
  assert.equal((await one(`select status from market_listings where id = '${extra.id}'`)).status, 'removed');
  assert.match((await mine(extra.id))[0].body, /removed your Marketplace post because it isn't a uniform or school-related item/);

  await asSuper();
  await db.exec(`set role anon`);
  await rejects(`select * from market_listings`, /permission denied/);
});

test('marketplace photos: parents and staff upload only into their own folder', async () => {
  const uid = async (l: string) => (await one(`select ${id(l)} as u`)).u as string;
  const [rosa, wei, ava] = [await uid('u-p01'), await uid('u-p02'), await uid('u-s01')];
  const put = (who: string, path: string) => `insert into storage.objects (bucket_id, name, owner) values ('marketplace', '${path}', '${who}')`;
  await as('u-p01');
  await db.exec(put(rosa, `${rosa}/polos.jpg`));
  await rejects(put(rosa, `${wei}/sneaky.jpg`), /row-level security/);
  await as('u-s01');
  await rejects(put(ava, `${ava}/bike.jpg`), /row-level security/);
  assert.equal((await rows(`select 1 from storage.objects where bucket_id = 'marketplace'`)).length, 0, "students can't see photos");
  await as('u-p02');
  assert.equal((await rows(`select 1 from storage.objects where bucket_id = 'marketplace'`)).length, 1);
});

test('volunteers: leaders post, parents and staff say yes until it fills, chat, drop out and get told about deletions', async () => {
  const uid = async (l: string) => (await one(`select ${id(l)} as u`)).u as string;
  const [rosa, luis] = [await uid('u-p01'), await uid('u-p05')];
  const told = async (who: string, opp: string) => {
    await as(who);
    return (await rows(`select body from my_notifications() where data->>'opportunityId' = '${opp}'`)).map((n) => n.body).join('\n');
  };
  const post = `select * from volunteer_post('Book fair helpers', 'Set up tables and run the register.', app.school_today() + 7, null, '15:00', '17:00', 'Library', 2)`;

  // Only Volunteer Leaders post; the office makes parents or staff leaders (the seed made the demo Teacher one).
  await as('u-p05');
  await rejects(post, /Only Volunteer Leaders/);
  await as('u-admin', true);
  await rejects(`select admin_set_volunteer_lead(${id('u-s01')}, true)`, /parents or staff/);
  await one(`select admin_set_volunteer_lead(${id('u-p05')}, true)`);
  assert.equal((await one(`select volunteer_lead from admin_list_people() where id = ${id('u-eng')}`)).volunteer_lead, true);

  // Luis (u-p05) posts an opportunity with two spots.
  await as('u-p05');
  const opp = await one(post);
  await rejects(`select volunteer_say_yes('${opp.id}')`, /leading this one/);
  await as('u-s01');
  assert.equal((await rows(`select 1 from volunteer_opportunities`)).length, 0, 'students see nothing');
  await rejects(`select volunteer_say_yes('${opp.id}')`, /parents and staff/);

  // Rosa and Wei say yes; then it's full.
  await as('u-p01');
  await one(`select volunteer_say_yes('${opp.id}')`);
  await rejects(`select volunteer_say_yes('${opp.id}')`, /already said yes/);
  await as('u-p02');
  await one(`select volunteer_say_yes('${opp.id}')`);
  await as('u-p03');
  await rejects(`select volunteer_say_yes('${opp.id}')`, /All spots are filled/);
  assert.match(await told('u-p05', opp.id), /2 of 2 spots filled/);

  // Everyone sees who signed up; only the volunteers and the leader see or write the chat.
  await as('u-p03');
  assert.equal((await rows(`select 1 from volunteer_signups where opportunity_id = '${opp.id}'`)).length, 2);
  await rejects(`select * from volunteer_send('${opp.id}', 'Can I help?')`, /Say Yes! to join/);
  await as('u-p01');
  await one(`select * from volunteer_send('${opp.id}', 'I can bring a cash box.')`);
  await as('u-p05');
  await one(`select * from volunteer_send('${opp.id}', 'Thanks! Doors open at 2:45.')`);
  await as('u-p02');
  assert.deepEqual((await rows(`select author_id from volunteer_messages where opportunity_id = '${opp.id}' order by created_at`)).map((m) => m.author_id), [rosa, luis]);
  await as('u-p03');
  assert.equal((await rows(`select 1 from volunteer_messages`)).length, 0, 'not in the chat');
  await rejects(`insert into volunteer_signups values ('${opp.id}', ${id('u-p03')})`, /permission denied/);

  // Wei drops out (the leader is told), which frees a spot for Dana.
  await as('u-p02');
  await one(`select volunteer_withdraw('${opp.id}')`);
  await rejects(`select volunteer_withdraw('${opp.id}')`, /not signed up/);
  assert.match(await told('u-p05', opp.id), /Wei C\. removed themselves from Book fair helpers/);
  await as('u-p03');
  await one(`select volunteer_say_yes('${opp.id}')`);

  // Only the leader deletes, with a reason that reaches every volunteer.
  await as('u-p01');
  await rejects(`select volunteer_delete('${opp.id}', 'nah')`, /Only the leader/);
  await as('u-p05');
  await rejects(`select volunteer_delete('${opp.id}', '  ')`, /Say why/);
  await one(`select volunteer_delete('${opp.id}', 'The book fair moved to spring.')`);
  assert.match(await told('u-p01', opp.id), /cancelled this volunteer opportunity: The book fair moved to spring\./);
  assert.match(await told('u-p03', opp.id), /moved to spring/);
  await as('u-p01');
  assert.equal((await one(`select delete_reason from volunteer_opportunities where id = '${opp.id}'`)).delete_reason, 'The book fair moved to spring.');
  await rejects(`select * from volunteer_send('${opp.id}', 'Oh no')`, /was deleted/);
  await as('u-p04');
  assert.equal((await rows(`select 1 from volunteer_opportunities where id = '${opp.id}'`)).length, 0, 'gone for everyone else');

  // Past opportunities don't take sign-ups.
  await asSuper();
  const past = await one(`insert into volunteer_opportunities (lead_id, title, starts_on) values ('${luis}', 'Field day', app.school_today() - 3) returning id`);
  await as('u-p01');
  await rejects(`select volunteer_say_yes('${past.id}')`, /is over/);

  await asSuper();
  await db.exec(`set role anon`);
  await rejects(`select * from volunteer_opportunities`, /permission denied/);
});

test('assistant: approved people read the directory; the server counts questions against a daily limit', async () => {
  const take = `select assistant_take_question(${id('u-p01')}) as q`;
  const asServer = async () => { await asSuper(); await db.exec('set role service_role'); };

  await as('u-p01');
  const contacts = await rows(`select name, email from assistant_contacts order by sort`);
  assert.ok(contacts.length >= 20);
  assert.equal(contacts.find((c) => c.name === 'Attendance')?.email, 'attendance@khroyals.com');
  assert.ok(!contacts.some((c) => c.email && !/^(info|attendance|admissions|oclary|lhunt)@khroyals\.com$/.test(c.email)),
    'only published school addresses');
  await rejects(take, /permission denied/);
  await rejects(`insert into assistant_contacts (name, title) values ('x', 'y')`, /permission denied/);
  await asSuper();
  await db.exec('set role anon');
  await rejects(`select * from assistant_contacts`, /permission denied/);

  // Two questions a day: the third is refused and not counted; a failed answer is given back.
  await asSuper();
  await db.exec(`update app.settings set value = '2' where key = 'assistant_daily_limit'`);
  await asServer();
  const first = (await one(take)).q;
  assert.equal(first.remaining, 1);
  assert.equal(first.model, 'claude-haiku-5-5');
  assert.equal((await one(take)).q.remaining, 0);
  await rejects(take, /asked the 2 questions you can ask today/);
  await one(`select assistant_finish(${id('u-p01')}, false)`);
  assert.equal((await one(take)).q.remaining, 0, 'a question given back can be asked again');
  await one(`select assistant_finish(${id('u-p01')}, true, 30000, 400, 29000, 0)`);
  await asSuper();
  const usage = await one(`select questions, input_tokens, cache_read_tokens from app.assistant_usage where user_id = ${id('u-p01')}`);
  assert.deepEqual([usage.questions, Number(usage.input_tokens), Number(usage.cache_read_tokens)], [2, 30000, 29000]);
  await db.exec(`update app.settings set value = '25' where key = 'assistant_daily_limit'`);
});
