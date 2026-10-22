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
/** The car line pickup spot (app.settings), as SQL arguments. */
const AT = '34.7264, -86.6177';

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
  await one(`select admin_link_guardian('00000000-0000-0000-0000-0000000000aa', ${id('u-s03')}, true, 'father')`);
  await asSuper();
  const vbFamily = await one(`select role from memberships where group_id = ${id('g-vb-parents')} and user_id = '00000000-0000-0000-0000-0000000000aa'`);
  assert.ok(vbFamily, 'linking a guardian adds them to their student\'s family groups');
});

test('admin tiers: one director; admin powers need an authenticator-verified session', async () => {
  await asSuper();
  assert.equal((await one(`select admin_tier from profiles where id = ${id('u-admin')}`)).admin_tier, 'director');
  await rejects(`update profiles set admin_tier = null where id = ${id('u-admin')}`, /at least one director/);

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
  await rejects(`select admin_set_access(${id('u-eng')}, 'director')`, /Make director/);
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

test('car line: parents announce from the pickup spot; staff see the line and confirm pickups', async () => {
  const uid = async (l: string) => (await one(`select ${id(l)} as u`)).u as string;
  const [ava, eng] = [await uid('u-s01'), await uid('u-eng')];
  const today = async (who: string) => { await as(who); return rows(`select * from carline_today()`); };
  // Open the line for today so this doesn't depend on when the tests run.
  await asSuper();
  await db.exec(`update app.settings set value = app.school_today()::text where key = 'carline_open_on'`);

  // Rosa Reyes (u-p01) is Ava's (u-s01) parent. She has to be at school (the pickup spot is AT).
  await as('u-p01');
  await rejects(`select * from carline_announce(null, null, null)`, /Turn on location/);
  await rejects(`select * from carline_announce(null, 34.80, -86.6177)`, /about 5\.1 miles from the pickup spot/);
  await rejects(`select * from carline_check_in()`, /Update KH Royals/);
  const [checkin] = await rows(`select * from carline_announce(null, ${AT})`);
  assert.equal(checkin.student_id, ava);
  assert.equal(checkin.status, 'waiting');
  assert.ok(checkin.distance_m <= 1);
  assert.equal((await rows(`select * from carline_announce(array[${id('u-s01')}], ${AT})`)).length, 1, 'announcing twice keeps one place in line');
  await rejects(`select * from carline_announce(array[${id('u-s02')}], ${AT})`, /own children/);
  await rejects(`insert into carline_pickups (student_id) values (${id('u-s02')})`, /permission denied/);
  // 100 m away is inside the 150 m radius.
  await as('u-p02');
  assert.equal((await rows(`select * from carline_announce(null, 34.7273, -86.6177, 10)`)).length, 1);
  await one(`select carline_cancel(id) from carline_pickups where guardian_id = ${id('u-p02')} and status = 'waiting'`);
  await as('u-s01');
  await rejects(`select * from carline_announce(null, ${AT})`, /Only parents/);

  // Other parents see only their own; every staff member sees the line and can confirm.
  assert.equal((await today('u-p02')).filter((r) => r.status === 'waiting').length, 0);
  assert.deepEqual((await today('u-sci')).filter((r) => r.status === 'waiting').map((r) => r.student_id), [ava]);
  await as('u-s05');
  await rejects(`select carline_confirm('${checkin.id}')`, /staff/);
  await as('u-sci');
  const board = (await one(`select carline_board() as b`)).b;
  assert.equal(board.find((b: any) => b.id === checkin.id).name.startsWith('Ava'), true);
  assert.match(board.find((b: any) => b.id === checkin.id).number, /^\d+$/, 'the board shows the pickup number');
  assert.deepEqual((await today('u-eng')).filter((r) => r.status === 'waiting').map((r) => r.student_id), [ava]);
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
  await asSuper();
  await db.exec(`update app.settings set value = null where key = 'carline_open_on'`);
});

test('car line leads: the office names them; they set the spot, radius, hours and numbers', async () => {
  const set = `select carline_set_config(34.7300, -86.6200, 200, '14:30', '15:30')`;
  await as('u-s01');
  await rejects(`select admin_set_carline_duty(${id('u-sci')}, true)`, /permission/);
  await as('u-sci');
  await rejects(set, /car line leads and the office/);
  await rejects(`select set_pickup_number(${id('u-s01')}, '7')`, /office or a car line lead/);
  await as('u-admin', true);
  await rejects(`select admin_set_carline_duty(${id('u-p02')}, true)`, /Only staff/);
  await one(`select admin_set_carline_duty(${id('u-sci')}, true)`);
  assert.equal((await one(`select carline_duty from admin_list_people() where id = ${id('u-sci')}`)).carline_duty, true);
  await as('u-sci');
  const cfg = (await one(`${set} as c`)).c;
  assert.equal(cfg.radius, 200);
  assert.equal(cfg.canEdit, true);
  await rejects(`select carline_set_config(34.73, -86.62, 5, '14:30', '15:30')`, /between 20 and 3,000/);
  await rejects(`select carline_set_config(34.73, -86.62, 200, '16:00', '15:00')`, /pickup hours/);
  assert.equal((await one(`select carline_open_now(true) as c`)).c.line.state, 'open');
  assert.equal((await one(`select carline_open_now(false) as c`)).c.line.openedNow ?? false, false);
  await one(`select set_pickup_number(${id('u-s01')}, '7a')`);
  assert.equal((await one(`select number from pickup_numbers where student_id = ${id('u-s01')}`)).number, '7A');
  await rejects(`select set_pickup_number(${id('u-s01')}, 'way too long!')`, /1–8 letters/);
  // Put things back for the other tests.
  await one(`select carline_set_config(34.7264, -86.6177, 150, '14:45', '15:30')`);
  await as('u-admin', true);
  await one(`select admin_set_carline_duty(${id('u-sci')}, false)`);
  await as('u-sci');
  await rejects(set, /car line leads and the office/);
});

test('pickup numbers: every student gets one; only staff and their parents can see it', async () => {
  await asSuper();
  assert.equal((await one(`select count(*)::int n from profiles p where school_role = 'student'
                           and not exists (select 1 from pickup_numbers n where n.student_id = p.id)`)).n, 0, 'all students numbered');
  await as('u-p01');
  const mine = await rows(`select * from pickup_numbers`);
  assert.ok(mine.length >= 1);
  assert.ok((await rows(`select 1 from pickup_numbers where student_id = ${id('u-s02')}`)).length === 0, "not other families' numbers");
  await as('u-s01');
  assert.equal((await rows(`select * from pickup_numbers`)).length, 0, 'students see none');
  await as('u-sci');
  assert.ok((await rows(`select * from pickup_numbers`)).length > 5, 'staff see all');
  await as('u-admin', true);
  const kid = (await one(`select admin_create_student('Noah', 'Park', 1) as id`)).id;
  assert.ok((await one(`select number from pickup_numbers where student_id = '${kid}'`)).number, 'new students get a number');
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
  await rejects(`select carline_arrived(35.0, -86.6)`, /from the pickup spot/);
  const first = (await one(`select carline_arrived(${AT}) as r`)).r;
  assert.equal(first.state, 'open');
  assert.deepEqual(first.names, ['Liam']);
  assert.deepEqual((await one(`select carline_arrived(${AT}) as r`)).r.checkedIn, [], 'arriving again adds nobody');
  assert.equal((await rows(`select via from carline_today() where status = 'waiting'`))[0].via, 'arrival');
  await as('u-eng');
  await one(`select carline_confirm('${first.checkedIn[0]}')`);
  await as('u-p02');
  assert.deepEqual((await one(`select carline_arrived(${AT}) as r`)).r.checkedIn, [], 'not again once picked up');

  await asSuper();
  await db.exec(`set role anon`);
  await rejects(`select carline_arrived(${AT})`, /permission denied/);
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

test('volunteer item requests: leaders ask for things, people pledge up to what is needed, change or take back pledges', async () => {
  const told = async (who: string, opp: string) => {
    await as(who);
    return (await rows(`select title || ' ' || body as t from my_notifications() where data->>'opportunityId' = '${opp}'`)).map((n) => n.t).join('\n');
  };
  const request = (item: string, quantity: string) =>
    `select * from volunteer_post('Classroom tissues', 'For every homeroom.', app.school_today() + 5, null, null, null, 'Front office', 3, 'items', ${item}, ${quantity})`;
  const pledged = async (opp: string) => Number((await one(`select coalesce(sum(quantity), 0) as n from volunteer_signups where opportunity_id = '${opp}'`)).n);

  // The demo Teacher (a Volunteer Leader in the seed) asks for 24 boxes; a request has no spots.
  await as('u-eng');
  await rejects(request(`'  '`, '24'), /Say what you need/);
  await rejects(request(`'boxes of tissues'`, 'null'), /how many you need/);
  const req = await one(request(`'boxes of tissues'`, '24'));
  assert.deepEqual([req.kind, req.item, req.quantity, req.spots], ['items', 'boxes of tissues', 24, null]);
  await rejects(`select volunteer_pledge('${req.id}', 2)`, /leading this one/);

  // Rosa pledges 10, then changes it to 12; it's one pledge, not two.
  await as('u-p01');
  await rejects(`select volunteer_say_yes('${req.id}')`, /how many you'll bring/);
  await rejects(`select volunteer_pledge('${req.id}', 0)`, /how many you'll bring/);
  await one(`select volunteer_pledge('${req.id}', 10)`);
  await one(`select volunteer_pledge('${req.id}', 12)`);
  assert.equal(await pledged(req.id), 12);
  assert.equal((await rows(`select 1 from volunteer_signups where opportunity_id = '${req.id}'`)).length, 1);

  // Wei can't pledge more than is still needed; then it's all pledged.
  await as('u-p02');
  await rejects(`select volunteer_pledge('${req.id}', 13)`, /Only 12 more needed/);
  await one(`select volunteer_pledge('${req.id}', 12)`);
  await as('u-p03');
  await rejects(`select volunteer_pledge('${req.id}', 1)`, /Everything's been pledged/);
  const leader = await told('u-eng', req.id);
  assert.match(leader, /will bring 10 boxes of tissues for Classroom tissues · 10 of 24 pledged/);
  assert.match(leader, /changed their pledge to 12/);
  assert.match(leader, /24 of 24 pledged/);

  // People who pledged get the chat.
  await as('u-p02');
  await one(`select * from volunteer_send('${req.id}', 'Dropping mine off Monday.')`);

  // Rosa takes hers back (the leader is told), which frees 12 for Dana.
  await as('u-p01');
  await one(`select volunteer_withdraw('${req.id}')`);
  assert.match(await told('u-eng', req.id), /won't bring the 12 boxes of tissues for Classroom tissues/);
  await as('u-p03');
  await one(`select volunteer_pledge('${req.id}', 5)`);
  assert.equal(await pledged(req.id), 17);

  // Opportunities for people's time don't take pledges, and a request needs its item and quantity.
  await as('u-eng');
  const help = await one(`select * from volunteer_post('Field day helpers', '', app.school_today() + 5)`);
  assert.equal(help.kind, 'help');
  await as('u-p01');
  await rejects(`select volunteer_pledge('${help.id}', 2)`, /takes sign-ups, not items/);
  await asSuper();
  await rejects(`insert into volunteer_opportunities (lead_id, title, starts_on, kind) values (${id('u-eng')}, 'Pens', app.school_today(), 'items')`,
    /volunteer_items_shape/);
});

test('ask the school: private questions, routed by the office, answered by staff, with follow-ups', async () => {
  const told = async (who: string, q: string, mfa = false) => {
    await as(who, mfa);
    return (await rows(`select title, body from my_notifications() where data->>'questionId' = '${q}'`)).map((n) => `${n.title} | ${n.body}`).join('\n');
  };

  // Rosa (u-p01) asks; routers (the director and administrators) are told.
  await as('u-p01');
  const q = await one(`select * from ask_school('Uniforms', 'Spirit shirts on Fridays?', 'Can students wear spirit shirts on Fridays?')`);
  assert.equal(q.status, 'new');
  assert.match(await told('u-admin', q.id), /New question: Spirit shirts on Fridays\? \| Rosa R\. · Uniforms/);

  // Only the asker, the assignee and (verified) routers see it.
  await as('u-p02');
  assert.equal((await rows(`select 1 from school_questions where id = '${q.id}'`)).length, 0);
  await rejects(`select * from question_reply('${q.id}', 'me too')`, /Only the person who asked/);
  await as('u-admin');
  assert.equal((await rows(`select 1 from school_questions where id = '${q.id}'`)).length, 0, 'routing needs the authenticator code');
  await rejects(`select * from question_assign('${q.id}', ${id('u-eng')})`, /MFA_REQUIRED/);
  await as('u-admin', true);
  assert.equal((await rows(`select 1 from school_question_messages where question_id = '${q.id}'`)).length, 1);
  await rejects(`select * from question_assign('${q.id}', ${id('u-p02')})`, /faculty or staff/);
  assert.equal((await one(`select * from question_assign('${q.id}', ${id('u-eng')})`)).status, 'assigned');
  assert.match(await told('u-eng', q.id), /Question for you: Spirit shirts on Fridays\?/);

  // The teacher answers; Rosa sees it and follows up, which starts the clock again.
  await as('u-sci');
  assert.equal((await rows(`select 1 from school_questions where id = '${q.id}'`)).length, 0, 'other teachers don\'t see it');
  await as('u-eng');
  await one(`select * from question_reply('${q.id}', 'Yes, every Friday.')`);
  const answered = await one(`select status, waiting_since from school_questions where id = '${q.id}'`);
  assert.deepEqual([answered.status, answered.waiting_since], ['answered', null]);
  assert.match(await told('u-p01', q.id), /The school answered: Spirit shirts on Fridays\? \| Jennifer T\.: Yes, every Friday\./);
  await as('u-p01');
  await one(`select * from question_reply('${q.id}', 'Even on game days?')`);
  const waiting = await one(`select status, waiting_since from school_questions where id = '${q.id}'`);
  assert.equal(waiting.status, 'assigned');
  assert.ok(waiting.waiting_since, 'waiting again');
  assert.match(await told('u-eng', q.id), /Follow-up: Spirit shirts on Fridays\? \| Rosa R\.: Even on game days\?/);

  // Closing: the asker can; someone unrelated can't. Writes only go through the functions.
  await as('u-p02');
  await rejects(`select question_close('${q.id}')`, /can't close/);
  await as('u-p01');
  await one(`select question_close('${q.id}')`);
  assert.equal((await one(`select status from school_questions where id = '${q.id}'`)).status, 'closed');
  await rejects(`insert into school_questions (asker_id, subject) values (${id('u-p01')}, 'x')`, /permission denied/);

  await asSuper();
  assert.ok((await rows(`select 1 from permission_catalog() where key = 'questions.manage'`)).length === 1);
  assert.ok((await one(`select 'questions.manage' = any (app.tier_permissions('office')) as ok`)).ok);
  await db.exec(`set role anon`);
  await rejects(`select * from school_questions`, /permission denied/);
});

test('directors: several allowed, never zero, and roles can change hands', async () => {
  await as('u-admin', true);
  await one(`select admin_set_director(${id('u-ap')}, true)`);
  await asSuper();
  assert.equal((await rows(`select 1 from profiles where admin_tier = 'director'`)).length, 2, 'two directors');
  await as('u-admin', true);
  await one(`select admin_set_director(${id('u-admin')}, false)`);  // step down while another director remains
  await asSuper();
  assert.equal((await one(`select admin_tier from profiles where id = ${id('u-admin')}`)).admin_tier, 'administrator');
  await as('u-ap', true);
  await rejects(`select admin_set_director(${id('u-ap')}, false)`, /at least one director/);
  await rejects(`select admin_update_profile(${id('u-ap')}, null)`, /Transfer the director|at least one director/);
  await asSuper();
  await rejects(`delete from auth.users where id = ${id('u-ap')}`, /at least one director/);  // a departing last director's account can't vanish
  await rejects(`select admin_set_director(${id('u-s01')}, true)`, /permission|staff/);
  await as('u-ap', true);
  await rejects(`select admin_set_director(${id('u-s01')}, true)`, /staff accounts/);
  await one(`select transfer_director(${id('u-admin')})`);  // hand back for the other tests
  await asSuper();
  assert.equal((await one(`select admin_tier from profiles where id = ${id('u-admin')}`)).admin_tier, 'director');
  assert.equal((await one(`select admin_tier from profiles where id = ${id('u-ap')}`)).admin_tier, 'administrator');
});

test('roles: directors create roles, assign them, and deleting removes the access', async () => {
  await as('u-ap', true);  // administrator
  await rejects(`select admin_save_role(null, 'Athletics', '', array['calendar.school'])`, /permission/);
  await as('u-admin', true);
  await rejects(`select admin_save_role(null, 'Bad', '', array['admins.manage'])`, /can't be given/);
  await rejects(`select admin_save_role('director', 'Director', '', array['push.send'])`, /can't be changed/);
  const r = await one(`select * from admin_save_role(null, 'Athletics Director', 'Runs sports', array['calendar.school', 'push.send'])`);
  assert.equal(r.id, 'athletics-director');
  await rejects(`select admin_save_role(null, 'Athletics Director', '', '{}')`, /already exists/);
  await one(`select admin_set_access(${id('u-vbcoach')}, 'athletics-director')`);
  await as('u-vbcoach', true);
  const access = (await one(`select my_access() as a`)).a;
  assert.equal(access.roleName, 'Athletics Director');
  assert.ok(access.permissions.includes('push.send'));
  await one(`insert into events (title, starts_on) values ('Homecoming game', '2026-10-30') returning id`);
  await rejects(`select * from admin_list_people()`, /permission/);
  await as('u-admin', true);
  await one(`select admin_save_role('athletics-director', 'Athletics Director', 'Runs sports', array['push.send'])`);
  await as('u-vbcoach', true);
  await rejects(`insert into events (title, starts_on) values ('Another', '2026-10-31')`, /row-level security/);
  await as('u-admin', true);
  await one(`select admin_delete_role('athletics-director')`);
  await rejects(`select admin_delete_role('director')`, /can't be deleted/);
  await asSuper();
  assert.equal((await one(`select admin_tier from profiles where id = ${id('u-vbcoach')}`)).admin_tier, null);
});

test('people list: paged, searchable, filterable', async () => {
  await as('u-admin', true);
  const page1 = await rows(`select * from admin_list_people(null, 'all', 10, 0)`);
  const page3 = await rows(`select * from admin_list_people(null, 'all', 10, 20)`);
  assert.equal(page1.length, 10);
  assert.ok(Number(page1[0].total) >= 25);
  assert.equal(page3.length, Math.min(10, Number(page1[0].total) - 20));
  assert.ok(!page1.some((p) => page3.some((q) => q.id === p.id)), 'pages don\'t overlap');
  const parents = await rows(`select * from admin_list_people(null, 'parents', 50, 0)`);
  assert.ok(parents.length >= 8 && parents.every((p) => p.school_role === 'parent'));
  const found = await rows(`select * from admin_list_people('reyes', 'all', 25, 0)`);
  assert.ok(found.length >= 1 && found.every((p) => /reyes/i.test(`${p.first_name} ${p.last_name} ${p.email}`)));
  const staff = await rows(`select * from admin_list_people(null, 'staff', 100, 0)`);
  const eng = (await one(`select ${id('u-eng')} as u`)).u;
  assert.equal(staff.find((p) => p.id === eng)?.carline_duty, true, 'duty flags come with each person');
});

test('profile settings: your own photo, name and push choices', async () => {
  const uid = async (l: string) => (await one(`select ${id(l)} as u`)).u as string;
  const [rosa, wei] = [await uid('u-p01'), await uid('u-p02')];
  const put = (who: string, path: string) => `insert into storage.objects (bucket_id, name, owner) values ('avatars', '${path}', '${who}')`;

  // Photos: upload only into your own folder, point your profile at it, everyone approved can see it.
  await as('u-p01');
  await db.exec(put(rosa, `${rosa}/me.jpg`));
  await rejects(put(rosa, `${wei}/me.jpg`), /row-level security/);
  await one(`select set_my_avatar('${rosa}/me.jpg')`);
  await rejects(`select set_my_avatar('${wei}/me.jpg')`, /isn't yours/);
  await as('u-s01');
  assert.equal((await one(`select avatar_url from profiles where id = '${rosa}'`)).avatar_url, `${rosa}/me.jpg`);
  assert.equal((await rows(`select 1 from storage.objects where bucket_id = 'avatars'`)).length, 1);
  await rejects(`select admin_clear_avatar('${rosa}')`, /permission/);
  await as('u-admin', true);
  await one(`select admin_clear_avatar('${rosa}')`);
  assert.equal((await one(`select avatar_url from profiles where id = '${rosa}'`)).avatar_url, null);

  // Names: your own only, never blank.
  await as('u-p01');
  await rejects(`select update_my_profile(' ', 'Reyes')`, /first and last name/);
  await one(`select update_my_profile('Rosie', 'Reyes')`);
  assert.equal((await one(`select first_name from profiles where id = '${rosa}'`)).first_name, 'Rosie');
  await rejects(`update profiles set first_name = 'X' where id = '${wei}'`, /permission denied/);

  // Push settings: private, and they decide which notifications reach the phone.
  await one(`select * from update_my_settings(false, true, true)`);
  await rejects(`select * from update_my_settings(true, true, true, '21:00', null)`, /both/);
  await as('u-p02');
  assert.equal((await rows(`select * from user_settings`)).length, 0, "can't see other people's settings");
  await rejects(`insert into user_settings (user_id) values ('${wei}')`, /permission denied/);

  await asSuper();
  const wants = async (n: string, at = 'now()') => (await one(`select app.wants_push(n, '${rosa}', ${at}) as w from notifications n where id = '${n}'`)).w;
  const group = await one(`insert into notifications (audience, group_id, title, body) values ('group', ${id('g-vb')}, 'VB', 'Practice') returning id`);
  const school = await one(`insert into notifications (audience, title, body, urgent) values ('everyone', 'Closed', 'Snow day', true) returning id`);
  const market = await one(`insert into notifications (audience, user_id, title, body, data, urgent) values ('user', '${rosa}', 'Offer', 'x', '{"listingId": "1"}', true) returning id`);
  assert.equal(await wants(group.id), false, 'group pushes turned off');
  assert.equal(await wants(school.id), true, 'school announcements always push');
  assert.equal(await wants(market.id), true);
  await as('u-p01');
  await one(`select * from update_my_settings(true, false, true, '21:00', '07:00')`);
  await asSuper();
  assert.equal(await wants(market.id), false, 'marketplace pushes turned off');
  const night = `'2026-10-16 23:30:00-05'::timestamptz`, noon = `'2026-10-16 12:00:00-05'::timestamptz`;
  assert.equal(await wants(group.id, night), false, 'quiet hours (overnight window)');
  assert.equal(await wants(group.id, noon), true);
  assert.equal(await wants(school.id, night), true, 'announcements ignore quiet hours');
  await db.exec(`delete from notifications where id in ('${group.id}', '${school.id}', '${market.id}'); delete from user_settings;`);
});

test('car screen: a parent\'s car pass shows and checks in only their own children', async () => {
  // (The auto check-in test above opened the line all day, every day.)
  await as('u-s01');
  await rejects(`select create_car_pass()`, /for parents/);
  await as('u-p04');
  const pass = (await one(`select create_car_pass() as t`)).t as string;
  assert.ok(pass.length >= 64);

  await asSuper();
  await db.exec(`set role anon`);
  await rejects(`select create_car_pass()`, /permission denied/);
  await rejects(`select car_carline_status('not-a-pass')`, /sign in again/);
  const before = (await one(`select car_carline_status('${pass}') as s`)).s;
  assert.equal(before.line.state, 'open');
  assert.ok(before.children.length >= 1, 'their children');
  assert.ok(before.children.every((c: any) => c.status === 'none'));
  await rejects(`select car_carline_check_in('${pass}', 35.0, -86.6)`, /from the pickup spot/);
  const after = (await one(`select car_carline_check_in('${pass}', ${AT}) as s`)).s;
  assert.ok(after.children.every((c: any) => c.status === 'waiting' && c.position >= 1), 'checked in, with a place in line');

  // The pass can't be used for anything else, and its owner was the one who checked in.
  await rejects(`select * from carline_today()`, /permission denied/);
  await asSuper();
  const parent = (await one(`select ${id('u-p04')} as u`)).u;
  const rows_ = await rows(`select guardian_id from carline_pickups where day = app.school_today() and guardian_id = '${parent}'`);
  assert.equal(rows_.length, after.children.length);
  assert.equal((await one(`select current_setting('request.jwt.claim.sub', true) as s`)).s, '', 'no leftover identity');

  // Sign-out revokes it; so does losing access.
  await db.exec(`set role anon`);
  await one(`select revoke_car_pass('${pass}')`);
  await rejects(`select car_carline_status('${pass}')`, /sign in again/);
});

test('post stats: views are counted once per person and only the author and moderators see them', async () => {
  const vb = id('g-vb');
  await as('u-vbcoach');
  const post = await one(`select id from create_post(${vb}, 'announcement', 'Uniforms are in the gym office', 'Uniform pickup')`);
  // Teammates see it (twice in a row counts once); the author's own views don't count.
  for (const who of ['u-s05', 'u-s05', 'u-vbcoach']) {
    await as(who);
    await one(`select record_post_views(array['${post.id}'::uuid])`);
  }
  await as('u-s05');
  await one(`select toggle_reaction('${post.id}', '👍')`).catch(() => null);
  await rejects(`select post_stats('${post.id}')`, /author and the group's moderators/);
  await rejects(`select * from post_views`, /permission denied/);
  // Someone outside the group can't record a view of it.
  await as('u-p02');
  await one(`select record_post_views(array['${post.id}'::uuid])`);

  await as('u-vbcoach');
  const st = (await one(`select post_stats('${post.id}') as s`)).s;
  assert.equal(st.viewers, 1, 'one person saw it');
  assert.equal(st.views, 1);
  assert.ok(st.audience >= st.viewers, 'out of the group');
  assert.equal(st.seenBy.length, 1);
  assert.equal(st.followers, 1, 'the author follows their post');
  const list = await rows(`select * from group_post_stats(${vb})`);
  assert.equal(Number(list.find((r) => r.post_id === post.id)?.viewers), 1);
  await as('u-admin', true);
  assert.equal((await one(`select post_stats('${post.id}') as s`)).s.viewers, 1, 'admins who manage groups see it too');
});

test('replies notify followers, who can unfollow; settings decide what pushes', async () => {
  const vb = id('g-vb');
  const uid = async (l: string) => (await one(`select ${id(l)} as u`)).u as string;
  const [coach, s05] = [await uid('u-vbcoach'), await uid('u-s05')];
  // The seed gives this group student quiet hours (10 PM–6 AM); lift them so the test passes at any hour.
  await asSuper();
  const settings = (await one(`select settings from groups where id = ${vb}`)).settings;
  await db.query(`update groups set settings = settings - 'quietHours' where id = ${vb}`);
  await as('u-vbcoach');
  const post = await one(`select id from create_post(${vb}, 'message', 'Who can bring water Friday?')`);
  await as('u-s05');
  await one(`select add_comment('${post.id}', 'I can!')`);
  await asSuper();
  const toCoach = await rows(`select * from notifications where post_id = '${post.id}' and audience = 'user'`);
  assert.deepEqual(toCoach.map((n) => n.user_id), [coach], 'the author hears about the reply; the replier does not');
  assert.equal(toCoach[0].data.reply, true);
  await as('u-vbcoach');
  assert.equal((await rows(`select * from my_notifications() where post_id = '${post.id}' and audience = 'user'`)).length, 1);

  // The replier now follows too; the coach's answer reaches them, until they unfollow.
  await one(`select add_comment('${post.id}', 'Thanks!')`);
  await asSuper();
  assert.equal((await rows(`select 1 from notifications where post_id = '${post.id}' and user_id = '${s05}'`)).length, 1);
  await as('u-s05');
  await one(`select set_post_follow('${post.id}', false)`);
  await as('u-vbcoach');
  await one(`select add_comment('${post.id}', 'See you Friday')`);
  await asSuper();
  assert.equal((await rows(`select 1 from notifications where post_id = '${post.id}' and user_id = '${s05}'`)).length, 1, 'unfollowed');

  // Opening a notification is counted for its sender.
  await as('u-vbcoach');
  const mine = (await rows(`select id from my_notifications() where post_id = '${post.id}'`)).map((n) => n.id);
  await one(`select mark_notifications_opened(array[${mine.map((x) => `'${x}'::uuid`).join(',')}])`);
  assert.equal((await rows(`select * from notification_opens`)).length, mine.length);

  // Push choices: replies and non-urgent school notifications can be turned off; urgent ones can't.
  await as('u-p01');
  await one(`select * from update_my_settings(true, true, true, null, null, false, false)`);
  await as('u-admin', true);
  const normal = await one(`select * from send_notification('Spirit week', 'Wear blue Friday.', 'roles', null, array['parent'])`);
  const urgent = await one(`select * from send_notification('Closed', 'Snow day tomorrow.', 'roles', null, array['parent'], true)`);
  const counts = await rows(`select * from notification_open_counts(array['${normal.id}'::uuid])`);
  assert.equal(Number(counts[0].opened), 0);
  await asSuper();
  const rosa = await uid('u-p01');
  const wants = async (n: string) => (await one(`select app.wants_push(n, '${rosa}') as w from notifications n where id = '${n}'`)).w;
  assert.equal(await wants(normal.id), false, 'school notifications turned off');
  assert.equal(await wants(urgent.id), true, 'urgent ones still come through');
  assert.equal(await wants(toCoach[0].id), false, 'replies turned off');
  await db.exec(`delete from user_settings`);
  await db.query(`update groups set settings = $1 where id = ${vb}`, [settings]);
});

test('inbox: delete one notification or clear them all (only for yourself)', async () => {
  await as('u-admin', true);
  const a = await one(`select * from send_notification('Picture day', 'Smile!', 'roles', null, array['parent'])`);
  const b = await one(`select * from send_notification('Book fair', 'Next week.', 'roles', null, array['parent'])`);
  const inbox = async (who: string) => { await as(who); return (await rows(`select id from my_notifications()`)).map((n) => n.id); };
  assert.ok((await inbox('u-p05')).includes(a.id));
  await as('u-p05');
  await one(`select dismiss_notifications(array['${a.id}'::uuid])`);
  assert.ok(!(await inbox('u-p05')).includes(a.id), 'deleted for them');
  assert.ok((await inbox('u-p05')).includes(b.id));
  assert.ok((await inbox('u-p06')).includes(a.id), 'still there for everyone else');
  await as('u-p05');
  assert.ok((await one(`select clear_my_notifications() as n`)).n >= 1);
  assert.equal((await inbox('u-p05')).length, 0, 'cleared');
  await rejects(`select * from notification_dismissals`, /permission denied/);
  await as('u-admin', true);
  assert.equal((await rows(`select 1 from notifications where id in ('${a.id}', '${b.id}')`)).length, 2, 'the sender\'s history keeps them');
});

test('marketplace: sellers delete posts at any stage, and people in line are told', async () => {
  const told = async (who: string, listing: string) => {
    await as(who);
    return (await rows(`select body from my_notifications() where data->>'listingId' = '${listing}'`)).map((n) => n.body).join('\n');
  };
  // (Rosa, Wei and Dana accepted the terms in the marketplace test.)
  await as('u-p01');
  const open = await one(`select * from market_post('Backpack', '', 800, 1, 'good')`);
  const pending = await one(`select * from market_post('Blazer', '', 2500, 1, 'good')`);
  const sold = await one(`select * from market_post('Tie', '', 500, 1, 'new')`);
  await as('u-p03');
  await one(`select * from market_dibs('${open.id}')`);
  await as('u-p02');
  const line = await one(`select * from market_dibs('${pending.id}')`);
  await one(`select * from market_dibs('${sold.id}')`);
  await as('u-p01');
  await one(`select market_select('${line.id}')`);
  const soldLine = (await one(`select id from market_responses where listing_id = '${sold.id}'`)).id;
  await one(`select market_select('${soldLine}')`);
  await one(`select market_complete('${sold.id}')`);

  for (const l of [open, pending, sold]) await one(`select market_remove('${l.id}')`);
  assert.deepEqual((await rows(`select status from market_listings where id in ('${open.id}', '${pending.id}', '${sold.id}')`)).map((r) => r.status),
    ['removed', 'removed', 'removed']);
  await rejects(`select market_remove('${open.id}')`, /No such post/);
  assert.match(await told('u-p03', open.id), /took this post down/);
  assert.match(await told('u-p02', pending.id), /sale is off/);
  assert.doesNotMatch(await told('u-p02', sold.id), /No longer available|took this post down/, 'a finished sale needs no notice');
});

test('children: the office adds them, parents ask for more, grades move up each year', async () => {
  // Grades follow the graduation year; the school year starts July 1.
  await asSuper();
  const g = async (classOf: number, day: string) => (await one(`select app.grade_for_class(${classOf}, '${day}') as g`)).g;
  assert.equal(await g(2030, '2026-10-17'), 9, 'Class of 2030 is in 9th grade in 2026–27');
  assert.equal(await g(2030, '2027-06-30'), 9, 'same school year until July');
  assert.equal(await g(2030, '2027-07-01'), 10, 'moves up on July 1');
  assert.equal((await one(`select app.grade_label(-3) as l`)).l, 'K2');

  // The office adds a child with no login and links a parent (a teacher can be a parent too).
  await as('u-p05');
  await rejects(`select admin_create_student('Ella', 'Kim', 2)`, /permission/);
  await as('u-admin', true);
  const ella = (await one(`select admin_create_student('Ella', 'Kim', 2, '2018-04-02', ${id('u-p05')}, 'mother') as id`)).id;
  await one(`select admin_link_guardian(${id('u-eng')}, '${ella}', true, 'father')`);
  await rejects(`select admin_link_guardian(${id('u-s01')}, '${ella}')`, /approved adults/);
  await rejects(`select admin_link_guardian(${id('u-p05')}, ${id('u-p06')})`, /must be students/);
  const row = await one(`select * from profiles where id = '${ella}'`);
  assert.equal(row.managed, true);
  assert.equal(row.school_role, 'student');
  assert.equal(row.grade, 2);
  assert.ok(row.class_of > 2030, 'class year stored');
  assert.equal((await one(`select count(*)::int n from admin_list_students('ella kim')`)).n, 1);

  // Parents see their child and edit photo, bio, birthday and allergies directly.
  await as('u-p05');
  const kid = (await one(`select my_children() as k`)).k.find((k: any) => k.id === ella);
  assert.equal(kid.firstName, 'Ella');
  assert.equal(kid.gradeLabel, '2nd');
  assert.equal(kid.parents.length, 2);
  await one(`select update_child_details('${ella}', '2018-04-02', 'Loves art', 'Peanuts', '')`);
  await one(`select set_child_photo('${ella}', 'children/${ella}/me.jpg')`);
  // Another child's folder: change the first character (to one it isn't already).
  const other = ella.replace(/^./, (c: string) => (c === '0' ? '1' : '0'));
  await rejects(`select set_child_photo('${ella}', 'children/${other}/x.jpg')`, /isn't in this child's folder/);
  // Other parents can't see the details or change anything.
  await as('u-p06');
  assert.equal((await rows(`select * from student_details`)).length, 0);
  await rejects(`select update_child_details('${ella}', null, '', '', '')`, /Only this child's parents/);
  await rejects(`insert into storage.objects (bucket_id, name, owner) values ('avatars', 'children/${ella}/x.jpg', ${id('u-p06')})`, /row-level security/);
  // Staff can read allergies.
  await as('u-sci');
  assert.equal((await one(`select allergies from student_details where student_id = '${ella}'`)).allergies, 'Peanuts');

  // Parents ask; the office approves or declines, and they're told.
  await as('u-p06');
  await rejects(`select request_child_edit('${ella}', 'Ella', 'Kim', 3)`, /Only this child's parents/);
  const add = await one(`select * from request_child('Max', 'Ortiz', -1, null, 'Starting in January', 'mother')`);
  await as('u-p05');
  const edit = await one(`select * from request_child_edit('${ella}', 'Ella', 'Kim-Lee', 2)`);
  await as('u-s01');
  await rejects(`select request_child('X', 'Y', 1)`, /approved parents/);
  await as('u-admin', true);
  const queue = (await one(`select admin_family_requests() as q`)).q;
  assert.deepEqual(queue.map((r: any) => r.kind).sort(), ['add_child', 'edit_child']);
  const max = (await one(`select admin_decide_family_request('${add.id}', true) as id`)).id;
  await one(`select admin_decide_family_request('${edit.id}', false, null, 'Please call the office.')`);
  await rejects(`select admin_decide_family_request('${add.id}', true)`, /already handled/);
  await as('u-p06');
  const theirs = (await one(`select my_children() as k`)).k;
  assert.ok(theirs.some((k: any) => k.id === max && k.gradeLabel === 'K4'));
  assert.ok((await rows(`select body from my_notifications() where data ? 'children'`)).length >= 1);
  await as('u-p05');
  assert.match((await rows(`select body from my_notifications() where data ? 'children'`)).map((n) => n.body).join(), /call the office/);
  assert.equal((await one(`select last_name from profiles where id = '${ella}'`)).last_name, 'Kim', 'declined edits change nothing');

  // Children without a login can be removed; accounts can't be removed this way.
  await as('u-admin', true);
  await rejects(`select admin_delete_student(${id('u-s01')})`, /without their own login/);
  await one(`select admin_delete_student('${max}')`);
  assert.equal((await rows(`select 1 from profiles where id = '${max}'`)).length, 0);
});

test('sports: managers add sports, coaches run seasons and sign-ups, and everyone involved hears about the schedule', async () => {
  const told = async (who: string, sport: string) => {
    await as(who);
    return (await rows(`select title, body from my_notifications() where data->>'sportId' = '${sport}' order by created_at`))
      .map((n) => `${n.title} | ${n.body}`).join('\n');
  };
  const at = (days: number) => `date_trunc('day', now()) + interval '${days} days 16 hours'`;  // the same in every statement
  await asSuper();
  await db.exec(`update profiles set grade = 10 where id = ${id('u-s02')}`);  // Liam, whatever earlier tests set

  // Sports managers (authenticator-verified) add sports and coaches; teachers can't.
  await as('u-vbcoach');
  await rejects(`select * from sport_save(null, 'Volleyball', '🏐', '')`, /permission/);
  await as('u-admin');
  await rejects(`select * from sport_save(null, 'Volleyball', '🏐', '')`, /MFA_REQUIRED/);
  await as('u-admin', true);
  const vb = await one(`select * from sport_save(null, 'Volleyball', '🏐', 'Grades 6–12')`);
  await rejects(`select * from sport_save(null, 'Volleyball', '🏐', '')`, /already an activity called Volleyball/);
  await one(`select sport_set_coach('${vb.id}', ${id('u-vbcoach')}, true)`);
  await rejects(`select sport_set_coach('${vb.id}', ${id('u-p01')}, true)`, /faculty and staff/);

  // Rosa follows; then the coach (no authenticator code needed) opens a season and followers are told, once.
  await as('u-p01');
  await one(`select sport_follow('${vb.id}', true)`);
  await as('u-vbcoach');
  const season = await one(`select * from season_save(null, '${vb.id}', 'Fall 2026', app.school_today() - 10, app.school_today() + 40,
    app.school_today() - 1, app.school_today() + 5, 6, 12, 'Practice Mon–Thu 3:30', 'https://www.khroyals.com/s/2026-Volleyball-Season.pdf')`);
  assert.match(await told('u-p01', vb.id), /🏐 Volleyball: sign-ups are open \| Fall 2026 · sign up by /);
  await asSuper();
  assert.equal((await one(`select app.announce_sport_signups() as n`)).n, 0, 'announced only once');
  await as('u-vbcoach');
  const varsity = await one(`select * from season_save(null, '${vb.id}', 'Varsity', app.school_today(), app.school_today() + 40,
    app.school_today(), app.school_today() + 5, 11, 12)`);
  const closed = await one(`select * from season_save(null, '${vb.id}', 'Summer camp', app.school_today() - 90, app.school_today() - 60,
    app.school_today() - 120, app.school_today() - 100)`);
  await rejects(`select * from season_save(null, '${vb.id}', 'Bad', app.school_today(), app.school_today() - 1)`, /end on or after it starts/);

  // Parents sign up their own children, within the grades and the window; the coach is told.
  await as('u-p02');
  await rejects(`select * from sport_register('${season.id}', ${id('u-s01')})`, /own children/);
  await rejects(`select * from sport_register('${varsity.id}', ${id('u-s02')})`, /Varsity is for 11th–12th grade/);
  await rejects(`select * from sport_register('${closed.id}', ${id('u-s02')})`, /aren't open/);
  const liam = await one(`select * from sport_register('${season.id}', ${id('u-s02')}, 'Played club ball')`);
  assert.equal(liam.status, 'pending');
  await rejects(`select * from sport_register('${season.id}', ${id('u-s02')})`, /already signed up/);
  assert.match(await told('u-vbcoach', vb.id), /🏐 Volleyball: new sign-up \| Liam Chen for Fall 2026 \(from Wei C\.\)/);

  // Other families can't see it; another teacher can't decide; the coach approves and Wei is told.
  await as('u-p01');
  assert.equal((await rows(`select 1 from sport_registrations where id = '${liam.id}'`)).length, 0);
  await as('u-sci');
  await rejects(`select * from sport_decide('${liam.id}', true)`, /permission/);
  await as('u-vbcoach');
  assert.equal((await one(`select * from sport_decide('${liam.id}', true, 'Welcome!')`)).status, 'registered');
  assert.match(await told('u-p02', vb.id), /🏐 Volleyball: Liam is registered \| Fall 2026 · Welcome!/);

  // Involved: Wei and Liam through the registration, Rosa by following; Priya isn't.
  await as('u-p02');
  assert.deepEqual(await rows(`select following, registered from my_sports()`), [{ following: false, registered: true }]);
  await as('u-s02');
  assert.deepEqual(await rows(`select following, registered from my_sports()`), [{ following: false, registered: true }]);
  await as('u-p01');
  assert.deepEqual(await rows(`select following, registered from my_sports()`), [{ following: true, registered: false }]);
  await as('u-p07');
  assert.equal((await rows(`select * from my_sports()`)).length, 0);

  // A game added, moved and cancelled: everyone involved hears; the coach who changed it doesn't.
  await as('u-vbcoach');
  const game = await one(`select * from sport_event_save(null, '${season.id}', 'game', 'vs. Westminster', ${at(2)}, null, 'KH Gym', true)`);
  await one(`select * from sport_event_save('${game.id}', null, 'game', 'vs. Westminster', ${at(2)}, null, 'KH Gym', true, 'Wear white')`);
  await one(`select * from sport_event_save('${game.id}', null, 'game', 'vs. Westminster', ${at(3)}, null, 'KH Gym', true, 'Wear white')`);
  await one(`select * from sport_event_cancel('${game.id}')`);
  for (const who of ['u-p01', 'u-p02', 'u-s02']) {
    const heard = await told(who, vb.id);
    assert.match(heard, /🏐 Volleyball: new game \| vs\. Westminster · .+ · KH Gym/, who);
    assert.match(heard, /🏐 Volleyball: game changed/, who);
    assert.match(heard, /🏐 Volleyball: cancelled/, who);
    assert.equal((heard.match(/game changed/g) ?? []).length, 1, 'a notes-only edit is quiet');
  }
  assert.doesNotMatch(await told('u-vbcoach', vb.id), /new game/);
  assert.equal(await told('u-p07', vb.id), '');

  // Their schedule lists it; Priya's is empty.
  await as('u-p02');
  assert.deepEqual(await rows(`select title, cancelled from my_sport_schedule()`), [{ title: 'vs. Westminster', cancelled: true }]);
  await as('u-p07');
  assert.equal((await rows(`select * from my_sport_schedule()`)).length, 0);

  // Withdrawing a registered child tells the coach; unfollowing ends Rosa's involvement.
  await as('u-p02');
  await one(`select sport_withdraw('${liam.id}')`);
  assert.match(await told('u-vbcoach', vb.id), /sign-up withdrawn \| Liam Chen · Fall 2026/);
  await as('u-p01');
  await one(`select sport_follow('${vb.id}', false)`);
  assert.equal((await rows(`select * from my_sports()`)).length, 0);

  // Everyone, signed out too, sees sports and schedules; sign-ups and follows stay private; writes only via functions.
  await rejects(`insert into sport_follows (sport_id, user_id) values ('${vb.id}', ${id('u-p01')})`, /permission denied/);
  await asSuper();
  assert.ok('sports.manage' === (await one(`select key from permission_catalog() where key = 'sports.manage'`)).key);
  assert.ok((await one(`select 'sports.manage' = any (app.tier_permissions('administrator')) as ok`)).ok);
  assert.ok(!(await one(`select 'sports.manage' = any (app.tier_permissions('office')) as ok`)).ok);
  await db.exec(`set role anon`);
  assert.equal((await rows(`select 1 from sports`)).length, 1);
  assert.equal((await rows(`select 1 from sport_events`)).length, 1);
  await rejects(`select * from sport_registrations`, /permission denied/);
  await rejects(`select * from sport_follows`, /permission denied/);
});

test('activities: sports, theater, music, art and clubs, each with its own kinds of schedule items', async () => {
  await as('u-admin', true);
  const musical = await one(`select * from sport_save(null, 'Spring Musical', '🎭', 'Auditions in January', 'theater')`);
  assert.equal(musical.category, 'theater');
  assert.equal((await one(`select * from sport_save(null, 'Robotics', '🤖', '')`)).category, 'sports', 'sports unless chosen');
  await rejects(`select * from sport_save(null, 'Chess', '♟️', '', 'games')`, /Pick Sports, Theater, Music, Art or Clubs/);
  const moved = await one(`select * from sport_save((select id from sports where name = 'Robotics'), 'Robotics', '🤖', 'Team 4021', 'clubs')`);
  assert.equal(moved.category, 'clubs');

  const season = await one(`select * from season_save(null, '${musical.id}', '2027 season', app.school_today(), app.school_today() + 90)`);
  for (const kind of ['audition', 'rehearsal', 'performance']) {
    const e = await one(`select * from sport_event_save(null, '${season.id}', '${kind}', 'Beauty and the Beast', now() + interval '5 days')`);
    assert.equal(e.kind, kind);
  }
  await rejects(`select * from sport_event_save(null, '${season.id}', 'recital', 'Nope', now())`, /isn't a kind of schedule item/);
  await rejects(`select * from sport_event_save(null, '${season.id}', 'rehearsal', 'Late', now(), now() - interval '1 hour')`, /end time must be after/);
  await rejects(`select * from season_save(null, '${musical.id}', repeat('x', 81), app.school_today(), app.school_today())`, /up to 80 characters/);
  await rejects(`select * from season_save(null, '${musical.id}', 'Odd', app.school_today(), app.school_today(), app.school_today(), null)`, /both an opening and a closing date/);

  await asSuper();
  assert.equal((await one(`select label from permission_catalog() where key = 'sports.manage'`)).label, 'Manage activities');
  await db.exec(`set role anon`);
  assert.ok((await rows(`select category from sports where category = 'theater'`)).length >= 1, 'anyone sees categories');
});

test('family accounts: pick up linked children, volunteer and follow activities; no groups, child details, Marketplace or questions', async () => {
  const uid = async (l: string) => (await one(`select ${id(l)} as u`)).u as string;
  const [gran, ava] = [await uid('u-gran'), await uid('u-s01')];
  await asSuper();
  await db.query(`insert into auth.users (id, email, raw_user_meta_data) values ('${gran}', 'gran@demo.khroyals.test', $1)`,
    [{ first_name: 'June', last_name: 'Reyes' }]);
  await db.exec(`update app.settings set value = app.school_today()::text where key = 'carline_open_on'`);

  // The office approves her as Family and links her to Ava. It's a pickup link, not a parent link.
  await as('u-admin', true);
  await one(`select admin_update_profile('${gran}', 'family')`);
  await one(`select admin_link_guardian('${gran}', '${ava}')`);
  assert.equal((await rows(`select id from admin_list_people(null, 'family')`)).map((p) => p.id).join(), gran);
  const listed = (await one(`select parents from admin_list_students('June')`)).parents;
  assert.ok(listed.some((a: any) => a.id === gran && a.family === true), 'the Students tab shows her as family');
  await rejects(`select admin_set_access('${gran}', null, array['push.send'])`, /Family accounts/);
  await rejects(`select admin_set_volunteer_lead('${gran}', true)`, /parents or staff/);
  await asSuper();
  assert.equal(await one(`select 1 from guardians where guardian_id = '${gran}'`), undefined);

  // Car line: only Ava, from the pickup spot, with her pickup number but none of her private details.
  await as('u-gran');
  const kids = (await one(`select my_children() as k`)).k;
  assert.deepEqual(kids.map((k: any) => k.id), [ava]);
  assert.ok(kids[0].pickupNumber, 'her pickup number');
  assert.equal(kids[0].allergies, undefined, 'no allergies or medical notes');
  assert.equal((await rows(`select * from pickup_numbers`)).length, 1);
  await rejects(`select * from carline_announce(array[${id('u-s02')}], ${AT})`, /own children/);
  const [pickup] = await rows(`select * from carline_announce(null, ${AT})`);
  assert.equal(pickup.student_id, ava);
  assert.ok((await rows(`select * from carline_today()`)).every((r) => r.student_id === ava), 'she sees only Ava in the line');
  await one(`select carline_cancel('${pickup.id}')`);
  assert.ok(((await one(`select create_car_pass() as t`)).t as string).length >= 64, 'the car screen works for her too');

  // No Royals Connect, student details, Marketplace, family requests or Ask the School.
  assert.equal((await rows(`select id from groups`)).length, 0);
  assert.equal((await can('u-gran', 'g-announce', 'viewContent')).allowed, false);
  await as('u-gran');
  await rejects(`select join_group(${id('g-announce')})`, /Family accounts/);
  assert.equal((await rows(`select * from student_details`)).length, 0);
  assert.equal((await rows(`select * from market_listings`)).length, 0);
  await rejects(`select * from request_child('New', 'Kid', 3)`, /Only approved parents and staff/);
  await rejects(`select * from ask_school('Other', 'Bus times', 'When does the bus leave?')`, /Family accounts/);
  await asSuper();
  await rejects(`insert into memberships (group_id, user_id, role, source) values (${id('g-announce')}, '${gran}', 'member', 'self')`, /Family accounts/);
  assert.equal(await one(`select 1 from app.rule_targets(${id('g-announce')}) where user_id = '${gran}'`), undefined);

  // Activities: she can follow, but only parents sign children up.
  const vb = await one(`select id from sports where name = 'Volleyball'`);
  const season = await one(`select id from sport_seasons where sport_id = '${vb.id}' limit 1`);
  await as('u-gran');
  await one(`select sport_follow('${vb.id}', true)`);
  assert.equal((await rows(`select * from my_sports()`)).some((s: any) => s.sport_id === vb.id || s.sportId === vb.id), true);
  await rejects(`select * from sport_register('${season.id}', '${ava}')`, /own children/);

  // Volunteer: she says yes and joins that opportunity's chat.
  await as('u-p05');
  const opp = await one(`select * from volunteer_post('Field day helpers', 'Run a station.', app.school_today() + 7, null, '09:00', '11:00', 'Field', 5)`);
  await as('u-gran');
  await one(`select volunteer_say_yes('${opp.id}')`);
  await one(`select * from volunteer_send('${opp.id}', 'Happy to run the ring toss.')`);
  assert.equal((await rows(`select body from volunteer_messages where opportunity_id = '${opp.id}'`)).length, 1);

  // Changing her role takes the pickup links away; approving her as a parent doesn't make her Ava's parent.
  await as('u-admin', true);
  await one(`select admin_update_profile('${gran}', 'parent')`);
  await asSuper();
  assert.equal(await one(`select 1 from family_pickups where family_id = '${gran}'`), undefined);
  await as('u-gran');
  assert.deepEqual((await one(`select my_children() as k`)).k, []);
});

test('car line vehicles: your own, the last one used is the default, and staff see it on the board', async () => {
  const rosa = id('u-p01');
  await as('u-s01');
  await rejects(`select * from vehicle_save(null, 'Honda', 'suv', 'silver')`, /adults who pick children up/);
  await as('u-p01');
  await rejects(`select * from vehicle_save(null, '  ', 'suv', 'silver')`, /make/);
  await rejects(`select * from vehicle_save(null, 'Honda', 'spaceship', 'silver')`, /vehicle type/);
  await rejects(`select * from vehicle_save(null, 'Honda', 'suv', 'plaid')`, /vehicle color/);
  const suv = await one(`select * from vehicle_save(null, ' Honda ', 'suv', 'silver')`);
  const truck = await one(`select * from vehicle_save(null, 'Ford', 'truck', 'red')`);
  assert.equal(suv.make, 'Honda');
  assert.equal((await rows(`select * from vehicles`)).length, 2);

  // Only you see and change your vehicles, or arrive in them.
  await as('u-p02');
  assert.equal((await rows(`select * from vehicles`)).length, 0);
  await rejects(`select vehicle_delete('${suv.id}')`, /isn't one of yours/);
  await rejects(`select * from vehicle_save('${suv.id}', 'Kia', 'van', 'blue')`, /isn't one of yours/);
  await rejects(`select * from carline_announce(null, ${AT}, null, '${suv.id}')`, /isn't one of yours/);

  // Rosa arrives in the truck: staff see it next to Ava's number, and it becomes her default.
  await asSuper();
  await db.exec(`update app.settings set value = app.school_today()::text where key = 'carline_open_on';
                 update carline_pickups set status = 'cancelled' where day = app.school_today() and status = 'waiting';`);
  await as('u-p01');
  const [first] = await rows(`select * from carline_announce(null, ${AT}, null, '${truck.id}')`);
  assert.equal(first.vehicle.label, 'Red Ford Truck');
  await as('u-sci');
  const onBoard = (await one(`select carline_board() as b`)).b.find((b: any) => b.id === first.id);
  assert.deepEqual([onBoard.vehicle, onBoard.vehicleColor, onBoard.vehicleKind], ['Red Ford Truck', 'red', 'truck']);
  await as('u-p01');
  const [again] = await rows(`select * from carline_announce(null, ${AT})`);
  assert.deepEqual([again.id, again.vehicle.label], [first.id, 'Red Ford Truck'], 'no choice: the last one used');
  const [switched] = await rows(`select * from carline_announce(null, ${AT}, null, '${suv.id}')`);
  assert.deepEqual([switched.id, switched.vehicle.label], [first.id, 'Silver Honda SUV'], 'same place in line, new vehicle');

  // Choosing a default in My profile; the car screen then arrives in it. (PGlite's clock ticks in
  // milliseconds, so wait one to keep "last used" in order.)
  await new Promise((r) => setTimeout(r, 5));
  await one(`select vehicle_use('${truck.id}')`);
  await one(`select carline_cancel('${first.id}')`);
  const pass = (await one(`select create_car_pass() as t`)).t as string;
  await asSuper();
  assert.equal((await one(`select (app.pickup_vehicle(null, ${rosa})).make as m`)).m, 'Ford');
  await db.exec(`set role anon`);
  await one(`select car_carline_check_in('${pass}', ${AT}) as s`);
  await asSuper();
  const waiting = `select vehicle->>'label' as l from carline_pickups where guardian_id = ${rosa} and day = app.school_today() and status = 'waiting'`;
  assert.equal((await one(waiting)).l, 'Red Ford Truck');

  // Deleting a vehicle doesn't change what the line recorded.
  await as('u-p01');
  await one(`select vehicle_delete('${truck.id}')`);
  assert.deepEqual((await rows(`select make from vehicles`)).map((v) => v.make), ['Honda']);
  await asSuper();
  assert.equal((await one(waiting)).l, 'Red Ford Truck');
});

test('critical alerts: admins send them to every teacher and staff member, who answer safe or need help', async () => {
  const sci = (await one(`select ${id('u-sci')} as u`)).u as string;
  const send = `select * from critical_alert_send('threat', 'Lockdown: active threat', 'Lock your door and keep students out of sight.')`;
  // Only admins with "Send critical alerts", in an authenticator-verified session.
  await as('u-sci');
  await rejects(send, /permission/);
  await as('u-admin');
  await rejects(send, /MFA_REQUIRED/);
  await as('u-admin', true);
  await rejects(`select * from critical_alert_send('drill', 'Lockdown')`, /what kind/);
  await rejects(`select * from critical_alert_send('threat', '   ')`, /title/);
  const alert = await one(send);

  // It goes to teachers and staff and always pushes, even in quiet hours with school news off.
  await asSuper();
  const n = await one(`select * from notifications where data->>'alertId' = '${alert.id}'`);
  assert.deepEqual(n.roles, ['admin', 'teacher', 'staff']);
  assert.equal(n.data.level, 'time-sensitive', 'until Apple grants Critical Alerts');
  const forWho = async (who: string) => (await one(`select app.notification_for(n, ${id(who)}) as y from notifications n where id = '${n.id}'`)).y;
  assert.equal(await forWho('u-sci'), true);
  assert.equal(await forWho('u-p01'), false);
  assert.equal(await forWho('u-s01'), false);
  await db.exec(`insert into user_settings (user_id, push_school, quiet_start, quiet_end) values ('${sci}', false, '00:00', '23:59')
                 on conflict (user_id) do update set push_school = false, quiet_start = '00:00', quiet_end = '23:59'`);
  assert.equal((await one(`select app.wants_push(n, '${sci}') as y from notifications n where id = '${n.id}'`)).y, true);

  // Parents and students can't see or answer it.
  for (const who of ['u-p01', 'u-s01']) {
    await as(who);
    assert.equal((await rows(`select * from critical_alerts`)).length, 0, who);
    await rejects(`select * from critical_alert_respond('${alert.id}', 'safe')`, /teachers and staff/);
  }

  // A teacher is safe; another needs help, and the senders are told right away.
  await as('u-sci');
  assert.equal((await rows(`select * from critical_alerts where id = '${alert.id}'`)).length, 1);
  assert.ok((await rows(`select data from my_notifications()`)).some((x) => x.data?.alertId === alert.id));
  await one(`select * from critical_alert_respond('${alert.id}', 'safe')`);
  await as('u-eng');
  await rejects(`select * from critical_alert_respond('${alert.id}', 'maybe')`, /safe or I need help/);
  await one(`select * from critical_alert_respond('${alert.id}', 'help', 'Room 12, a student is hurt')`);
  assert.equal((await rows(`select * from critical_alert_responses`)).length, 1, 'staff see only their own answer');
  await as('u-sci');
  await rejects(`select critical_alert_status('${alert.id}')`, /permission/);
  await as('u-admin', true);
  const status = (await one(`select critical_alert_status('${alert.id}') as s`)).s as any[];
  assert.deepEqual([status[0].status, status[0].note], ['help', 'Room 12, a student is hurt'], 'help first');
  assert.equal(status.find((p) => p.id === sci).status, 'safe');
  assert.ok(status.some((p) => p.status === 'none'), 'and who hasn\'t answered');
  assert.ok(status.every((p) => ['admin', 'teacher', 'staff'].includes(p.role)));
  assert.ok((await rows(`select title from my_notifications()`)).some((x) => /needs help/.test(x.title)));

  // All clear: everyone hears it, and answers close.
  await one(`select * from critical_alert_end('${alert.id}', 'Police have cleared the building.')`);
  await rejects(`select * from critical_alert_end('${alert.id}')`, /already ended/);
  await as('u-sci');
  await rejects(`select * from critical_alert_respond('${alert.id}', 'safe')`, /has ended/);
  assert.equal((await one(`select body from my_notifications() where title like '✅ All clear%' limit 1`)).body, 'Police have cleared the building.');

  // The Office role sends them too; once Apple approves, pushes ring as Critical Alerts.
  await asSuper();
  assert.ok((await one(`select permissions from admin_roles where id = 'office'`)).permissions.includes('alerts.send'));
  await db.exec(`update app.settings set value = 'on' where key = 'critical_alerts'`);
  assert.equal((await one(`select app.alert_level() as l`)).l, 'critical');
  await db.exec(`update app.settings set value = 'off' where key = 'critical_alerts'`);
});

test('activity events: addresses, team photos, and families answer "Are you going?" for coaches to see', async () => {
  const at = (days: number) => `date_trunc('day', now()) + interval '${days} days 16 hours'`;
  const ava = (await one(`select ${id('u-s01')} as u`)).u as string;
  // A club with a coach, an open season, and Ava (Rosa's daughter) registered.
  await as('u-admin', true);
  const club = await one(`select * from sport_save(null, 'Science Olympiad', '🔬', 'Build and compete', 'clubs')`);
  await one(`select sport_set_coach('${club.id}', ${id('u-vbcoach')}, true)`);
  await as('u-vbcoach');
  const season = await one(`select * from season_save(null, '${club.id}', 'Fall 2026', app.school_today() - 1, app.school_today() + 40,
    app.school_today() - 1, app.school_today() + 5)`);
  await as('u-p01');
  const reg = await one(`select * from sport_register('${season.id}', '${ava}')`);
  await as('u-vbcoach');
  await one(`select * from sport_decide('${reg.id}', true)`);

  // Schedule items carry an address under the venue, and families see it in their schedule.
  await rejects(`select * from sport_event_save(null, '${season.id}', 'meeting', 'Build night', ${at(2)}, null, 'STEM Lab', null, '', repeat('x', 201))`, /200 characters/);
  const ev = await one(`select * from sport_event_save(null, '${season.id}', 'meeting', 'Build night', ${at(2)}, null,
    'Mark Russell Recreation Center', null, '', '429 Taylor Road, Huntsville, AL 35763')`);
  assert.equal(ev.address, '429 Taylor Road, Huntsville, AL 35763');
  await as('u-p01');
  assert.equal((await rows(`select address from my_sport_schedule() where id = '${ev.id}'`))[0].address, '429 Taylor Road, Huntsville, AL 35763');

  // Rosa answers for Ava; Ava can answer for herself; nobody else can, and only registered kids count.
  await rejects(`select sport_rsvp('${ev.id}', ${id('u-s02')}, 'going')`, /own children/);
  await rejects(`select sport_rsvp('${ev.id}', '${ava}', 'maybe')`, /Going or Not going/);
  await one(`select sport_rsvp('${ev.id}', '${ava}', 'going')`);
  assert.deepEqual((await rows(`select status from sport_event_rsvps`)).map((r) => r.status), ['going']);
  await as('u-s01');
  await one(`select sport_rsvp('${ev.id}', '${ava}', 'not_going')`);
  await as('u-p02');
  await rejects(`select sport_rsvp('${ev.id}', '${ava}', 'going')`, /own children/);
  assert.equal((await rows(`select * from sport_event_rsvps`)).length, 0, 'other families see nothing');
  await rejects(`select sport_rsvp('${ev.id}', ${id('u-s02')}, 'going')`, /registered participants/);
  assert.equal((await rows(`select * from sport_event_attendance(array['${ev.id}']::uuid[])`)).length, 0, 'only leaders see attendance');

  // The coach sees everyone registered with their answer.
  await as('u-vbcoach');
  const att = await rows(`select * from sport_event_attendance(array['${ev.id}']::uuid[])`);
  assert.deepEqual(att.map((a) => [a.student_id, a.status]), [[ava, 'not_going']]);

  // Cancelled items take no answers; clearing an answer works.
  await one(`select * from sport_event_cancel('${ev.id}', true)`);
  await as('u-p01');
  await rejects(`select sport_rsvp('${ev.id}', '${ava}', 'going')`, /cancelled/);
  await as('u-vbcoach');
  await one(`select * from sport_event_cancel('${ev.id}', false)`);
  await as('u-p01');
  await one(`select sport_rsvp('${ev.id}', '${ava}', null)`);
  assert.equal((await rows(`select * from sport_event_rsvps`)).length, 0);

  // Team photo: the coach uploads into the activity's folder; parents can't.
  const path = `sports/${club.id}/team.jpg`;
  await rejects(`insert into storage.objects (bucket_id, name) values ('avatars', '${path}')`, /row-level security/);
  await rejects(`select set_sport_photo('${club.id}', '${path}')`, /coaches or directors/);
  await as('u-vbcoach');
  await one(`insert into storage.objects (bucket_id, name) values ('avatars', '${path}') returning id`);
  await rejects(`select set_sport_photo('${club.id}', 'sports/${ava}/x.jpg')`, /this activity's folder/);
  await one(`select set_sport_photo('${club.id}', '${path}')`);
  await as('u-p01');
  assert.equal((await one(`select photo_path from sports where id = '${club.id}'`)).photo_path, path);
  assert.equal((await rows(`select name from storage.objects where name = '${path}'`)).length, 1, 'approved accounts see team photos');
});

test('every public table grants its access explicitly (Supabase stops auto-granting new tables)', async () => {
  // Tables the app never reads directly; their data goes through functions.
  const PRIVATE = new Set(['post_views', 'notification_dismissals']);
  await asSuper();
  const tables = (await rows(`select table_name from information_schema.tables
                              where table_schema = 'public' and table_type = 'BASE TABLE'`)).map((r) => r.table_name as string);
  const grants = await rows(`select table_name, grantee from information_schema.role_table_grants
                             where table_schema = 'public' and privilege_type = 'SELECT'`);
  const has = (t: string, role: string) => grants.some((g) => g.table_name === t && g.grantee === role);
  const missing = tables.flatMap((t) => [
    ...(has(t, 'service_role') ? [] : [`${t}: service_role`]),
    ...(PRIVATE.has(t) || has(t, 'authenticated') ? [] : [`${t}: authenticated`]),
  ]);
  assert.deepEqual(missing, [], 'add "grant select on public.<table> to authenticated" (and service_role) in the migration that creates it');
});

test('car line pickups email every parent who picked the child up; an undo cancels the email', async () => {
  await asSuper();
  await db.exec(`update app.settings set value = app.school_today()::text where key = 'carline_open_on';
                 delete from carline_pickups where student_id = ${id('u-s01')} and day = app.school_today();
                 insert into guardians values (${id('u-p05')}, ${id('u-s01')}) on conflict do nothing;
                 update profile_private set email = 'u-p05@demo.khroyals.test' where id = ${id('u-p05')}`);
  await as('u-p01');
  const [p] = await rows(`select * from carline_announce(array[${id('u-s01')}], ${AT})`);
  await as('u-eng');
  await one(`select carline_confirm('${p.id}')`);

  await asSuper();
  const mail = await rows(`select * from app.email_queue where pickup_id = '${p.id}' order by to_email`);
  assert.deepEqual(mail.map((m) => m.to_email), ['u-p01@demo.khroyals.test', 'u-p05@demo.khroyals.test'], 'every parent');
  assert.match(mail[0].subject, /^Ava was picked up at \d{1,2}:\d{2} (AM|PM)$/);
  assert.match(mail[0].body, /Picked up by: Ros\w+ Reyes \(parent\)\nVehicle: \w+/);
  assert.match(mail[0].body, /Released by: .+ \(school staff\)/);
  assert.match(mail[0].body, /Pickup number: \w+/);
  assert.match(mail[0].body, /call the school office/);
  assert.ok(mail.every((m) => m.status === 'queued' && new Date(m.send_after) > new Date()), 'waits a minute');
  // The other parent hears in the app too; the one who picked up doesn't need to.
  await as('u-p05');
  assert.match((await rows(`select body from my_notifications() where data->>'pickupId' = '${p.id}'`))[0].body, /picked up at .* by Ros\w+ Reyes/);
  await as('u-p01');
  assert.equal((await rows(`select 1 from my_notifications() where data->>'pickupId' = '${p.id}'`)).length, 0);

  // A mis-tap undone within the minute never emails anyone.
  await as('u-eng');
  await one(`select carline_reopen('${p.id}')`);
  await asSuper();
  assert.deepEqual((await rows(`select distinct status from app.email_queue where pickup_id = '${p.id}'`)).map((r) => r.status), ['cancelled']);

  // Only the sender function (service role) can claim emails.
  await as('u-admin', true);
  await rejects(`select * from email_claim()`, /permission denied/);
  await asSuper();
  await db.exec(`update app.email_queue set status = 'queued', send_after = now() where pickup_id = '${p.id}'`);
  const claimed = await rows(`select * from email_claim()`);
  assert.equal(claimed.length, 2);
  assert.match(claimed[0].sender, /Car Line <noreply@/);
  assert.equal((await rows(`select * from email_claim()`)).length, 0, 'claimed once');
  await one(`select email_done('${claimed[0].id}')`);
  await one(`select email_done('${claimed[1].id}', 'bounced')`);
  assert.deepEqual((await rows(`select status from app.email_queue where pickup_id = '${p.id}' order by status`)).map((r) => r.status), ['failed', 'sent']);
  await db.exec(`delete from guardians where guardian_id = ${id('u-p05')} and student_id = ${id('u-s01')};
                 update app.settings set value = null where key = 'carline_open_on'`);
});

test('parents: at most two per child, one mother and one father', async () => {
  await as('u-admin', true);
  await one(`select admin_set_parent_relation(${id('u-p04')}, ${id('u-s04')}, 'mother')`);
  await rejects(`select admin_link_guardian(${id('u-p08')}, ${id('u-s04')})`, /mother or father/);
  await rejects(`select admin_link_guardian(${id('u-p08')}, ${id('u-s04')}, true, 'mother')`, /already has a mother \(Sun/);
  await one(`select admin_link_guardian(${id('u-p08')}, ${id('u-s04')}, true, 'father')`);
  await rejects(`select admin_link_guardian(${id('u-p07')}, ${id('u-s04')}, true, 'father')`, /already has two parents/);
  await one(`select admin_link_guardian(${id('u-p08')}, ${id('u-s04')}, false)`);
  await rejects(`select admin_set_parent_relation(${id('u-p08')}, ${id('u-s04')}, 'father')`, /isn't linked/);
  await as('u-p04');
  const ppl = (await one(`select child_pickup_people(${id('u-s04')}) as p`)).p;
  assert.deepEqual(ppl.parents.map((p: any) => p.relation), ['mother']);
});

test('approved pickup people: parents add an account by email, for a day or longer, and can remove them', async () => {
  const sun = id('u-s04');
  await asSuper();
  await db.exec(`update app.settings set value = app.school_today()::text where key = 'carline_open_on';
                 delete from carline_pickups where student_id = ${sun}`);
  const priya = (await one(`select ${id('u-p07')} as u`)).u;

  // Only the child's parents (or the office) choose, and only people with an account.
  await as('u-p02');
  await rejects(`select add_pickup_person(${sun}, 'u-p07@demo.khroyals.test', 'carpool')`, /Only this child's parents/);
  await as('u-p04');
  await rejects(`select add_pickup_person(${sun}, 'nobody@example.com', 'carpool')`, /No Royals Connect account/);
  await rejects(`select add_pickup_person(${sun}, 'u-s01@demo.khroyals.test', 'sibling')`, /Students can't/);
  await rejects(`select add_pickup_person(${sun}, 'u-p04@demo.khroyals.test', 'other')`, /already a parent/);

  // Before: Priya can't announce Sun.
  await as('u-p07');
  await rejects(`select * from carline_announce(array[${sun}], ${AT})`, /own children|pick up/);

  // Today only.
  await as('u-p04');
  const added = (await one(`select add_pickup_person(${sun}, 'U-P07@demo.khroyals.test', 'carpool', app.school_today(), app.school_today()) as a`)).a;
  assert.match(added.name, /Priya/);
  await as('u-p07');
  const sunId = (await one(`select ${sun} as u`)).u;
  assert.ok((await rows(`select x as id from my_pickup_children() x`)).some((r) => r.id === sunId), 'Priya can pick Sun up today');
  assert.match((await rows(`select body from my_notifications() where data->>'carline' = 'pickup-added'`))[0].body, /Sun \w+ added you to pick up \w+ from the car line on/);
  await rejects(`select child_pickup_people(${sun})`, /Only this child's parents/);
  const [p] = await rows(`select * from carline_announce(array[${sun}], ${AT})`);
  assert.equal(p.guardian_id, priya, 'Priya announced Sun');

  // The pickup email says who and how they're related.
  await as('u-eng');
  await one(`select carline_confirm('${p.id}')`);
  await asSuper();
  assert.match((await one(`select body from app.email_queue where pickup_id = '${p.id}'`)).body, /Picked up by: Priya \w+ \(carpool\)/);

  // Removed: no more pickups. Future dates don't count yet.
  await as('u-p04');
  const list = (await one(`select child_pickup_people(${sun}) as p`)).p.approved;
  assert.equal(list.length, 1);
  assert.equal(list[0].active, true);
  await one(`select remove_pickup_person('${list[0].id}')`);
  await one(`select add_pickup_person(${sun}, 'u-p07@demo.khroyals.test', 'grandparent', app.school_today() + 1, null)`);
  await as('u-p07');
  assert.equal((await rows(`select * from my_pickup_children() x where x = ${sun}`)).length, 0, 'starts tomorrow');
  await rejects(`select * from carline_announce(array[${sun}], ${AT})`, /own children|pick up/);
  await rejects(`insert into pickup_authorizations (student_id, person_id, relationship) values (${sun}, '${priya}', 'other')`, /permission denied/);

  await asSuper();
  await db.exec(`delete from pickup_authorizations; update app.settings set value = null where key = 'carline_open_on'`);
});

test('duplicate children: the same child is never added twice; likely matches are caught; twins are not', async () => {
  await asSuper();
  const score = async (a: string, b: string) =>
    (await one(`select app.child_match_score(${a}, ${b}) as s`)).s as number;
  assert.ok(await score(`'Matthew', 'Kim-Lee', '2017-03-04', 3`, `'Matt', 'Kim', '2017-03-04'::date, 3`) >= 6, 'nickname + hyphenated name + birthday');
  assert.ok(await score(`'José', 'Ortiz', null, 2`, `'jose', 'ORTIZ', null, 2`) >= 6, 'accents and case');
  assert.ok(await score(`'Ava', 'Kim', '2017-03-04', 3`, `'Mia', 'Kim', '2017-03-04'::date, 3`) < 6, 'twins are different children');
  assert.ok(await score(`'Ava', 'Kim', '2017-03-04', 3`, `'Ava', 'Kim', '2015-01-01'::date, 5`) < 4, 'same name, different child');

  // The office can't create the same child twice.
  await as('u-admin', true);
  const lily = (await one(`select admin_create_student('Lily', 'Chen-Park', 1, '2019-05-06') as id`)).id;
  await rejects(`select admin_create_student('lily', 'Chen Park', 1, '2019-05-06', null, null, true)`, /already a student/);
  await rejects(`select admin_create_student('Lilly', 'Chen-Park', 1)`, /looks like Lily Chen-Park/);
  const similar = (await one(`select admin_similar_students('Lilly', 'Chen-Park', null, 1) as s`)).s;
  assert.equal(similar[0].id, lily);
  assert.equal(similar[0].strong, true);
  // Twins: same birthday, different first name, no warning.
  await one(`select admin_create_student('Rose', 'Chen-Park', 1, '2019-05-06')`);
  // Editing into a duplicate is refused too.
  const rose = (await one(`select id from profiles where first_name = 'Rose' and last_name = 'Chen-Park'`)).id;
  await rejects(`select admin_update_student('${rose}', 'Lily', 'Chen-Park', 1)`, /already a student/);

  // Two parents ask for the same child: the office sees the match and links instead of creating.
  await as('u-p06');
  await one(`select * from request_child('Lily', 'Chen-Park', 1, null, null, 'mother')`);
  await rejects(`select * from request_child('lily', 'Chen-Park', 1, null, null, 'mother')`, /already asked/);
  await as('u-p08');
  await one(`select * from request_child('Lilly', 'Chenpark', 1, '2019-05-06', null, 'father')`);
  await as('u-admin', true);
  const reqs = (await one(`select admin_family_requests() as q`)).q.filter((r: any) => /Chen/i.test(r.details.lastName));
  assert.equal(reqs.length, 2);
  assert.ok(reqs.every((r: any) => r.matches[0]?.id === lily), 'both point at the existing student');
  assert.ok(reqs.every((r: any) => r.similarRequests.length === 1), 'and at each other');
  await rejects(`select admin_decide_family_request('${reqs[1].id}', true)`, /looks like Lily Chen-Park/);
  for (const r of reqs) await one(`select admin_decide_family_request('${r.id}', true, '${lily}')`);
  const parents = (await one(`select child_pickup_people('${lily}') as p`)).p.parents;
  assert.deepEqual(parents.map((p: any) => p.relation).sort(), ['father', 'mother'], 'one record, both parents');
  assert.equal((await one(`select count(*)::int n from profiles where app.norm_name(last_name) = 'chenpark' and app.norm_name(first_name) like 'lil%'`)).n, 1);

  // A parent can't re-add a child already linked to them.
  await as('u-p06');
  await rejects(`select * from request_child('Lily', 'Chen-Park', 1, null, null, 'mother')`, /already linked to your account/);
});
