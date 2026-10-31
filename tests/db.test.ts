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
import { accessSchema } from '../src/api/schemas';
import { notificationHref } from '../src/comms/inbox';

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
  // Every notification the tests send is logged with who it reached (the last test checks them all).
  await db.exec(sql('supabase/tests/notification_log.sql'));
});

test('grade restrictions retain Kindergarten and reject empty or invalid audiences', async () => {
  await as('u-eng');
  const settings = JSON.stringify((await one(`select settings from groups where id = ${id('g-eng-p3')}`)).settings).replace(/'/g, "''");
  const create = (rules: string) => `select id from create_group('Kindergarten test', '', 'K', '#00239C', 'class', '${settings}'::jsonb, '${rules}'::jsonb)`;
  const group = await one(create('[{"grades":[0],"assignAs":"member"}]'));
  await asSuper();
  assert.deepEqual((await one(`select grades from assignment_rules where group_id = '${group.id}'`)).grades, [0]);
  assert.equal((await rows(`select p.grade from memberships m join profiles p on p.id = m.user_id where m.group_id = '${group.id}' and m.source = 'rule'`))
    .every((p) => p.grade === 0), true);
  await db.exec(`delete from groups where id = '${group.id}'`);
  await as('u-eng');
  for (const grades of ['[]', '[13]', '[-4]', '[0.5]', '["0"]', 'null']) {
    await assert.rejects(db.query(create(`[{"grades":${grades},"assignAs":"member"}]`)));
  }
});

test('push delivery claims recover after interruption and only retry unprocessed devices', async () => {
  await asSuper();
  await db.exec(`update notifications set status = 'sent' where status in ('queued', 'sending');
    insert into notifications (id, audience, title, body) values (${id('push-retry')}, 'everyone', 'Test', 'Retry');
    update notifications set push_remaining = array['a', 'b'] where id = ${id('push-retry')};
    set role service_role;`);
  const first = await one('select * from push_claim()');
  assert.equal(first.id, (await one(`select ${id('push-retry')} as id`)).id);
  assert.equal(await one('select * from push_claim()'), undefined, 'a live claim cannot be taken twice');
  assert.equal((await one(`select push_progress('${first.id}', '${first.push_claim_id}', array['a'], 1) as ok`)).ok, true);
  await db.exec(`select push_release('${first.id}', '${first.push_claim_id}', 'offline');`);
  assert.equal((await one(`select status from notifications where id = '${first.id}'`)).status, 'queued');
  await db.exec(`update notifications set push_retry_after = now() - interval '1 second' where id = '${first.id}'`);
  const second = await one('select * from push_claim()');
  assert.deepEqual(second.push_remaining, ['b']);
  assert.equal(second.sent_count, 1);
  await db.exec(`update notifications set push_claim_until = now() - interval '1 second' where id = '${first.id}'`);
  const third = await one('select * from push_claim()');
  assert.notEqual(third.push_claim_id, second.push_claim_id);
  assert.equal((await one(`select push_progress('${first.id}', '${second.push_claim_id}', array['b'], 1) as ok`)).ok, false, 'stale workers cannot checkpoint');
  await db.exec(`select push_progress('${first.id}', '${third.push_claim_id}', array['b'], 1);
    select push_release('${first.id}', '${third.push_claim_id}');`);
  const final = await one(`select status, sent_count from notifications where id = '${first.id}'`);
  assert.deepEqual(final, { status: 'sent', sent_count: 2 });
  await as('u-p01');
  await rejects('select * from push_claim()', /permission denied/);
  await asSuper();
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

test('new accounts from Google or Apple get their names from what the provider sends', async () => {
  await asSuper();
  const signUp = async (n: number, meta: object | null) => {
    const uid = `00000000-0000-0000-0000-0000000005${String(n).padStart(2, '0')}`;
    await db.query(`insert into auth.users (id, email, raw_user_meta_data) values ($1, $2, $3)`, [uid, `sso${n}@example.com`, meta && JSON.stringify(meta)]);
    return one(`select first_name, last_name, school_role from profiles where id = '${uid}'`);
  };
  assert.deepEqual(await signUp(1, { full_name: 'Grace Brewster Hopper', name: 'Grace Brewster Hopper', email_verified: true }),
    { first_name: 'Grace', last_name: 'Brewster Hopper', school_role: null }, 'Google: full_name, waiting for approval');
  assert.deepEqual(await signUp(2, { given_name: 'Ada', family_name: 'Lovelace' }), { first_name: 'Ada', last_name: 'Lovelace', school_role: null });
  assert.deepEqual(await signUp(3, { name: 'Cher' }), { first_name: 'Cher', last_name: '', school_role: null }, 'one name');
  assert.deepEqual(await signUp(4, {}), { first_name: '', last_name: '', school_role: null }, 'Apple sends no name in its token');
  assert.deepEqual(await signUp(5, null), { first_name: '', last_name: '', school_role: null });
  assert.deepEqual(await signUp(6, { first_name: 'New', last_name: 'Parent', full_name: 'Ignored Name' }),
    { first_name: 'New', last_name: 'Parent', school_role: null }, 'the email sign-up form still wins');
  await db.exec(`delete from auth.users where email like 'sso%@example.com'`);
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

test("car line board: says whose birthday it is today, never the date", async () => {
  const ava = id('u-s01');
  await asSuper();
  const avaId = (await one(`select ${ava} as u`)).u;
  await db.exec(`update app.settings set value = app.school_today()::text where key = 'carline_open_on'`);
  const birthday = (b: string) => db.exec(`insert into student_details (student_id, birthday) values (${ava}, ${b})
    on conflict (student_id) do update set birthday = excluded.birthday`);
  const avaOnBoard = async () => {
    await as('u-sci');
    return (await one(`select carline_board() as b`)).b.find((r: any) => r.studentId === avaId && r.status === 'waiting');
  };
  await as('u-p01');
  await rows(`select * from carline_announce(array[${ava}], ${AT})`);

  await asSuper();
  await birthday(`(app.school_today() - interval '9 years')::date`);
  const row = await avaOnBoard();
  assert.equal(row.birthday, true, 'nine years ago today');
  assert.equal(Object.values(row).some((v) => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v)), false, 'no birth date on the board');
  await asSuper();
  await birthday(`(app.school_today() - interval '9 years')::date + 1`);
  assert.equal((await avaOnBoard()).birthday, false, 'tomorrow');
  await asSuper();
  await db.exec(`update student_details set birthday = null where student_id = ${ava}`);
  assert.equal((await avaOnBoard()).birthday, false, 'no birthday on file');

  // Leap-day birthdays are celebrated on Feb 28 when there's no Feb 29.
  const on = async (b: string, day: string) => (await one(`select app.is_birthday('${b}', '${day}') as y`)).y;
  assert.equal(await on('2016-02-29', '2027-02-28'), true);
  assert.equal(await on('2016-02-29', '2028-02-28'), false);
  assert.equal(await on('2016-02-29', '2028-02-29'), true);
  assert.equal(await on('2016-03-01', '2027-02-28'), false);

  await asSuper();
  await db.exec(`delete from student_details where student_id = ${ava}`);
  await db.exec(`delete from carline_pickups where student_id = ${ava} and day = app.school_today()`);
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

test("car line board's festive touches: leads and the office switch them for every screen", async () => {
  const festive = async (who: string) => { await as(who); return (await one(`select carline_config() as c`)).c.festive; };
  assert.deepEqual(await festive('u-sci'), { enabled: true, off: [] }, 'all on to start');
  await rejects(`select carline_set_festive(false, '{}')`, /car line leads and the office/);
  await as('u-p01');
  await rejects(`select carline_set_festive(false, '{}')`, /car line leads and the office/);

  await as('u-admin', true);
  await one(`select admin_set_carline_duty(${id('u-sci')}, true)`);
  await as('u-sci');
  const cfg = (await one(`select carline_set_festive(true, array['easter', 'valentines', 'easter']) as c`)).c;
  assert.deepEqual(cfg.festive, { enabled: true, off: ['easter', 'valentines'] }, 'sorted, no repeats');
  await rejects(`select carline_set_festive(true, array['halloween'])`, /Unknown festive touch: halloween/);
  assert.deepEqual(await festive('u-eng'), { enabled: true, off: ['easter', 'valentines'] }, 'every screen gets the same choice');
  assert.deepEqual(await festive('u-p01'), { enabled: true, off: ['easter', 'valentines'] });
  await as('u-sci');
  await one(`select carline_set_festive(false, null)`);
  assert.deepEqual(await festive('u-sci'), { enabled: false, off: [] });
  await asSuper();
  assert.ok((await rows(`select 1 from audit_log where action = 'carline.festive'`)).length >= 2, 'logged');

  // Put things back for the other tests.
  await as('u-sci');
  await one(`select carline_set_festive(true, '{}')`);
  await as('u-admin', true);
  await one(`select admin_set_carline_duty(${id('u-sci')}, false)`);
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

test('students: Ask the Teacher and assignments, with teachers from class rosters', async () => {
  const uid = async (l: string) => (await one(`select ${id(l)} as u`)).u as string;
  const [ava, jen] = [await uid('u-s01'), await uid('u-eng')];
  const told = async (key: string, value: string) =>
    (await rows(`select title || ' ' || body as t from my_notifications() where data->>'${key}' = '${value}'`)).map((n) => n.t).join('\n');

  // Ava (u-s01) is in English 10 – Period 3, taught by Jennifer (u-eng). Jessica (u-sci) leads a club, not a class.
  await as('u-s01');
  assert.deepEqual((await rows(`select * from my_teachers()`)).map((t) => [t.teacher_id, t.classes, t.thread_id]),
    [[jen, 'English 10 – Period 3', null]]);
  await rejects(`select * from teacher_send('${ava}', ${id('u-sci')}, 'Hi')`, /teachers of your classes/);
  await rejects(`select * from teacher_send('${ava}', '${jen}', '   ')`, /Write a message first/);
  await one(`select * from teacher_send('${ava}', '${jen}', 'Is the essay due Friday?')`);
  const thread = (await one(`select teacher_thread_for('${ava}', '${jen}') as t`)).t as string;

  // Jennifer is told, sees it unread, and answers (which reads it).
  await as('u-eng');
  assert.match(await told('teacherThreadId', thread), /Is the essay due Friday\?/);
  assert.deepEqual((await rows(`select student_id, unread from teacher_conversations()`)).map((c) => [c.student_id, c.unread]), [[ava, true]]);
  assert.ok((await rows(`select student_id from my_class_students()`)).some((s) => s.student_id === ava));
  await one(`select * from teacher_send('${ava}', '${jen}', 'Yes, by 3:00.')`);
  assert.equal((await one(`select unread from teacher_conversations()`)).unread, false);
  await rejects(`select * from teacher_send(${id('u-s05')}, '${jen}', 'Hello')`, /students in your classes/);

  // Ava sees the answer as unread until she opens the conversation.
  await as('u-s01');
  assert.equal((await one(`select unread from my_teachers()`)).unread, true);
  await one(`select teacher_thread_read('${thread}')`);
  assert.equal((await one(`select unread from my_teachers()`)).unread, false);
  const t = (await one(`select teacher_thread('${thread}') as t`)).t;
  assert.deepEqual([t.canWrite, t.messages.length, t.teacherName], [true, 2, 'Jennifer Taylor']);

  // Rosa (Ava's mother) reads it but can't write; another parent and another student see nothing.
  await as('u-p01');
  assert.equal((await one(`select teacher_thread('${thread}') as t`)).t.canWrite, false);
  assert.equal((await rows(`select 1 from teacher_conversations('${ava}')`)).length, 1);
  await rejects(`select * from teacher_send('${ava}', '${jen}', 'Thanks!')`, /Only the student and the teacher/);
  await as('u-p02');
  assert.equal((await one(`select teacher_thread('${thread}') as t`)).t, null);
  assert.equal((await rows(`select 1 from teacher_messages`)).length, 0);
  await as('u-s02');
  assert.equal((await rows(`select 1 from teacher_threads`)).length, 0);
  await rejects(`insert into teacher_messages (thread_id, body) values ('${thread}', 'sneaky')`, /permission denied/);

  // Admins with messages.review read every conversation, once verified with their authenticator app.
  await as('u-ap');
  assert.equal((await rows(`select 1 from teacher_conversations()`)).length, 0);
  await as('u-ap', true);
  assert.equal((await rows(`select 1 from teacher_conversations()`)).length, 1);
  assert.ok((await rows(`select key from permission_catalog()`)).some((p) => p.key === 'messages.review'));

  // Assignments: only a class's teacher assigns to it (a club isn't a class), and its students are told.
  await as('u-sci');
  await rejects(`select * from assignment_add('Lab report', '', null, 'eng10-p3')`, /classes you teach/);
  await rejects(`select * from assignment_add('Lab report', '', null, 'club-03')`, /classes you teach/);
  await as('u-eng');
  assert.deepEqual((await rows(`select id, students from my_sections()`)).map((s) => [s.id, Number(s.students)]), [['eng10-p3', 5]]);
  const essay = await one(`select * from assignment_add('Persuasive essay', 'Two pages.', app.school_today() + 3, 'eng10-p3')`);
  await rejects(`select * from assignment_add('My list', '', null, null)`, /for students/);

  // Ava sees it, adds her own, and checks the essay off; only she sees that.
  await as('u-s01');
  assert.match(await told('assignmentId', essay.id), /English 10 – Period 3 Persuasive essay · due/);
  const mine = await one(`select * from assignment_add('Read chapter 4', '', app.school_today() + 1)`);
  assert.deepEqual((await rows(`select title from assignments order by title`)).map((a) => a.title), ['Persuasive essay', 'Read chapter 4']);
  await one(`select assignment_check('${essay.id}', true)`);
  await one(`select assignment_check('${essay.id}', true)`);
  assert.equal((await rows(`select 1 from assignment_done`)).length, 1);
  await as('u-s02');
  assert.deepEqual((await rows(`select title from assignments`)).map((a) => a.title), ['Persuasive essay'], "not Ava's own");
  assert.equal((await rows(`select 1 from assignment_done`)).length, 0);
  await as('u-s05');
  assert.equal((await rows(`select 1 from assignments`)).length, 0, 'not in the class');
  await rejects(`select assignment_check('${essay.id}', true)`, /isn't yours/);

  // Rosa (Ava's mother) sees what Ava's teachers assigned, but not Ava's own list or what she's done.
  await as('u-p01');
  assert.deepEqual((await rows(`select * from child_assignments()`)).map((a) => [a.student_id, a.class_name, a.title]),
    [[ava, 'English 10 – Period 3', 'Persuasive essay']]);
  assert.equal((await rows(`select * from child_assignments(app.school_today() + 4)`)).length, 0, 'only the days asked for');
  assert.equal((await rows(`select 1 from assignments`)).length, 0);
  assert.equal((await rows(`select 1 from assignment_done`)).length, 0);
  await as('u-p05');
  assert.equal((await rows(`select * from child_assignments()`)).length, 0, 'her child is not in the class');
  await as('u-eng');
  assert.deepEqual((await rows(`select title from assignments`)).map((a) => a.title), ['Persuasive essay']);
  assert.equal((await rows(`select 1 from assignment_done`)).length, 0, "teachers don't see who's done");
  await rejects(`select assignment_delete('${mine.id}')`, /Only whoever added/);
  await one(`select assignment_delete('${essay.id}')`);
  await as('u-s01');
  assert.deepEqual((await rows(`select title from assignments`)).map((a) => a.title), ['Read chapter 4']);

  // Classes in the admin portal: the office sets a section's teacher and students.
  await as('u-eng');
  await rejects(`select * from admin_list_sections()`, /permission|MFA/);
  await as('u-ap', true);
  await one(`select admin_set_roster('bio9-p1', 'section', 'Biology – Period 1', ${id('u-sci')})`);
  await one(`select admin_roster_member('bio9-p1', ${id('u-s05')}, true)`);
  const bio = (await rows(`select * from admin_list_sections()`)).find((s) => s.id === 'bio9-p1');
  assert.deepEqual([bio.lead_name, Number(bio.students)], ['Jessica Allen', 1]);
  assert.equal((await rows(`select * from admin_section_students('bio9-p1')`)).length, 1);
  await as('u-s05');
  assert.deepEqual((await rows(`select teacher_name from my_teachers()`)).map((x) => x.teacher_name), ['Jessica Allen']);
  await as('u-ap', true);
  await one(`select admin_delete_roster('bio9-p1')`);
  await as('u-s05');
  assert.equal((await rows(`select 1 from my_teachers()`)).length, 0);
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
  assert.equal((await rows(`select * from child_assignments()`)).length, 0);
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

  // Choosing today's vehicle (the button under Check In) while in line: staff see it, same place in line.
  // Someone else's vehicle is refused and changes nothing. (PGlite's clock ticks in milliseconds, so wait
  // one to keep "last used" in order.)
  await new Promise((r) => setTimeout(r, 5));
  await as('u-p02');
  await rejects(`select vehicle_use('${truck.id}')`, /isn't one of yours/);
  await as('u-p01');
  await one(`select vehicle_use('${truck.id}')`);
  await as('u-sci');
  const moved = (await one(`select carline_board() as b`)).b.find((b: any) => b.id === first.id);
  assert.deepEqual([moved.status, moved.vehicle], ['waiting', 'Red Ford Truck']);

  // It's also the default; the car screen then arrives in it.
  await as('u-p01');
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

test("teachers see their students' activities and keep a calendar of their own", async () => {
  // `h` o'clock school time, `days` from today.
  const at = (days: number, h = 16) => `((app.school_today() + ${days})::timestamp + interval '${h} hours') at time zone 'America/Chicago'`;
  const ava = (await one(`select ${id('u-s01')} as u`)).u as string;
  // A soccer team with a coach, and Ava (in Jennifer's English 10 – Period 3) registered.
  await as('u-admin', true);
  const team = await one(`select * from sport_save(null, 'Girls Soccer', '⚽', 'Fall soccer', 'sports')`);
  await one(`select sport_set_coach('${team.id}', ${id('u-vbcoach')}, true)`);
  await as('u-vbcoach');
  const season = await one(`select * from season_save(null, '${team.id}', 'Fall 2026', app.school_today() - 1, app.school_today() + 40,
    app.school_today() - 1, app.school_today() + 5)`);
  await as('u-p01');
  const reg = await one(`select * from sport_register('${season.id}', '${ava}')`);
  await as('u-vbcoach');
  await one(`select * from sport_decide('${reg.id}', true)`);
  const game = await one(`select * from sport_event_save(null, '${season.id}', 'game', 'vs. Westminster', ${at(2)}, ${at(2, 18)}, 'Royals Field')`);
  const later = await one(`select * from sport_event_save(null, '${season.id}', 'game', 'vs. Randolph', ${at(80)})`);

  // Jennifer sees Ava's game (not ones past the days asked for); the coach, a parent and Ava see no class students.
  await as('u-eng');
  const mine = await rows(`select * from student_events() where sport_id = '${team.id}'`);
  assert.deepEqual(mine.map((e) => [e.id, e.students, e.planned]), [[game.id, [{ id: ava, name: 'Ava Reyes' }], false]]);
  assert.equal((await rows(`select 1 from student_events(app.school_today(), app.school_today() + 90) where id = '${later.id}'`)).length, 1);
  for (const who of ['u-vbcoach', 'u-p01', 'u-s01']) {
    await as(who);
    assert.equal((await rows(`select 1 from student_events() where sport_id = '${team.id}'`)).length, 0, who);
  }

  // Only staff keep a calendar.
  await as('u-p01');
  await rejects(`select * from personal_event_save(null, 'Dentist', app.school_today())`, /teachers and staff/);
  await rejects(`select student_event_plan('${game.id}', true)`, /teachers and staff/);
  await rejects(`insert into personal_events (owner_id, title, starts_on) values (${id('u-p01')}, 'x', app.school_today())`, /permission denied/);

  // Jennifer puts the game on her calendar and tells Ava: Ava and her mother hear, once.
  await as('u-eng');
  assert.equal((await one(`select student_event_plan('${game.id}', true, true) as n`)).n, 1);
  assert.equal((await one(`select student_event_plan('${game.id}', true, true) as n`)).n, 0, 'already on it: nobody told twice');
  assert.equal((await one(`select planned from student_events() where id = '${game.id}'`)).planned, true);
  for (const who of ['u-s01', 'u-p01']) {
    await as(who);
    const told = await rows(`select title, body from my_notifications() where data->>'sportId' = '${team.id}' and title like '📣%'`);
    assert.deepEqual(told.map((n) => n.title), ['📣 Jennifer Taylor is coming!'], who);
    assert.match(told[0].body, /⚽ Girls Soccer · vs\. Westminster · /);
  }
  await as('u-p02');
  assert.equal((await rows(`select 1 from my_notifications() where title like '📣%'`)).length, 0);

  // Her own events sit beside it, in order; times are checked.
  await as('u-eng');
  await rejects(`select * from personal_event_save(null, '  ', app.school_today() + 2)`, /title/);
  await rejects(`select * from personal_event_save(null, 'Meeting', app.school_today() + 2, '15:00', '14:00')`, /after the start/);
  await rejects(`select * from personal_event_save(null, 'Meeting', app.school_today() + 2, null, '14:00')`, /after the start/);
  const mtg = await one(`select * from personal_event_save(null, 'Faculty meeting', app.school_today() + 2, '07:30', '08:15', 'Library')`);
  await one(`select * from personal_event_save(null, 'Grades due', app.school_today() + 2)`);
  const cal = await rows(`select * from my_calendar()`);
  assert.deepEqual(cal.map((c) => [c.title, c.start_time, c.end_time, c.location]), [
    ['Grades due', null, null, null],
    ['Faculty meeting', '07:30', '08:15', 'Library'],
    ['⚽ Girls Soccer · vs. Westminster', '16:00', '18:00', 'Royals Field'],
  ]);
  const gameRow = cal.find((c) => c.sport_event_id === game.id);
  await rejects(`select * from personal_event_save('${gameRow.id}', 'Renamed', app.school_today())`, /your own events/);

  // Nobody else sees it.
  await as('u-sci');
  assert.equal((await rows(`select * from my_calendar()`)).length, 0);
  assert.equal((await rows(`select * from personal_events`)).length, 0);
  await rejects(`select personal_event_delete('${mtg.id}')`, /isn't on your calendar/);
  await rejects(`select * from personal_event_save('${mtg.id}', 'Mine now', app.school_today())`, /your own events/);

  // The game follows the schedule: moved and cancelled.
  await as('u-vbcoach');
  await one(`select * from sport_event_save('${game.id}', '${season.id}', 'game', 'vs. Westminster', ${at(3, 17)}, null, 'Gym')`);
  await one(`select * from sport_event_cancel('${game.id}', true)`);
  await as('u-eng');
  const moved = (await rows(`select * from my_calendar()`)).find((c) => c.sport_event_id === game.id);
  assert.deepEqual([moved.start_time, moved.end_time, moved.location, moved.cancelled], ['17:00', null, 'Gym', true]);
  await rejects(`select student_event_plan('${game.id}', true)`, /cancelled/);

  // Taking it off, and removing her own.
  await one(`select student_event_plan('${game.id}', false)`);
  await one(`select personal_event_delete('${mtg.id}')`);
  assert.deepEqual((await rows(`select title from my_calendar()`)).map((c) => c.title), ['Grades due']);
  await asSuper();
  await db.exec(`delete from personal_events; delete from sports where id = '${team.id}'`);
});

test('feedback: anyone approved reports bugs and ideas; triage (the IT role) replies, sets status and plans workshops', async () => {
  const told = async (fid: string) => (await rows(`select title, body from my_notifications() where data->>'feedbackId' = '${fid}'`));
  // Lisa (u-libr) is given the IT role; she needs her authenticator app like any admin.
  await asSuper();
  await db.exec(`update profiles set admin_tier = 'it' where id = ${id('u-libr')}`);
  assert.ok((await rows(`select 1 from permission_catalog() where key = 'feedback.triage'`)).length === 1);
  assert.ok((await one(`select 'feedback.triage' = any (app.tier_permissions('director')) as ok`)).ok);

  // A student sends a bug; checks on what they send.
  await as('u-s01');
  await rejects(`select * from feedback_send('rant', 'other', 'x')`, /bug or an idea/);
  await rejects(`select * from feedback_send('bug', 'other', '  ')`, /short title/);
  await rejects(`select * from feedback_send('bug', 'moon', 'x')`, /feedback_area_check/);
  const bug = await one(`select * from feedback_send('bug', 'carline', 'Map spins', 'It keeps spinning on my phone.', 'ios 27.0 · app 0.1.0')`);
  assert.deepEqual([bug.status, bug.area, bug.device], ['new', 'carline', 'ios 27.0 · app 0.1.0']);
  await rejects(`insert into feedback (author_id, kind, title) values (${id('u-s01')}, 'bug', 'x')`, /permission denied/);
  await as('u-p01');
  const idea = await one(`select * from feedback_send('idea', 'calendar', 'Add to my phone calendar')`);

  // Each sees only their own; triage needs the permission and a verified session.
  assert.deepEqual((await rows(`select title from feedback_list()`)).map((f) => f.title), ['Add to my phone calendar']);
  assert.equal((await rows(`select 1 from feedback`)).length, 1);
  await rejects(`select * from feedback_triage('${bug.id}', 'planned')`, /permission/);
  await as('u-libr');
  assert.equal((await rows(`select 1 from feedback_list()`)).length, 0, 'not without the authenticator');
  await rejects(`select * from feedback_triage('${bug.id}', 'planned')`, /MFA_REQUIRED/);
  await as('u-libr', true);
  assert.match((await told(bug.id)).map((n) => n.title).join(), /🐞 Bug report: Map spins/);
  const list = await rows(`select * from feedback_list()`);
  assert.deepEqual(list.map((f) => [f.title, f.author_role]), [['Add to my phone calendar', 'parent'], ['Map spins', 'student']]);

  // A workshop; the bug goes into it, with a reply, and the student hears.
  await rejects(`select * from feedback_workshop_save(null, ' ')`, /title/);
  const ws = await one(`select * from feedback_workshop_save(null, 'Debugging maps', 'Find out why the map spins.', app.school_today() + 7)`);
  await rejects(`select * from feedback_triage('${bug.id}', 'maybe')`, /Choose a status/);
  await rejects(`select * from feedback_triage('${bug.id}', 'planned', 'urgent')`, /low, medium or high/);
  await one(`select * from feedback_triage('${bug.id}', 'planned', 'high', 'Thanks! Students will look at it.', '${ws.id}')`);
  await one(`select * from feedback_triage('${bug.id}', 'planned', 'medium', 'Thanks! Students will look at it.', '${ws.id}')`);
  assert.equal((await one(`select workshop_title from feedback_list() where id = '${bug.id}'`)).workshop_title, 'Debugging maps');
  await as('u-s01');
  const notes = await told(bug.id);
  assert.deepEqual(notes.map((n) => n.body), ['Planned · Thanks! Students will look at it.'], 'a priority change alone tells no one');
  const mine = await one(`select * from feedback_list()`);
  assert.deepEqual([mine.status, mine.reply, mine.priority], ['planned', 'Thanks! Students will look at it.', 'medium']);
  assert.equal((await rows(`select 1 from feedback_workshops`)).length, 0, 'workshops are for triage');
  await rejects(`select * from feedback_workshop_save(null, 'Mine')`, /permission/);

  // Deleting the workshop keeps the feedback.
  await as('u-libr', true);
  await one(`select feedback_workshop_delete('${ws.id}')`);
  assert.equal((await one(`select workshop_id from feedback where id = '${bug.id}'`)).workshop_id, null);
  await asSuper();
  await db.exec(`delete from feedback where id in ('${bug.id}', '${idea.id}'); update profiles set admin_tier = null where id = ${id('u-libr')}`);
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

test('critical alert answers carry the location of staff who agreed, placed on the Wi-Fi map for the senders', async () => {
  const [eng, sci] = [(await one(`select ${id('u-eng')} as u`)).u as string, (await one(`select ${id('u-sci')} as u`)).u as string];
  // The map: alerts.map holders (directors here) keep it; nobody else can.
  await as('u-eng');
  await rejects(`select * from wifi_ap_save('3c:84:6a:00:00:10', 'Room 112')`, /permission/);
  await rejects(`select alert_location_consent(null)`, /yes or no/);
  await one(`select alert_location_consent(true)`);
  await as('u-sci');
  await one(`select alert_location_consent(false)`);
  await as('u-p01');
  await rejects(`select alert_location_consent(true)`, /teachers and staff/);
  await as('u-admin', true);
  await rejects(`select * from wifi_ap_save('not-a-mac', 'Room 112')`, /isn't a MAC address/);
  const ap = await one(`select * from wifi_ap_save('3C-84-6A-00-00-10', 'Room 112', 'Main building', '1st floor')`);
  assert.equal(ap.bssid, '3c:84:6a:00:00:10');
  await rejects(`select wifi_ap_import('[{"bssid":"3c846a000020","place":"Gym"},{"bssid":"zz","place":"Library"}]')`, /Line 2/);
  assert.equal((await rows(`select 1 from wifi_access_points where place = 'Gym'`)).length, 0, 'a bad line saves nothing');
  assert.equal((await one(`select wifi_ap_import('[{"bssid":"3c846a000020","place":"Gym"},{"bssid":"3c:84:6a:00:01:30","place":"Library","floor":"2nd floor"}]') as n`)).n, 2);
  await one(`select * from wifi_ap_save('3c:84:6a:00:00:21', 'Gymnasium', '', '', '', '3c:84:6a:00:00:20')`);
  assert.deepEqual((await rows(`select bssid, place from wifi_access_points order by bssid`)).map((r) => [r.bssid, r.place]),
    [['3c:84:6a:00:00:10', 'Room 112'], ['3c:84:6a:00:00:21', 'Gymnasium'], ['3c:84:6a:00:01:30', 'Library']]);
  await as('u-eng');
  assert.equal((await rows(`select 1 from wifi_access_points`)).length, 0, 'staff without the map or alerts see none');

  // An alert: Jennifer answers and her phone sends where it is; Jessica said no, so hers isn't kept.
  await as('u-admin', true);
  const alert = await one(`select * from critical_alert_send('weather', 'Tornado warning', 'Go to your shelter area.')`);
  await as('u-eng');
  await rejects(`select critical_alert_share_location('${alert.id}', 34.72, -86.61)`, /Answer the alert first/);
  await one(`select * from critical_alert_respond('${alert.id}', 'help', 'Two students hurt')`);
  await rejects(`select critical_alert_share_location('${alert.id}', 34.72, null)`, /both latitude and longitude/);
  await one(`select critical_alert_share_location('${alert.id}', 34.7264, -86.6177, 12, now(), '3C:84:6A:00:00:1A', 'KH-Staff')`);
  await as('u-sci');
  await one(`select * from critical_alert_respond('${alert.id}', 'safe')`);
  await one(`select critical_alert_share_location('${alert.id}', 34.7, -86.6, 5, now(), '3c:84:6a:00:01:30')`);
  assert.deepEqual(await one(`select lat, bssid, location_error from critical_alert_responses where alert_id = '${alert.id}' and user_id = '${sci}'`),
    { lat: null, bssid: null, location_error: 'no_consent' });
  await as('u-p02');
  assert.equal((await rows(`select 1 from critical_alert_responses where alert_id = '${alert.id}'`)).length, 0);

  // The senders see it, with the place from the map (this BSSID is another radio of Room 112's access point).
  await as('u-admin', true);
  const roll = (await one(`select critical_alert_status('${alert.id}') as r`)).r as any[];
  const jen = roll.find((r) => r.id === eng);
  assert.deepEqual([jen.status, jen.lat, jen.lng, jen.accuracy, jen.bssid, jen.ssid, jen.consent],
    ['help', 34.7264, -86.6177, 12, '3c:84:6a:00:00:1a', 'KH-Staff', true]);
  assert.deepEqual(jen.place, { place: 'Room 112', building: 'Main building', floor: '1st floor', approx: true });
  assert.deepEqual([roll.find((r) => r.id === sci).locationError, roll.find((r) => r.id === sci).consent], ['no_consent', false]);
  await one(`select * from wifi_ap_save('3c:84:6a:00:00:1a', 'Room 112', 'Main building', '1st floor')`);
  assert.equal((await one(`select critical_alert_status('${alert.id}') as r`)).r.find((r: any) => r.id === eng).place.approx, false);

  // No fix: the reason is kept. Locations are erased once the alert has been over long enough.
  await as('u-eng');
  await one(`select critical_alert_share_location('${alert.id}', null, null, null, null, null, null, 'denied')`);
  assert.equal((await one(`select location_error from critical_alert_responses where alert_id = '${alert.id}' and user_id = '${eng}'`)).location_error, 'denied');
  await one(`select critical_alert_share_location('${alert.id}', 34.7264, -86.6177, 12)`);
  await as('u-admin', true);
  await one(`select * from critical_alert_end('${alert.id}', 'All clear.')`);
  await asSuper();
  assert.equal((await one(`select app.purge_alert_locations() as n`)).n, 0, 'kept for alert_location_days after the all clear');
  await db.exec(`update critical_alerts set ended_at = now() - interval '31 days' where id = '${alert.id}'`);
  assert.equal((await one(`select app.purge_alert_locations() as n`)).n, 1);
  assert.equal((await one(`select lat from critical_alert_responses where alert_id = '${alert.id}' and user_id = '${eng}'`)).lat, null);
  await db.exec(`delete from wifi_access_points; delete from location_consents`);
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

test('pickup transfers: a parent hands pickup to an approved account for a day; they accept or decline', async () => {
  const noah = id('u-s04');
  await asSuper();
  await db.exec(`update app.settings set value = app.school_today()::text where key = 'carline_open_on';
                 delete from carline_pickups where student_id = ${noah}`);
  const [sun, priya, noahId] = Object.values(await one(`select ${id('u-p04')} as a, ${id('u-p07')} as b, ${noah} as c`));
  const told = async (re: RegExp) =>
    (await rows(`select title from my_notifications() where data->>'carline' = 'transfer'`)).some((n) => re.test(n.title));

  // Parents find people by name: approved adults only (never students, never themselves), and only their names.
  await as('u-p04');
  const found = (await one(`select pickup_transfer_people('priya sha') as p`)).p;
  assert.deepEqual(found, [{ id: priya, name: 'Priya Shah' }]);
  assert.deepEqual((await one(`select pickup_transfer_people('noah kim') as p`)).p, [], 'never students');
  assert.deepEqual((await one(`select pickup_transfer_people('sun kim') as p`)).p, [], 'never yourself');
  assert.deepEqual((await one(`select pickup_transfer_people('p') as p`)).p, [], 'two letters at least');
  await as('u-s01');
  await rejects(`select pickup_transfer_people('priya')`, /Only parents/);

  // Only the child's parents ask, only of an approved adult, and only for today or ahead.
  await as('u-p02');
  await rejects(`select pickup_transfer(array[${noah}], '${priya}')`, /Only a child's parents/);
  await as('u-p04');
  await rejects(`select pickup_transfer(array[${noah}], ${id('u-s01')})`, /approved Royals Connect account/);
  await rejects(`select pickup_transfer(array[${noah}], '${sun}')`, /approved Royals Connect account/);
  await rejects(`select pickup_transfer(array[${noah}], '${priya}', app.school_today() - 1)`, /today or a day ahead/);
  const ask = (await one(`select pickup_transfer(array[${noah}], '${priya}') as r`)).r;
  await rejects(`select pickup_transfer(array[${noah}], ${id('u-p02')})`, /already handed/);

  // Priya is asked; until she accepts, Noah isn't hers to pick up.
  await as('u-p07');
  assert.ok(await told(/Can you pick up Noah\?/));
  const asked = (await one(`select my_pickup_transfers() as t`)).t.asked;
  assert.deepEqual([asked.length, asked[0].requestId, asked[0].status, asked[0].children[0].studentId], [1, ask, 'pending', noahId]);
  await rejects(`select * from carline_announce(array[${noah}], ${AT})`, /own children|pick up/);

  // She declines and Sun hears. Sun asks again; only Priya can answer, and this time she accepts.
  await one(`select pickup_transfer_answer('${ask}', false)`);
  await rejects(`select pickup_transfer_answer('${ask}', true)`, /isn't waiting/);
  await as('u-p04');
  assert.ok(await told(/Priya Shah can't pick up Noah/));
  const again = (await one(`select pickup_transfer(array[${noah}], '${priya}') as r`)).r;
  await as('u-p02');
  await rejects(`select pickup_transfer_answer('${again}', true)`, /isn't waiting/);
  await as('u-p07');
  await one(`select pickup_transfer_answer('${again}', true)`);
  assert.ok((await rows(`select x as id from my_pickup_children() x`)).some((r) => r.id === noahId), 'Noah is in her car line today');
  await as('u-p04');
  assert.ok(await told(/Priya Shah will pick up Noah/));

  // Now only Priya checks Noah in: Sun's check-in skips him.
  const handed = (await one(`select my_pickup_transfers() as t`)).t.children.find((k: any) => k.status === 'accepted');
  assert.deepEqual([handed.child, handed.to, handed.from], ['Noah', 'Priya Shah', 'Sun Kim']);
  assert.deepEqual(await rows(`select * from carline_announce(array[${noah}], ${AT})`), []);
  await as('u-p07');
  const [hers] = await rows(`select * from carline_announce(array[${noah}], ${AT})`);
  assert.equal(hers.guardian_id, priya);

  // Sun calls it off: Priya's check-in for Noah goes with it and she hears; Sun can check him in again.
  await as('u-p04');
  await one(`select pickup_transfer_cancel('${handed.id}')`);
  await rejects(`select pickup_transfer_cancel('${handed.id}')`, /can't be changed/);
  await asSuper();
  assert.equal((await one(`select status from carline_pickups where id = '${hers.id}'`)).status, 'cancelled');
  await as('u-p07');
  assert.equal((await rows(`select x from my_pickup_children() x where x = ${noah}`)).length, 0);
  assert.ok(await told(/Pickup of Noah called off/));
  await as('u-p04');
  const [mine] = await rows(`select * from carline_announce(array[${noah}], ${AT})`);
  assert.equal(mine.guardian_id, sun);

  // A parent checking in while an ask waits for an answer calls the ask off.
  await one(`select carline_cancel('${mine.id}')`);
  const third = (await one(`select pickup_transfer(array[${noah}], '${priya}') as r`)).r;
  await rows(`select * from carline_announce(array[${noah}], ${AT})`);
  await asSuper();
  assert.equal((await one(`select status from pickup_transfers where request_id = '${third}'`)).status, 'cancelled');

  // A day ahead: accepted, but not hers until then; she can still say she can't make it, and Sun hears.
  await as('u-p04');
  const later = (await one(`select pickup_transfer(array[${noah}], '${priya}', app.school_today() + 1) as r`)).r;
  await as('u-p07');
  await one(`select pickup_transfer_answer('${later}', true)`);
  assert.equal((await rows(`select x from my_pickup_children() x where x = ${noah}`)).length, 0, 'not until that day');
  const ahead = (await one(`select my_pickup_transfers() as t`)).t.asked;
  assert.deepEqual(ahead.map((a: any) => [a.requestId, a.status]), [[later, 'accepted']]);
  await one(`select pickup_transfer_cancel('${ahead[0].children[0].id}')`);
  await as('u-p04');
  assert.ok(await told(/Priya Shah can't pick up Noah/));
  assert.deepEqual((await one(`select my_pickup_transfers() as t`)).t.children.filter((k: any) => k.status !== 'declined'), []);
  await rejects(`insert into pickup_transfers (request_id, student_id, to_id, day) values (gen_random_uuid(), ${noah}, '${priya}', app.school_today())`,
    /permission denied/);

  await asSuper();
  await db.exec(`delete from pickup_transfers; delete from carline_pickups where student_id = ${noah};
                 update app.settings set value = null where key = 'carline_open_on'`);
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

test('forms: teachers, coaches and the office send them; parents sign for each child; senders see who has', async () => {
  const uid = async (l: string) => (await one(`select ${id(l)} as u`)).u as string;
  const ava = await uid('u-s01');
  const told = async (who: string, form: string) => {
    await as(who);
    return (await rows(`select title || ' | ' || body as t from my_notifications() where data->>'formId' = '${form}' order by created_at`)).map((n) => n.t);
  };
  const questions = JSON.stringify([
    { kind: 'yes_no', prompt: 'May your child ride the bus?', required: true },
    { kind: 'text', prompt: 'Allergies or medicines?' },
    { kind: 'choice', prompt: 'Can you chaperone?', options: ['Yes', 'No', 'Maybe', 'No '] },
  ]);
  const send = (audience: string, target: string, q = questions, due = 'app.school_today() + 5', link = "'https://www.example.org/zoo.pdf'") =>
    `select * from form_send('Zoo field trip', 'We leave at 9 and are back by 2.', ${link}, ${due}, '${audience}', ${target}, '${q}'::jsonb)`;
  const section = `'eng10-p3', null, null`;

  // Only faculty and staff send, a teacher only to the classes they lead, and only the office to grades or the school.
  await as('u-p01');
  await rejects(send('section', section), /Faculty and staff send forms/);
  await as('u-sci');
  await rejects(send('section', section), /classes you teach/);
  await as('u-eng');
  await rejects(send('grades', `null, null, array[10]`), /permission/);
  await rejects(send('school', `null, null, null`), /permission/);
  await rejects(send('section', section, JSON.stringify(Array.from({ length: 11 }, () => ({ kind: 'text', prompt: 'Hi?' })))), /up to 10 questions/);
  await rejects(send('section', section, JSON.stringify([{ kind: 'choice', prompt: 'Pick', options: ['Only one'] }])), /2 to 10 choices/);
  await rejects(send('section', section, questions, 'app.school_today() - 1'), /due date from today on/);
  await rejects(send('section', section, questions, 'app.school_today() + 5', "'http://example.org'"), /https/);

  // Jennifer sends to her class: its five students, each question checked and numbered; each parent is told once.
  const trip = await one(send('section', section));
  assert.deepEqual(trip.questions.map((q: any) => [q.id, q.kind, q.required]), [['q1', 'yes_no', true], ['q2', 'text', false], ['q3', 'choice', false]]);
  assert.deepEqual(trip.questions[2].options, ['Yes', 'No', 'Maybe']);
  await asSuper();
  assert.equal(Number((await one(`select count(*) as n from form_recipients where form_id = '${trip.id}'`)).n), 5);
  assert.deepEqual(await told('u-p01', trip.id), [`📝 Zoo field trip | Please read and sign by ${(await one(`select to_char(app.school_today() + 5, 'Dy, Mon FMDD') as d`)).d}.`]);
  assert.deepEqual(await told('u-p05', trip.id), [], 'her child is not in the class');
  assert.deepEqual(await told('u-gran', trip.id), [], 'Family accounts are not parents');

  // Rosa sees it for Ava; parents of other children, Family accounts and students see nothing.
  await as('u-p01');
  const mine = (await one(`select my_forms() as f`)).f;
  assert.deepEqual(mine.map((f: any) => [f.title, f.sentTo, f.author, f.children.map((c: any) => [c.name, c.response])]),
    [['Zoo field trip', 'English 10 – Period 3', 'Jennifer Taylor', [['Ava', null]]]]);
  for (const who of ['u-p05', 'u-gran', 'u-s01']) {
    await as(who);
    assert.deepEqual((await one(`select my_forms() as f`)).f, [], who);
    assert.equal((await rows(`select 1 from forms`)).length, 0, who);
  }

  // Rosa signs for Ava: required answers, valid choices and a typed name; only for her own child.
  await as('u-p01');
  const sign = (student: string, agree: boolean, answers: object, name = 'Rosa Reyes') =>
    `select * from form_sign('${trip.id}', '${student}', ${agree}, '${JSON.stringify(answers)}'::jsonb, '${name}')`;
  await rejects(sign(ava, true, { q2: 'None' }), /Please answer "May your child ride the bus\?"/);
  await rejects(sign(ava, true, { q1: 'maybe' }), /yes or no/);
  await rejects(sign(ava, true, { q1: 'yes', q3: 'Sometimes' }), /Pick one of the choices/);
  await rejects(sign(ava, true, { q1: 'yes' }, ' '), /Type your full name/);
  await rejects(sign(await uid('u-s05'), true, { q1: 'yes' }), /Only a parent of a student/);
  assert.equal((await one(sign(ava, false, {}))).agreed, false, 'declining needs no answers');
  const signed = await one(sign(ava, true, { q1: 'yes', q3: 'Maybe', extra: 'dropped' }));
  assert.deepEqual([signed.agreed, signed.answers, signed.signature], [true, { q1: 'yes', q3: 'Maybe' }, 'Rosa Reyes'], 'signing again replaces it');
  await rejects(`insert into form_responses (form_id, student_id, agreed, signature) values ('${trip.id}', '${ava}', true, 'x')`, /permission denied/);
  await as('u-gran');
  await rejects(sign(ava, true, { q1: 'yes' }, 'June Reyes'), /Only a parent of a student/);

  // Jennifer sees who has signed; another teacher sees nothing.
  await as('u-eng');
  const status = (await one(`select form_status('${trip.id}') as s`)).s;
  assert.equal(status.students.length, 5);
  const avaRow = status.students.find((s: any) => s.studentId === ava);
  assert.deepEqual([avaRow.response.agreed, avaRow.hasParent], [true, true]);
  assert.match(avaRow.response.signedBy, / Reyes$/, "Rosa's name (an earlier test renamed her)");
  assert.equal(status.students.filter((s: any) => !s.response).length, 4);
  assert.deepEqual((await one(`select sent_forms() as f`)).f.map((f: any) => [f.title, f.students, f.agreed, f.declined]), [['Zoo field trip', 5, 1, 0]]);
  await as('u-sci');
  assert.equal((await one(`select form_status('${trip.id}') as s`)).s, null);
  assert.deepEqual((await one(`select sent_forms() as f`)).f, []);
  await rejects(`select form_remind('${trip.id}')`, /Only whoever sent/);

  // A reminder goes to the parents still to sign (not Rosa), at most once an hour.
  await asSuper();
  const waiting = Number((await one(`select count(distinct g.guardian_id) as n from form_recipients r join guardians g on g.student_id = r.student_id
    where r.form_id = '${trip.id}' and r.student_id <> '${ava}' and not app.is_family(g.guardian_id)`)).n);
  assert.ok(waiting >= 4);
  await as('u-eng');
  assert.equal((await one(`select form_remind('${trip.id}') as n`)).n, waiting);
  await rejects(`select form_remind('${trip.id}')`, /less than an hour ago/);
  assert.equal((await told('u-p01', trip.id)).length, 1);
  assert.match((await told('u-p02', trip.id)).at(-1)!, /^📝 Reminder: Zoo field trip/);

  // Closing stops signatures; only the sender closes.
  await as('u-sci');
  await rejects(`select form_close('${trip.id}')`, /Only whoever sent/);
  await as('u-eng');
  await one(`select form_close('${trip.id}')`);
  await as('u-p01');
  await rejects(sign(ava, false, {}), /closed/);

  // The office (forms.send, authenticator-verified) sends to grades and sees every form.
  await asSuper();
  await db.exec(`update profiles set grade = 10 where id = ${id('u-s02')}`);
  const tenth = Number((await one(`select count(*) as n from profiles where school_role = 'student' and grade = 10`)).n);
  await as('u-ap');
  await rejects(send('grades', `null, null, array[10]`), /MFA_REQUIRED/);
  await as('u-ap', true);
  const handbook = await one(send('grades', `null, null, array[10]`, '[]'));
  await asSuper();
  assert.equal(Number((await one(`select count(*) as n from form_recipients where form_id = '${handbook.id}'`)).n), tenth);
  await as('u-ap', true);
  assert.deepEqual((await one(`select sent_forms() as f`)).f.map((f: any) => f.sentTo).sort(), ['10th grade', 'English 10 – Period 3']);
  assert.equal((await one(`select form_status('${trip.id}') as s`)).s.students.length, 5);

  // A coach sends a release to the students registered for their activity season.
  await as('u-admin', true);
  const robotics = await one(`select * from sport_save(null, 'Robotics Club', '🤖', '', 'clubs')`);
  await one(`select sport_set_coach('${robotics.id}', ${id('u-vbcoach')}, true)`);
  await as('u-vbcoach');
  const season = await one(`select * from season_save(null, '${robotics.id}', 'Fall 2026', app.school_today() - 1, app.school_today() + 40,
    app.school_today() - 1, app.school_today() + 5, null, null)`);
  await as('u-p01');
  const reg = await one(`select * from sport_register('${season.id}', '${ava}')`);
  await as('u-vbcoach');
  await one(`select * from sport_decide('${reg.id}', true)`);
  const release = await one(send('season', `null, '${season.id}', null`, '[]'));
  await asSuper();
  assert.deepEqual((await rows(`select student_id from form_recipients where form_id = '${release.id}'`)).map((r) => r.student_id), [ava]);
  await as('u-eng');
  await rejects(send('season', `null, '${season.id}', null`, '[]'), /activities you coach or direct/);
  await as('u-p01');
  const forms = (await one(`select my_forms() as f`)).f.map((f: any) => `${f.sentTo}: ${f.status}`);
  assert.ok(forms.includes('English 10 – Period 3: closed') && forms.includes('Robotics Club · Fall 2026: open'), forms.join('; '));
});

test('form fees: the sender records who paid, how and where it was handed in; parents see their own', async () => {
  const uid = async (l: string) => (await one(`select ${id(l)} as u`)).u as string;
  const ava = await uid('u-s01');
  const send = (fee: string) => `select * from form_send('Science museum', 'Bus and admission.', null, app.school_today() + 7, 'section',
    'eng10-p3', null, null, '[]'::jsonb, ${fee})`;
  const pay = (form: string, student: string, cents: number, method: string, where: string, on = 'app.school_today()', note = '') =>
    `select * from form_record_payment('${form}', '${student}', ${cents}, '${method}', '${where}', ${on}, '${note}')`;

  await as('u-eng');
  await rejects(send('0'), /fee in dollars/);
  const museum = await one(send('2500'));
  assert.equal(museum.fee_cents, 2500);
  const free = await one(send('null'));

  // Only the sender records payments, for students the form went to, with how, where and when.
  for (const who of ['u-p01', 'u-sci']) {
    await as(who);
    await rejects(pay(museum.id, ava, 2500, 'cash', 'Front office'), /Only whoever sent/);
  }
  await as('u-eng');
  await rejects(pay(free.id, ava, 2500, 'cash', 'Front office'), /no fee/);
  await rejects(pay(museum.id, await uid('u-s05'), 2500, 'cash', 'Front office'), /didn't go to that student/);
  await rejects(pay(museum.id, ava, 0, 'cash', 'Front office'), /amount paid/);
  await rejects(pay(museum.id, ava, 2500, 'venmo', 'Front office'), /how it was paid/);
  await rejects(pay(museum.id, ava, 2500, 'cash', ' '), /where it was handed in/);
  await rejects(pay(museum.id, ava, 2500, 'cash', 'Front office', 'app.school_today() + 1'), /future/);
  const cash = await one(pay(museum.id, ava, 2500, 'cash', 'Front office'));
  assert.deepEqual([cash.method, cash.delivered_to, cash.amount_cents], ['cash', 'Front office', 2500]);

  // Rosa is told once; correcting it to a check doesn't tell her again.
  const told = async () => {
    await as('u-p01');
    return (await rows(`select title || ' | ' || body as t from my_notifications() where data->>'formId' = '${museum.id}' and title like '💵%'`)).map((n) => n.t);
  };
  assert.deepEqual(await told(), ['💵 Science museum | Payment received for Ava: $25.00 (cash).']);
  await as('u-eng');
  await one(pay(museum.id, ava, 2500, 'check', 'Mrs. Taylor', 'app.school_today()', 'Check #1042'));
  assert.equal((await told()).length, 1);

  // Rosa sees Ava's payment (not the sender's note); the sender sees everything and the totals.
  await as('u-p01');
  const mine = (await one(`select my_forms() as f`)).f.find((f: any) => f.id === museum.id);
  assert.equal(mine.feeCents, 2500);
  assert.deepEqual(mine.children[0].payment, { amountCents: 2500, method: 'check', deliveredTo: 'Mrs. Taylor', receivedOn: mine.children[0].payment.receivedOn });
  await as('u-eng');
  const row = (await one(`select form_status('${museum.id}') as s`)).s.students.find((x: any) => x.studentId === ava);
  assert.deepEqual([row.payment.method, row.payment.note, row.payment.recordedBy], ['check', 'Check #1042', 'Jennifer Taylor']);
  const sent = (await one(`select sent_forms() as f`)).f.find((f: any) => f.id === museum.id);
  assert.deepEqual([sent.paid, sent.collectedCents], [1, 2500]);

  // Other families see no payments; nobody writes them directly; a mistake can be removed.
  await as('u-p05');
  assert.equal((await rows(`select 1 from form_payments`)).length, 0);
  await rejects(`insert into form_payments (form_id, student_id, amount_cents, method, delivered_to, received_on)
    values ('${museum.id}', '${ava}', 1, 'cash', 'x', current_date)`, /permission denied/);
  await as('u-eng');
  await one(`select form_clear_payment('${museum.id}', '${ava}')`);
  assert.equal((await one(`select form_status('${museum.id}') as s`)).s.students.find((x: any) => x.studentId === ava).payment, null);
});

test("my_access: isDirector is always true or false, and every reply passes the app's check", async () => {
  for (const [who, mfa, director] of [['u-p01', false, false], ['u-eng', false, false], ['u-ap', true, false], ['u-admin', true, true]] as const) {
    await as(who, mfa);
    const a = (await one(`select my_access() as a`)).a;
    assert.equal(a.isDirector, director, `${who}: a boolean, not null`);
    assert.doesNotThrow(() => accessSchema.parse(a), who);
  }
});

test('deleting accounts: only people.delete holders; never yourself, a director or (without admins.manage) an admin', async () => {
  await asSuper();
  await db.exec(`insert into posts (group_id, author_id, kind, body) values (${id('g-announce')}, ${id('u-p06')}, 'message', 'Signed post');
    with p as (insert into posts (group_id, author_id, kind, body) values (${id('g-counsel')}, null, 'question', 'Anonymous question') returning id)
    insert into app.anonymous_authors (post_id, author_id) select id, ${id('u-p06')} from p;
    insert into comments (post_id, author_id, body) select id, ${id('u-p06')}, 'A reply' from posts where author_id = ${id('u-admin')} limit 1;`);
  assert.ok((await one(`select 'people.delete' = any (app.tier_permissions('director')) as ok`)).ok);
  assert.ok((await rows(`select 1 from permission_catalog() where key = 'people.delete'`)).length === 1);

  // Administrators and everyone else can't, and directors need their authenticator.
  await as('u-ap', true);
  await rejects(`select admin_delete_user(${id('u-p06')})`, /permission/);
  await as('u-admin');
  await rejects(`select admin_delete_user(${id('u-p06')})`, /MFA_REQUIRED/);
  await as('u-p01');
  await rejects(`select admin_delete_user(${id('u-p06')})`, /permission/);
  await rejects(`delete from profiles where id = ${id('u-p06')}`, /permission denied/);

  // Guards: not yourself, not a director, not a child (they're removed as students).
  await as('u-admin', true);
  await rejects(`select admin_delete_user(${id('u-admin')})`, /your own account/);
  await asSuper();
  await db.exec(`update profiles set admin_tier = 'director' where id = ${id('u-ap')}`);
  await as('u-admin', true);
  await rejects(`select admin_delete_user(${id('u-ap')})`, /director role first/);
  const child = (await one(`select admin_create_student('Delete', 'Testchild', 1, '2019-05-05') as id`)).id;
  await rejects(`select admin_delete_user('${child}')`, /Students list/);

  // Given to someone else, people.delete works on regular accounts but not on admins.
  await asSuper();
  await db.exec(`update profiles set admin_tier = 'administrator' where id = ${id('u-ap')};
                 update profiles set permissions = array['people.delete'] where id = ${id('u-libr')}`);
  await as('u-libr', true);
  await rejects(`select admin_delete_user(${id('u-ap')})`, /delete an admin/);
  await one(`select admin_delete_user(${id('u-p06')})`);

  await asSuper();
  assert.equal((await rows(`select 1 from profiles where id = ${id('u-p06')}`)).length, 0, 'profile gone');
  assert.equal((await rows(`select 1 from auth.users where id = ${id('u-p06')}`)).length, 0, 'login gone');
  assert.equal((await rows(`select 1 from posts where body in ('Signed post', 'Anonymous question')`)).length, 0, 'posts gone');
  assert.equal((await rows(`select 1 from comments where body = 'A reply'`)).length, 0, 'comments gone');
  const logged = await one(`select actor_id = ${id('u-libr')} as by_libr, detail from audit_log where action = 'user.deleted'`);
  assert.ok(logged.by_libr);
  assert.match(logged.detail.name, /\S/);
  await db.exec(`update profiles set permissions = '{}' where id = ${id('u-libr')}`);
});

test('critical alerts: the roll call leaves out staff without a login', async () => {
  await asSuper();
  await db.exec(`insert into profiles (id, first_name, last_name, school_role, managed)
    values ('aaaaaaaa-0000-4000-8000-000000000035', 'No', 'Login', 'teacher', true)`);
  await as('u-admin', true);
  const alert = await one(`select * from critical_alert_send('weather', 'Severe weather: shelter in place', 'Move to the hallways.')`);
  const roll = (await one(`select critical_alert_status('${alert.id}') as s`)).s as { id: string; role: string }[];
  assert.ok(roll.length > 0 && roll.every((r) => ['admin', 'teacher', 'staff'].includes(r.role)));
  assert.ok(!roll.some((r) => r.id === 'aaaaaaaa-0000-4000-8000-000000000035'), 'no login, never asked');
  assert.ok(roll.some((r) => r.role === 'teacher'), 'teachers with a login still are');
  await one(`select critical_alert_end('${alert.id}', 'All clear.')`);
  await asSuper();
  await db.exec(`delete from profiles where id = 'aaaaaaaa-0000-4000-8000-000000000035'`);
});

test('dress-up days: everyone reads them; only school calendar editors add, change and remove them', async () => {
  await db.exec(`set role anon`);
  const week = await rows(`select title, grade_from, grade_to from dress_days where week = 'Spirit Week' order by on_date, title`);
  assert.deepEqual(week.map((d) => d.title),
    ['Mismatch Monday', 'Team Tuesday', 'Western Wednesday', 'Character Day', 'Twinning Thursday', 'Royal Fun Friday']);
  assert.deepEqual([week[3].grade_from, week[3].grade_to], [-3, 5], 'Character Day is K2–5th');
  await rejects(`select dress_day_save(null, 'x', '2026-11-02', 'x')`, /permission denied/);

  await as('u-p01');
  await rejects(`select dress_day_save(null, 'Spirit Week', '2026-11-02', 'Pajama Day')`, /permission/);
  await rejects(`insert into dress_days (on_date, title) values ('2026-11-02', 'x')`, /permission denied/);
  await as('u-ap');
  await rejects(`select dress_day_save(null, null, '2026-11-02', 'Pajama Day')`, /MFA_REQUIRED/);

  await as('u-ap', true);
  await rejects(`select dress_day_save(null, null, '2026-11-02', ' ')`, /Give the day a name/);
  await rejects(`select dress_day_save(null, null, '2026-11-02', 'Pajama Day', '', 3, null)`, /both the first and last grade/);
  const id = (await one(`select dress_day_save(null, 'Cozy Week', '2026-11-02', 'Pajama Day', 'Pajamas!', 0, 5) as id`)).id;
  await one(`select dress_day_save('${id}', 'Cozy Week', '2026-11-03', 'Pajama Day', 'Comfy pajamas', 0, 5)`);
  assert.deepEqual(await one(`select on_date::text as d, details from dress_days where id = '${id}'`), { d: '2026-11-03', details: 'Comfy pajamas' });
  await one(`select dress_day_delete('${id}')`);
  assert.equal((await rows(`select 1 from dress_days where id = '${id}'`)).length, 0);
  await asSuper();
  assert.equal((await rows(`select 1 from audit_log where action like 'dress_day.%' and target_id = '${id}'`)).length, 3);
});

test('Royal News: everyone reads the archive; push.send holders add and remove issues', async () => {
  await db.exec(`set role anon`);
  const first = await one(`select title, sent_on::text as d, jsonb_array_length(blocks) as n from newsletters order by sent_on desc limit 1`);
  assert.deepEqual([first.title, first.d], ['Royals News', '2026-10-23']);
  assert.ok(first.n > 5);

  const blocks = `'[{"kind":"heading","text":"Welcome back"}]'::jsonb`;
  await as('u-p01');
  await rejects(`select newsletter_save('https://app.smore.com/n/abc12', 'Royals News', '2026-08-10', ${blocks})`, /permission/);
  await rejects(`insert into newsletters (title, sent_on, source_url, blocks) values ('x', current_date, 'https://app.smore.com/n/x', '[]')`, /permission denied/);
  await as('u-ap', true);
  await rejects(`select newsletter_save('https://evil.com/n/abc12', 'x', '2026-08-10', ${blocks})`, /Smore link/);
  await rejects(`select newsletter_save('https://app.smore.com/n/abc12', 'x', '2026-08-10', '[]')`, /nothing in it/);
  const id = (await one(`select newsletter_save('https://app.smore.com/n/abc12', 'Royals News', '2026-08-10', ${blocks}) as id`)).id;
  const again = (await one(`select newsletter_save('https://app.smore.com/n/abc12', 'Royals News', '2026-08-11', ${blocks}) as id`)).id;
  assert.equal(again, id, 'adding the same link again refreshes that issue');
  assert.equal((await one(`select sent_on::text as d from newsletters where id = '${id}'`)).d, '2026-08-11');
  await one(`select newsletter_delete('${id}')`);
  assert.equal((await rows(`select 1 from newsletters where id = '${id}'`)).length, 0);
});

test('student logins: parents (or the office) give a child a login with their email; it keeps the child\'s profile', async () => {
  await as('u-admin', true);
  const kid = (await one(`select admin_create_student('Winry', 'Logan', 1, '2019-03-03', ${id('u-p03')}, 'mother') as id`)).id;
  await asSuper();
  const linked = (await rows(`select 1 from guardians where student_id = '${kid}'`)).length;

  // Only the child's parents or the office (with the authenticator); never with an email already in use.
  await as('u-p02');
  await rejects(`select student_login_request('${kid}', 'winry@example.com')`, /permission/);
  await as('u-p03');
  await rejects(`select student_login_request('${kid}', 'not an email')`, /email address Winry/);
  await rejects(`select student_login_request('${kid}', 'U-P01@demo.khroyals.test')`, /already has a KH Royals account/);
  await rejects(`select student_login_request(${id('u-p01')}, 'x@example.com')`, /permission/);
  const req = (await one(`select student_login_request('${kid}', ' Winry@Example.com ') as r`)).r;
  assert.deepEqual([req.email, req.firstName], ['winry@example.com', 'Winry']);
  assert.equal((await one(`select student_login_status('${kid}') as s`)).s.hasLogin, false);

  // The student-login function creates the login with the child's id: the same profile, now with a login.
  await asSuper();
  await db.exec(`insert into auth.users (id, email) values ('${kid}', 'winry@example.com')`);
  const p = await one(`select first_name, school_role, managed, grade from profiles where id = '${kid}'`);
  assert.deepEqual([p.first_name, p.school_role, p.managed, p.grade], ['Winry', 'student', false, 1]);
  assert.equal((await rows(`select 1 from guardians where student_id = '${kid}'`)).length, linked, 'still linked to the parents');
  assert.equal((await one(`select email from profile_private where id = '${kid}'`)).email, 'winry@example.com');
  assert.match((await one(`select body from app.email_queue where to_email = 'winry@example.com'`)).body, /Hi Winry,[\s\S]*6-digit code/);
  await as('u-p03');
  assert.equal((await one(`select student_login_status('${kid}') as s`)).s.hasLogin, true);
  await rejects(`select student_login_request('${kid}', 'other@example.com')`, /already has a login/);
  await as('u-p02');
  assert.equal((await one(`select student_login_status('${kid}') as s`)).s, null, 'other parents see nothing');

  // Taking it away: no more login, but Winry stays on the roster with her parents.
  await as('u-p03');
  await one(`select student_login_remove('${kid}')`);
  await asSuper();
  assert.equal((await rows(`select 1 from auth.users where id = '${kid}'`)).length, 0);
  assert.equal((await one(`select managed from profiles where id = '${kid}'`)).managed, true);
  assert.equal((await rows(`select 1 from guardians where student_id = '${kid}'`)).length, linked);

  // The office can do it too (with the authenticator).
  await as('u-ap');
  await rejects(`select student_login_request('${kid}', 'winry2@example.com')`, /MFA_REQUIRED/);
  await as('u-ap', true);
  assert.equal((await one(`select student_login_request('${kid}', 'winry2@example.com') as r`)).r.email, 'winry2@example.com');
});

test('photo gallery: staff post albums everyone approved can see; only the poster, album creator or gallery.manage remove', async () => {
  await asSuper();
  const events = (await one(`select id from gallery_categories where name = 'Events'`)).id;
  await as('u-eng');
  const album = (await one(`select gallery_album_save(null, 'Fall Fest 2026', 'Bounce houses and face painting', '2026-10-30', false, '${events}') as id`)).id;
  const me = (await one(`select auth.uid()::text as u`)).u;
  assert.equal((await one(`select gallery_add_photos('${album}', '[{"path":"${me}/a.jpg","width":1600,"height":1200,"caption":"Dunk tank"},{"path":"${me}/b.jpg","width":1200,"height":1600}]') as n`)).n, 2);
  await rejects(`select gallery_add_photos('${album}', '[{"path":"someone-else/c.jpg","width":1,"height":1}]')`, /own folder/);
  await rejects(`select gallery_album_save(null, 'x', '', null, true, '${events}')`, /permission/);  // telling everyone needs push.send

  // Everyone approved sees it: parents, students, family; not people still waiting for approval.
  for (const u of ['u-p01', 'u-s01']) {
    await as(u);
    assert.equal((await rows(`select 1 from gallery_photos where album_id = '${album}'`)).length, 2, u);
    await rejects(`select gallery_album_save(null, 'Mine', '', null, false, '${events}')`, /Only staff/);
    await rejects(`select gallery_add_photos('${album}', '[]')`, /Only staff/);
  }
  await rejects(`insert into gallery_albums (title) values ('x')`, /permission denied/);

  // Another teacher can't remove it; the poster can remove a photo; gallery.manage can remove the album.
  await as('u-sci');
  const photo = (await one(`select id from gallery_photos where album_id = '${album}' and caption = 'Dunk tank'`)).id;
  await rejects(`select gallery_photo_delete('${photo}')`, /photos you posted/);
  await rejects(`select gallery_album_delete('${album}')`, /albums you started/);
  await as('u-eng');
  assert.equal((await one(`select gallery_photo_delete('${photo}') as p`)).p, `${me}/a.jpg`);
  await as('u-ap', true);
  const news = (await one(`select gallery_album_save('${album}', 'Fall Fest 2026', 'Updated', '2026-10-30', true, '${events}') as id`)).id;
  assert.equal(news, album);
  await asSuper();
  assert.equal((await one(`select data->>'albumId' as a from notifications where data ? 'albumId' order by created_at desc limit 1`)).a, album);
  await as('u-ap', true);
  assert.deepEqual((await one(`select gallery_album_delete('${album}') as p`)).p, [`${me}/b.jpg`]);
  assert.equal((await rows(`select 1 from gallery_albums where id = '${album}'`)).length, 0);
});

test('photo gallery: categories, and staff-only albums hidden (files too) until shown to everyone', async () => {
  await asSuper();
  const sports = (await one(`select id from gallery_categories where name = 'Sports'`)).id;
  await as('u-eng');
  await rejects(`select gallery_album_save(null, 'Volleyball', '', '2026-10-20')`, /Pick a category/);
  const album = (await one(`select gallery_album_save(null, 'Volleyball senior night', '', '2026-10-20', false, '${sports}', 'staff') as id`)).id;
  const me = (await one(`select auth.uid()::text as u`)).u;
  await one(`select gallery_add_photos('${album}', '[{"path":"${me}/v.jpg","width":10,"height":10,"caption":"Final point"}]')`);
  await asSuper();
  await db.exec(`insert into storage.objects (bucket_id, name, owner) values ('gallery', '${me}/v.jpg', '${me}'), ('gallery', '${me}/v_t.jpg', '${me}')`);

  // Staff only: other staff see it; parents and students see nothing, not even the files.
  await as('u-sci');
  assert.equal((await rows(`select 1 from gallery_photos where album_id = '${album}'`)).length, 1);
  for (const u of ['u-p01', 'u-s01']) {
    await as(u);
    assert.equal((await rows(`select 1 from gallery_albums where id = '${album}'`)).length, 0, u);
    assert.equal((await rows(`select 1 from gallery_photos where album_id = '${album}'`)).length, 0, u);
    assert.equal((await rows(`select 1 from storage.objects where bucket_id = 'gallery' and name like '${me}/v%'`)).length, 0, u);
  }
  await as('u-ap', true);
  await rejects(`select gallery_album_save('${album}', 'Volleyball senior night', '', '2026-10-20', true, '${sports}', 'staff')`, /before letting everyone know/);

  // Shown to everyone: parents see the album, the photo and both files.
  await as('u-eng');
  await one(`select gallery_album_save('${album}', 'Volleyball senior night', '', '2026-10-20', false, '${sports}', 'everyone')`);
  await as('u-p01');
  assert.equal((await rows(`select 1 from gallery_photos where album_id = '${album}' and caption ilike '%final%'`)).length, 1);
  assert.equal((await rows(`select 1 from storage.objects where bucket_id = 'gallery' and name like '${me}/v%'`)).length, 2);
  assert.ok((await rows(`select name from gallery_categories`)).length >= 8);

  // Categories: only gallery.manage adds or removes; removing one moves its albums.
  await rejects(`select gallery_category_save(null, 'Robotics')`, /permission/);
  await as('u-eng');
  await rejects(`select gallery_category_save(null, 'Robotics')`, /permission/);
  await as('u-ap', true);
  const robotics = (await one(`select gallery_category_save(null, 'Robotics', '🤖') as id`)).id;
  await rejects(`select gallery_category_save(null, 'robotics')`, /already/);
  await one(`select gallery_album_save('${album}', 'Volleyball senior night', '', '2026-10-20', false, '${robotics}', 'everyone')`);
  await rejects(`select gallery_category_delete('${robotics}', '${robotics}')`, /move to/);
  await one(`select gallery_category_delete('${robotics}', '${sports}')`);
  assert.equal((await one(`select category_id from gallery_albums where id = '${album}'`)).category_id, sports);
  await one(`select gallery_album_delete('${album}')`);
});

test('school check-in and check-out: the office records them, only to someone on the pickup list; parents hear', async () => {
  await asSuper();
  const uid = async (l: string) => (await one(`select ${id(l)} as u`)).u as string;
  const [ava, rosa, other] = [await uid('u-s01'), await uid('u-p01'), await uid('u-p02')];
  const told = async () => { await asSuper(); return rows(`select title, body from notifications where user_id = '${rosa}' and data ? 'schoolCheckId' order by created_at`); };
  assert.ok((await rows(`select 1 from permission_catalog() where key = 'checkin.manage'`)).length === 1);
  for (const role of ['director', 'administrator', 'office']) {
    assert.ok((await one(`select permissions from admin_roles where id = '${role}'`)).permissions.includes('checkin.manage'), role);
  }

  await as('u-sci');
  await rejects(`select school_check('${ava}', 'in', null, 'late')`, /permission/);
  await as('u-admin');
  await rejects(`select school_check('${ava}', 'in', null, 'late')`, /MFA_REQUIRED/);
  await as('u-admin', true);
  await rejects(`select school_check('${rosa}', 'in')`, /Choose a student/);
  await rejects(`select school_check('${ava}', 'sideways')`, /check in or check out/);
  await one(`select school_check('${ava}', 'in', null, 'late') as id`);
  await rejects(`select school_check('${ava}', 'out')`, /Choose who is taking/);
  await rejects(`select school_check('${ava}', 'out', '${other}', 'appointment')`, /isn't on .*pickup list/);
  const out = (await one(`select school_check('${ava}', 'out', '${rosa}', 'appointment', 'Dentist') as id`)).id;

  const notes = await told();
  assert.equal(notes.length, 2);
  assert.match(notes[0].title, /checked in at school/);
  assert.match(notes[0].body, /Late arrival/);
  assert.match(notes[1].title, /checked out of school/);
  assert.match(notes[1].body, /with .* · Appointment/);

  await as('u-admin', true);
  const found = (await one(`select checkin_students('${(await one(`select first_name from profiles where id = '${ava}'`)).first_name}') as s`)).s;
  assert.equal(found.find((s: any) => s.id === ava).status, 'out', 'where Ava stands today');
  const today = (await one(`select checkin_today() as t`)).t;
  assert.deepEqual(today.slice(0, 2).map((c: any) => c.kind), ['out', 'in'], 'newest first');
  assert.equal(today[0].note, 'Dentist');

  // Parents see their own child's; nobody else does.
  await as('u-p01');
  assert.equal((await rows(`select 1 from school_checks where student_id = '${ava}'`)).length, 2);
  await as('u-p02');
  assert.equal((await rows(`select 1 from school_checks`)).length, 0);
  await rejects(`select checkin_today()`, /permission/);

  // An approved pickup person for today may take her; a mis-tap can be undone, today only.
  await asSuper();
  await db.exec(`insert into pickup_authorizations (student_id, person_id, relationship) values ('${ava}', '${other}', 'family_friend')`);
  await as('u-admin', true);
  const withFriend = (await one(`select school_check('${ava}', 'out', '${other}', 'family') as id`)).id;
  await one(`select school_check_undo('${withFriend}')`);
  await rejects(`select school_check_undo('${withFriend}')`, /Only today's/);
  await asSuper();
  await db.exec(`update school_checks set day = day - 1 where id = '${out}'`);
  await as('u-admin', true);
  await rejects(`select school_check_undo('${out}')`, /Only today's/);

  await asSuper();
  await db.exec(`delete from pickup_authorizations where student_id = '${ava}' and person_id = '${other}';
    delete from school_checks; delete from notifications where data ? 'schoolCheckId' or data ? 'classAttendance'`);
});

test('event check-out: teachers and coaches release each child only to someone on their pickup list', async () => {
  await asSuper();
  const uid = async (l: string) => (await one(`select ${id(l)} as u`)).u as string;
  const [ava, liv, rosa, other, eng] = [await uid('u-s01'), await uid('u-s02'), await uid('u-p01'), await uid('u-p02'), await uid('u-eng')];

  // A teacher's own list, from the sections they lead.
  await as('u-p01');
  await rejects(`select checkout_list_save('Zoo', app.school_today(), array['${ava}']::uuid[])`, /teachers and staff/);
  await as('u-sci');
  await rejects(`select checkout_list_save('Zoo', app.school_today(), array['${ava}']::uuid[])`, /isn't in a class you lead/);
  await as('u-eng');
  await rejects(`select checkout_list_save('Zoo', app.school_today() - 1, array['${ava}']::uuid[])`, /today or a day coming up/);
  assert.ok((await one(`select checkout_my_students() as s`)).s.some((s: any) => s.id === ava), 'their section\'s students');
  const zoo = (await one(`select checkout_list_save('Zoo field trip', app.school_today(), array['${ava}', '${liv}']::uuid[]) as id`)).id;
  let list = (await one(`select checkout_list('${zoo}') as l`)).l;
  assert.equal(list.students.length, 2);
  assert.equal(list.canDelete, true);

  // The release sheet shows the child's pickup list; anyone else is refused.
  const people = (await one(`select checkout_people('${ava}') as p`)).p;
  assert.deepEqual(people.map((p: any) => p.id), [rosa]);
  await rejects(`select checkout_release('${zoo}', '${ava}', '${other}')`, /isn't on .*pickup list/);
  await one(`select checkout_release('${zoo}', '${ava}', '${rosa}')`);
  list = (await one(`select checkout_list('${zoo}') as l`)).l;
  assert.deepEqual(list.students.map((s: any) => s.id), [liv, ava], 'still waiting first');
  assert.ok(list.students[1].releasedTo && list.students[1].releasedAt);
  const lists = (await one(`select checkout_my_lists() as l`)).l;
  assert.deepEqual(lists.filter((l: any) => l.id === zoo).map((l: any) => [l.students, l.released]), [[2, 1]]);
  await asSuper();
  assert.match((await one(`select title from notifications where user_id = '${rosa}' and data ? 'checkoutListId'`)).title, /checked out of Zoo field trip/);

  // Other teachers can't see or run it; parents see their own child's row.
  await as('u-sci');
  await rejects(`select checkout_list('${zoo}')`, /Only the people running/);
  await rejects(`select checkout_release('${zoo}', '${liv}', '${other}')`, /Only the people running/);
  await rejects(`select checkout_people('${ava}')`, /Only the office/);
  await as('u-p01');
  assert.equal((await rows(`select 1 from checkout_releases where student_id = '${ava}'`)).length, 1);
  assert.equal((await rows(`select 1 from checkout_list_students where student_id = '${liv}'`)).length, 0);
  await as('u-eng');
  await one(`select checkout_unrelease('${zoo}', '${ava}')`);
  assert.equal((await one(`select checkout_list('${zoo}') as l`)).l.students.every((s: any) => !s.releasedTo), true);

  // An Activities event: its coaches get a list of the registered students.
  await asSuper();
  const sport = (await one(`insert into sports (name) values ('Chess club') returning id`)).id;
  const season = (await one(`insert into sport_seasons (sport_id, name, starts_on, ends_on) values ('${sport}', 'Fall', app.school_today() - 30, app.school_today() + 30) returning id`)).id;
  const event = (await one(`insert into sport_events (season_id, title, starts_at) values ('${season}', 'Tournament', now() + interval '2 hours') returning id`)).id;
  await db.exec(`insert into sport_registrations (season_id, student_id, status) values ('${season}', '${ava}', 'registered'), ('${season}', '${liv}', 'pending')`);
  await as('u-eng');
  await rejects(`select checkout_list_for_event('${event}')`, /coaches and directors/);
  await asSuper();
  await db.exec(`insert into sport_coaches (sport_id, user_id) values ('${sport}', '${eng}')`);
  await as('u-eng');
  assert.ok((await one(`select checkout_event_options() as e`)).e.some((e: any) => e.id === event && !e.listId));
  const chess = (await one(`select checkout_list_for_event('${event}') as id`)).id;
  assert.equal((await one(`select checkout_list_for_event('${event}') as id`)).id, chess, 'one list per event');
  const roster = (await one(`select checkout_list('${chess}') as l`)).l;
  assert.deepEqual(roster.students.map((s: any) => s.id), [ava], 'registered students only');
  assert.match(roster.title, /Chess club: Tournament/);

  await one(`select checkout_list_delete('${zoo}')`);
  await asSuper();
  await db.exec(`delete from checkout_lists; delete from sports where id = '${sport}'; delete from notifications where data ? 'checkoutListId'`);
});

test("class attendance: teachers take their sections' roll and see the office's check-ins; the office sees every class", async () => {
  await asSuper();
  const uid = async (l: string) => (await one(`select ${id(l)} as u`)).u as string;
  const [ava, liv, s03, rosa, eng] = [await uid('u-s01'), await uid('u-s02'), await uid('u-s03'), await uid('u-p01'), await uid('u-eng')];
  const sec = 'eng10-p3';
  const mark = (ids: string[], status: string | null, day = 'app.school_today()') =>
    `select class_attendance_mark('${sec}', ${day}, array[${ids.map((x) => `'${x}'`).join(', ')}]::uuid[], ${status ? `'${status}'` : 'null'})`;
  let roll: any;
  const load = async () => { roll = (await one(`select class_attendance_roll('${sec}') as r`)).r; };
  const st = (sid: string) => roll.students.find((s: any) => s.id === sid);

  // Only the section's teacher (and the office) take its roll.
  await as('u-p01');
  await rejects(mark([ava], 'present'), /Only the class's teacher/);
  await rejects(`select class_attendance_roll('${sec}')`, /Only the class's teacher/);
  await as('u-sci');
  await rejects(mark([ava], 'present'), /Only the class's teacher/);
  assert.deepEqual((await one(`select my_class_attendance() as c`)).c, [], 'leads no section');
  await as('u-eng');
  let mine = (await one(`select my_class_attendance() as c`)).c;
  assert.equal(mine.length, 1);
  assert.equal(mine[0].unmarked, mine[0].students, 'nobody marked yet');
  assert.equal(mine[0].takenAt, null);
  await rejects(mark([rosa], 'present'), /isn't in this class/);
  await rejects(mark([eng], 'present'), /isn't in this class/);
  await rejects(mark([ava], 'here'), /present, late or absent/);
  await rejects(mark([ava], 'present', 'app.school_today() + 1'), /ahead of the day/);
  await rejects(mark([ava], 'present', 'app.school_today() - 15'), /last two weeks/);
  await one(mark([ava, liv, ava], 'present'));
  await one(mark([s03], 'absent'));
  await one(mark([liv], 'late'));
  await load();
  assert.ok(roll.canMark);
  assert.ok(!roll.students.some((s: any) => s.id === eng), 'students only, not the teacher');
  assert.deepEqual([st(ava).state, st(liv).state, st(s03).state], ['present', 'late', 'absent']);
  assert.equal(st(ava).markedBy, 'Jennifer Taylor');

  // The office checks one in late and another out early; the teacher hears about both, and the roll follows.
  await as('u-admin', true);
  await one(`select school_check('${s03}', 'in', null, 'appointment')`);
  await one(`select school_check('${ava}', 'out', '${rosa}', 'illness')`);
  await asSuper();
  const told = await rows(`select title, body, data from notifications where user_id = '${eng}' and data ? 'classAttendance' order by created_at`);
  assert.equal(told.length, 2);
  assert.match(told[0].title, /arrived late/);
  assert.match(told[1].title, /left early/);
  assert.match(told[1].body, /with .* · Sick/);
  assert.equal(told[0].data.classAttendance, sec);
  await as('u-eng');
  await load();
  assert.equal(st(s03).state, 'late', "the office's late check-in counts over Absent");
  assert.equal(st(s03).mark, 'absent');
  assert.equal(st(ava).left, true);
  assert.deepEqual([st(ava).checks[0].kind, st(ava).checks[0].reason], ['out', 'illness']);
  mine = (await one(`select my_class_attendance() as c`)).c;
  assert.deepEqual([mine[0].present, mine[0].late, mine[0].absent, mine[0].left], [1, 2, 0, 1]);
  assert.ok(mine[0].takenAt);
  await one(mark([liv], null));
  await load();
  assert.equal(st(liv).state, null, 'cleared');
  assert.equal((await one(`select class_attendance_roll('${sec}', app.school_today() - 20) as r`)).r.canMark, false, 'older days are read-only');

  // Parents see their own child's marks; nobody else does, and only the office sees every class.
  await as('u-p01');
  assert.deepEqual((await rows(`select status from class_attendance`)).map((r) => r.status), ['present']);
  await as('u-p05');
  assert.equal((await rows(`select 1 from class_attendance`)).length, 0);
  await rejects(`select attendance_overview()`, /permission/);
  await as('u-admin');
  await rejects(`select attendance_overview()`, /MFA_REQUIRED/);
  await as('u-admin', true);
  const all = (await one(`select attendance_overview() as o`)).o;
  assert.ok(all.some((c: any) => c.id === sec && c.teacher === 'Jennifer Taylor' && c.absent === 0));
  // The office takes roll for a teacher who's out.
  await one(mark([liv], 'present'));

  await asSuper();
  await db.exec(`delete from class_attendance; delete from school_checks;
    delete from notifications where data ? 'classAttendance' or data ? 'schoolCheckId'`);
});

test('substitutes: closed by default; the class teacher or the office schedules them; class tools only while on duty', async () => {
  await asSuper();
  const uid = async (l: string) => (await one(`select ${id(l)} as u`)).u as string;
  const [ava, eng] = [await uid('u-s01'), await uid('u-eng')];
  const sub = await uid('u-sub');
  await db.query(`insert into auth.users (id, email, raw_user_meta_data) values ('${sub}', 'u-sub@demo.khroyals.test', '{"first_name":"Sam","last_name":"Sub"}')`);
  const sec = 'eng10-p3';
  const save = (o: { who?: string; from?: string; to?: string; start?: string; end?: string; plans?: string; id?: string } = {}) =>
    `select sub_schedule_save(${o.id ? `'${o.id}'` : 'null'}, '${o.who ?? sub}', array['${sec}'], ${o.from ?? 'app.school_today()'}, ${o.to ?? o.from ?? 'app.school_today()'},
      '${o.start ?? '00:00'}', '${o.end ?? '23:59:59'}', '${o.plans ?? 'Read chapter 4 aloud; quiz is in the top drawer.'}') as id`;
  const told = async (u: string, key: string) => { await asSuper(); return rows(`select title, body from notifications where user_id = '${u}' and data ? '${key}' order by created_at`); };

  // The office makes them a Substitute (Change roles); they never hold admin powers and leave every group.
  await as('u-admin', true);
  await one(`select admin_update_profile('${sub}', 'substitute')`);
  await rejects(`select admin_set_access('${sub}', null, array['push.send'])`, /Substitutes can't have admin powers/);
  assert.ok((await rows(`select 1 from permission_catalog() where key = 'subs.manage'`)).length === 1);
  for (const role of ['director', 'administrator', 'office']) {
    assert.ok((await one(`select permissions from admin_roles where id = '${role}'`)).permissions.includes('subs.manage'), role);
  }

  // Closed by default.
  await as('u-sub');
  assert.equal((await rows(`select id from groups`)).length, 0, 'no groups');
  assert.equal((await rows(`select id from rosters`)).length, 0, 'no class list');
  assert.equal((await rows(`select 1 from roster_members`)).length, 0, 'no rosters');
  await rejects(`select join_group(${id('g-announce')})`, /Substitute accounts/);
  await rejects(`select ask_school('Other', 'Hello', 'A question')`, /Substitute accounts/);
  await rejects(`select request_child('Pat', 'Doe', 3, null, null, 'mother')`, /Only approved parents and staff/);
  assert.deepEqual((await one(`select my_class_attendance() as c`)).c, []);
  assert.deepEqual((await one(`select my_sub_days() as d`)).d, []);
  await rejects(`select class_attendance_roll('${sec}')`, /Only the class's teacher/);
  await rejects(`select carline_board()`, /school staff/);
  await rejects(`select sub_options()`, /teachers and the office/);

  // Only the class's teacher (or the office) schedules a sub for it.
  await as('u-sci');
  await rejects(save(), /permission/);
  await as('u-p01');
  await rejects(save(), /permission/);
  await as('u-eng');
  const opts = (await one(`select sub_options() as o`)).o;
  assert.deepEqual(opts.classes.map((c: any) => c.id), [sec]);
  assert.equal(opts.people[0].id, sub, 'substitutes first');
  assert.ok(!opts.people.some((p: any) => p.role === 'parent' || p.id === eng));
  await rejects(save({ who: await uid('u-p01') }), /Choose a substitute/);
  await rejects(save({ who: eng }), /already teaches/);
  await rejects(save({ from: 'app.school_today() + 2', to: 'app.school_today() + 1' }), /last day can't be before/);
  await rejects(save({ from: 'app.school_today() - 2', to: 'app.school_today() - 1' }), /today or a day coming up/);
  await rejects(save({ start: '15:00', end: '08:00' }), /end time must be after/);
  const later = (await one(save({ from: 'app.school_today() + 3', to: 'app.school_today() + 4', start: '07:30', end: '15:30' }))).id;

  // Before the day: when and which class, but not the plans or the class itself.
  await as('u-sub');
  let days = (await one(`select my_sub_days() as d`)).d;
  assert.equal(days.length, 1);
  assert.deepEqual([days[0].onDuty, days[0].plans, days[0].classes[0].id, days[0].startTime], [false, null, sec, '07:30']);
  await rejects(`select class_attendance_roll('${sec}')`, /Only the class's teacher/);
  assert.match((await told(sub, 'subDays'))[0].title, /You're subbing: English 10/);

  // On duty today: the class's roll (today's only), the plans, today's check-out lists, the car line board and alerts.
  await as('u-eng');
  const today = (await one(save())).id;
  await as('u-sub');
  days = (await one(`select my_sub_days() as d`)).d;
  const now = days.find((d: any) => d.id === today);
  assert.equal(now.onDuty, true);
  assert.match(now.plans, /chapter 4/);
  assert.deepEqual((await one(`select my_class_attendance() as c`)).c.map((c: any) => c.id), [sec]);
  assert.equal((await one(`select class_attendance_roll('${sec}') as r`)).r.canMark, true);
  await one(`select class_attendance_mark('${sec}', app.school_today(), array['${ava}']::uuid[], 'present')`);
  await rejects(`select class_attendance_mark('${sec}', app.school_today() - 1, array['${ava}']::uuid[], 'absent')`, /today's roll only/);
  await rejects(`select class_attendance_roll('${sec}', app.school_today() - 1)`, /today's roll only/);
  assert.equal((await one(`select class_attendance_roll('${sec}') as r`)).r.otherDays, false);
  assert.ok((await one(`select checkout_my_students() as s`)).s.some((s: any) => s.id === ava));
  await rejects(`select checkout_list_save('Library', app.school_today() + 1, array['${ava}']::uuid[])`, /today only/);
  const walk = (await one(`select checkout_list_save('Library walk', app.school_today(), array['${ava}']::uuid[]) as id`)).id;
  assert.ok((await one(`select checkout_my_lists() as l`)).l.some((l: any) => l.id === walk));
  assert.ok(Array.isArray((await one(`select carline_board() as b`)).b));
  assert.deepEqual((await one(`select sub_schedule_list() as l`)).l, [], 'the sub never sees the schedule itself');

  await as('u-admin', true);
  await one(`select school_check('${ava}', 'in', null, 'appointment')`);
  const alert = (await one(`select id from critical_alert_send('other', 'Drill', '')`)).id;
  assert.equal((await told(sub, 'classAttendance')).length, 1, "the office's check-ins reach the sub on duty");
  assert.equal((await told(sub, 'alertId')).length, 1, 'and so do critical alerts');
  await as('u-sub');
  assert.equal((await rows(`select 1 from critical_alerts where id = '${alert}'`)).length, 1);
  await one(`select critical_alert_respond('${alert}', 'safe')`);
  await as('u-admin', true);
  assert.ok((await one(`select critical_alert_status('${alert}') as s`)).s.some((p: any) => p.id === sub), 'on the roll call');
  await one(`select critical_alert_end('${alert}')`);

  // Off duty again: nothing of the class.
  await asSuper();
  await db.exec(`update sub_assignments set starts_on = app.school_today() - 1, ends_on = app.school_today() - 1 where id = '${today}'`);
  await as('u-sub');
  assert.deepEqual((await one(`select my_class_attendance() as c`)).c, []);
  await rejects(`select class_attendance_roll('${sec}')`, /Only the class's teacher/);
  await rejects(`select checkout_list('${walk}')`, /Only the people running/);
  assert.equal((await rows(`select 1 from checkout_lists`)).length, 0);
  assert.equal((await rows(`select 1 from critical_alerts`)).length, 0);
  await rejects(`select carline_board()`, /school staff/);
  days = (await one(`select my_sub_days() as d`)).d;
  assert.deepEqual(days.map((d: any) => [d.id, d.plans]), [[later, null]]);

  // Only during its hours.
  await asSuper();
  assert.equal((await one(`select app.duty_now('2026-11-02', '2026-11-03', '07:30', '15:30', '2026-11-03 08:00 America/Chicago') as x`)).x, true);
  assert.equal((await one(`select app.duty_now('2026-11-02', '2026-11-03', '07:30', '15:30', '2026-11-03 15:30 America/Chicago') as x`)).x, false);
  assert.equal((await one(`select app.duty_now('2026-11-02', '2026-11-03', '07:30', '15:30', '2026-11-04 08:00 America/Chicago') as x`)).x, false);

  // The office schedules for any class (behind the authenticator); the teacher hears and sees it, other teachers don't.
  await as('u-admin');
  await rejects(save({ from: 'app.school_today() + 5' }), /MFA_REQUIRED/);
  await as('u-admin', true);
  await one(save({ from: 'app.school_today() + 5' }));
  assert.match((await told(eng, 'subSchedule'))[0].title, /Sub scheduled: Sam Sub/);
  await as('u-eng');
  assert.equal((await one(`select sub_schedule_list() as l`)).l.length, 2);
  await as('u-sci');
  assert.deepEqual((await one(`select sub_schedule_list() as l`)).l, []);
  await rejects(`select sub_schedule_delete('${later}')`, /Only the class's teacher or the office/);
  await as('u-eng');
  await one(save({ id: later, from: 'app.school_today() + 3', plans: 'New plans.' }));
  await one(`select sub_schedule_delete('${later}')`);
  const subNotes = (await told(sub, 'subDays')).map((n) => n.title);
  assert.ok(subNotes.some((t) => /Your sub day changed/.test(t)) && subNotes.some((t) => /Sub day cancelled/.test(t)));

  await asSuper();
  await db.exec(`delete from sub_assignments; delete from checkout_lists; delete from class_attendance; delete from school_checks;
    delete from critical_alerts; delete from notifications where user_id in ('${sub}', '${eng}') or data ? 'alertId' or data ? 'schoolCheckId';
    delete from auth.users where id = '${sub}'`);
});

test('event tickets: leaders sell them, parents and staff buy through Stripe, and each paid ticket admits once', async () => {
  await asSuper();
  const uid = async (l: string) => (await one(`select ${id(l)} as u`)).u as string;
  const [eng, rosa] = [await uid('u-eng'), await uid('u-p01')];
  const sport = (await one(`insert into sports (name, category) values ('Fall Play', 'theater') returning id`)).id;
  const season = (await one(`insert into sport_seasons (sport_id, name, starts_on, ends_on) values ('${sport}', 'Fall', app.school_today() - 30, app.school_today() + 30) returning id`)).id;
  const show = (await one(`insert into sport_events (season_id, kind, title, starts_at) values ('${season}', 'performance', 'Opening night', now() + interval '3 days') returning id`)).id;
  const save = (on: boolean, types: object[], closes = 'null') => `select ticket_event_save('${show}', ${on}, ${closes}, '${JSON.stringify(types)}'::jsonb)`;
  const asService = async () => { await asSuper(); await db.exec('set role service_role'); };

  // Only the activity's leaders sell its tickets.
  await as('u-eng');
  await rejects(save(true, [{ name: 'Adult', priceCents: 1000 }]), /coaches and directors/);
  await asSuper();
  await db.exec(`insert into sport_coaches (sport_id, user_id) values ('${sport}', '${eng}')`);
  await as('u-eng');
  await rejects(save(true, []), /at least one kind/);
  await rejects(save(true, [{ name: 'Adult', priceCents: -5 }]), /from free to/);
  await rejects(save(true, [{ name: 'Adult', priceCents: 1000 }], `now() + interval '9 days'`), /by the time the event ends/);
  await one(save(true, [{ name: 'Adult', priceCents: 1000, capacity: 3 }, { name: 'Student', priceCents: 500 }]));
  let ev = (await one(`select ticket_event('${show}') as e`)).e;
  assert.equal(ev.leader, true);
  assert.deepEqual(ev.types.map((t: any) => [t.name, t.priceCents, t.left]), [['Adult', 1000, 3], ['Student', 500, null]]);
  const [adult, student] = ev.types.map((t: any) => t.id);
  const start = (a: number, s: number) => `select ticket_order_start('${show}', '[{"typeId":"${adult}","quantity":${a}},{"typeId":"${student}","quantity":${s}}]'::jsonb) as o`;

  // Students don't buy; parents see it on sale, and a hold counts against the limit.
  await as('u-s01');
  await rejects(start(1, 0), /parents, staff and family/);
  await as('u-p01');
  assert.ok((await one(`select tickets_on_sale() as t`)).t.some((t: any) => t.eventId === show && t.fromCents === 500));
  await rejects(start(4, 0), /Only 3 Adult tickets left/);
  await rejects(start(0, 0), /Choose how many/);
  const order = (await one(start(2, 1))).o;
  assert.deepEqual([order.totalCents, order.free, order.title, order.email], [2500, false, 'Fall Play: Opening night', 'u-p01@demo.khroyals.test']);
  await as('u-p02');
  await rejects(start(2, 0), /Only 1 Adult ticket left/);

  // Not paid yet: nothing to show, and only the service role (Stripe's webhook) marks it paid.
  await as('u-p01');
  assert.deepEqual((await one(`select my_tickets() as t`)).t, []);
  assert.equal((await one(`select ticket_order_status('${order.orderId}') as s`)).s.status, 'pending');
  await rejects(`select ticket_order_paid('${order.orderId}', 'cs_test', 'pi_test')`, /permission denied/);
  await asService();
  await one(`select ticket_order_checkout('${order.orderId}', 'cs_test_1', now() + interval '30 minutes')`);
  await one(`select ticket_order_paid('${order.orderId}', 'cs_test_1', 'pi_test_1')`);
  await one(`select ticket_order_paid('${order.orderId}', 'cs_test_1', 'pi_test_1')`);
  await asSuper();
  assert.equal((await rows(`select 1 from notifications where user_id = '${rosa}' and data->>'ticketOrderId' = '${order.orderId}'`)).length, 1, 'told once');

  await as('u-p01');
  const mine = (await one(`select my_tickets() as t`)).t;
  assert.equal(mine.length, 3);
  assert.equal(new Set(mine.map((t: any) => t.code)).size, 3);
  assert.equal((await one(`select ticket_for_wallet('${mine[0].id}') as w`)).w.title, 'Fall Play: Opening night');
  await rejects(`select ticket_pass('${mine[0].id}')`, /permission denied/);
  await as('u-p02');
  await rejects(`select ticket_for_wallet('${mine[0].id}')`, /isn't yours/);
  assert.equal((await rows(`select 1 from tickets`)).length, 0);

  // At the door: the leaders scan, and each ticket admits once.
  await rejects(`select ticket_admit('${show}', '${mine[0].code}')`, /coaches and directors/);
  await as('u-eng');
  const first = (await one(`select ticket_admit('${show}', 'KHT-${mine[0].code.toUpperCase()}') as r`)).r;
  assert.deepEqual([first.ok, first.type, first.admitted, first.sold], [true, mine[0].type, 1, 3]);
  assert.match((await one(`select ticket_admit('${show}', '${mine[0].code}') as r`)).r.message, /Already used/);
  assert.match((await one(`select ticket_admit('${show}', 'abc')`)).ticket_admit.message, /Not a KH Royals ticket/);
  const typed = (await one(`select ticket_admit('${show}', '${mine[1].code.slice(0, 8).toUpperCase()}') as r`)).r;
  assert.deepEqual([typed.ok, typed.admitted], [true, 2], 'the short code typed at the door');
  ev = (await one(`select ticket_event('${show}') as e`)).e;
  assert.deepEqual([ev.types[0].sold, ev.takingsCents], [2, 2500]);
  assert.equal((await one(`select ticket_sales('${show}') as s`)).s[0].tickets, '2 Adult, 1 Student');
  await rejects(save(true, [{ id: adult, name: 'Adult', priceCents: 1000, capacity: 1 }, { id: student, name: 'Student', priceCents: 500 }]), /has 2 sold already/);

  // An expired checkout lets its hold go; free tickets are issued at once.
  await as('u-p02');
  const held = (await one(start(1, 0))).o;
  await asService();
  await one(`select ticket_order_expired('${held.orderId}')`);
  await as('u-eng');
  await one(save(true, [{ id: adult, name: 'Adult', priceCents: 1000, capacity: 3 }, { id: student, name: 'Student', priceCents: 500 }, { name: 'Under 5', priceCents: 0 }]));
  const under5 = (await one(`select ticket_event('${show}') as e`)).e.types[2].id;
  await as('u-p02');
  assert.equal((await one(`select ticket_order_status('${held.orderId}') as s`)).s.status, 'cancelled');
  const free = (await one(`select ticket_order_start('${show}', '[{"typeId":"${under5}","quantity":2}]'::jsonb) as o`)).o;
  assert.equal(free.free, true);
  assert.equal((await one(`select my_tickets() as t`)).t.length, 2);

  // A kind with tickets sold stays; off sale, nothing more is sold.
  await as('u-eng');
  await rejects(save(true, [{ id: adult, name: 'Adult', priceCents: 1000, capacity: 3 }]), /has tickets sold, so it can't be removed/);
  await one(save(false, [{ id: adult, name: 'Adult', priceCents: 1000, capacity: 3 }, { id: student, name: 'Student', priceCents: 500 },
    { id: under5, name: 'Under 5', priceCents: 0 }]));
  await as('u-p01');
  assert.ok(!(await one(`select tickets_on_sale() as t`)).t.some((t: any) => t.eventId === show));
  await rejects(start(1, 0), /aren't on sale/);

  await asSuper();
  await db.exec(`delete from ticket_orders where event_id = '${show}'; delete from sports where id = '${sport}';
    delete from notifications where data ? 'ticketOrderId'`);
});

test('volunteer events: leaders group opportunities under an event like Harvest Fest', async () => {
  const save = (args: string) => `select volunteer_event_save(${args}) as id`;
  await as('u-p01');
  await rejects(save(`null, 'Harvest Fest', '', app.school_today() + 10`), /Only Volunteer Leaders/);
  await as('u-eng');
  await rejects(save(`null, '  ', '', app.school_today() + 10`), /Give the event a name/);
  await rejects(save(`null, 'Harvest Fest', '', app.school_today() + 10, app.school_today() + 9`), /end on or after/);
  const fest = (await one(save(`null, 'Harvest Fest', 'Our fall festival.', app.school_today() + 10, null, 'Front lawn'`))).id;
  const water = (await one(`select id from volunteer_post('Bring bottled water', '', app.school_today() + 9, null, null, null, null, null,
    'items', 'cases of water', 6, '${fest}')`)).id;
  const setup = (await one(`select id from volunteer_post('Set up the day of', 'Tables and tents.', app.school_today() + 10, null, '07:00', '09:00', 'Front lawn', 8)`)).id;
  await one(`select volunteer_set_event('${setup}', '${fest}')`);

  // Parents see the event and the opportunities inside it.
  await as('u-p01');
  assert.equal((await one(`select title from volunteer_events where id = '${fest}'`)).title, 'Harvest Fest');
  assert.deepEqual((await rows(`select title from volunteer_opportunities where event_id = '${fest}' order by title`)).map((o) => o.title),
    ['Bring bottled water', 'Set up the day of']);
  await rejects(`select volunteer_set_event('${setup}', null)`, /only move opportunities you lead/);
  await rejects(save(`'${fest}', 'Fall Fest', '', app.school_today() + 10`), /Only Volunteer Leaders/);

  // Only its leader changes or removes it; removing keeps the opportunities, on their own.
  await asSuper();
  await db.exec(`update profiles set volunteer_lead = true where id = ${id('u-sci')}`);
  await as('u-sci');
  await rejects(save(`'${fest}', 'Fall Fest', '', app.school_today() + 10`), /only change events you started/);
  await rejects(`select volunteer_event_delete('${fest}')`, /only remove events you started/);
  await as('u-eng');
  assert.equal((await one(save(`'${fest}', 'Harvest Fest 2026', 'Our fall festival.', app.school_today() + 10, app.school_today() + 11, 'Front lawn'`))).id, fest);
  await one(`select volunteer_event_delete('${fest}')`);
  assert.equal((await rows(`select 1 from volunteer_opportunities where event_id = '${fest}'`)).length, 0);
  assert.equal((await rows(`select 1 from volunteer_opportunities where id in ('${water}', '${setup}') and status = 'open'`)).length, 2);
  await rejects(`select volunteer_set_event('${setup}', '${fest}')`, /isn't open anymore/);
  await as('u-p01');
  assert.equal((await rows(`select 1 from volunteer_events where id = '${fest}'`)).length, 0, 'removed events are hidden');

  await asSuper();
  await db.exec(`update profiles set volunteer_lead = false where id = ${id('u-sci')};
    delete from volunteer_opportunities where id in ('${water}', '${setup}'); delete from volunteer_events`);
});

test("volunteer events: the event's leader puts its opportunities in order", async () => {
  await as('u-eng');
  const fest = (await one(`select volunteer_event_save(null, 'Harvest Fest', '', app.school_today() + 10) as id`)).id;
  const post = async (title: string, days: number) =>
    (await one(`select id from volunteer_post('${title}', '', app.school_today() + ${days}, p_event => '${fest}')`)).id;
  const water = await post('Bring bottled water', 9);
  const setup = await post('Set up the day of', 10);
  const booths = await post('Run the game booths', 10);
  const order = async () => (await rows(`select title from volunteer_opportunities where event_id = '${fest}'
    order by position nulls last, starts_on, title`)).map((o) => o.title);

  // Most important first; one left out of the list (added since) follows.
  await one(`select volunteer_event_reorder('${fest}', array['${booths}', '${water}']::uuid[])`);
  assert.deepEqual(await order(), ['Run the game booths', 'Bring bottled water', 'Set up the day of']);
  await one(`select volunteer_event_reorder('${fest}', array['${setup}', '${booths}', '${water}']::uuid[])`);
  assert.deepEqual(await order(), ['Set up the day of', 'Run the game booths', 'Bring bottled water']);

  // Only the event's leader: not parents, and not another Volunteer Leader.
  await as('u-p01');
  await rejects(`select volunteer_event_reorder('${fest}', array['${water}']::uuid[])`, /Only the event's leader/);
  await asSuper();
  await db.exec(`update profiles set volunteer_lead = true where id = ${id('u-sci')}`);
  await as('u-sci');
  await rejects(`select volunteer_event_reorder('${fest}', array['${water}']::uuid[])`, /Only the event's leader/);

  // Moving one out of the event drops its place.
  await as('u-eng');
  await one(`select volunteer_set_event('${setup}', null)`);
  assert.equal((await one(`select position from volunteer_opportunities where id = '${setup}'`)).position, null);
  assert.deepEqual(await order(), ['Run the game booths', 'Bring bottled water']);

  await asSuper();
  await db.exec(`update profiles set volunteer_lead = false where id = ${id('u-sci')};
    delete from volunteer_opportunities where id in ('${water}', '${setup}', '${booths}'); delete from volunteer_events`);
});

test("grade albums: only that grade's families and staff see them, and keep them; event albums are for everyone", async () => {
  await asSuper();
  const y = (await one('select app.school_year_end() as y')).y as number;
  await one(`select app.make_grade_albums(${y})`);
  const made = await rows(`select grade, title from gallery_albums where school_year = ${y} order by grade`);
  assert.deepEqual(made.map((a) => a.grade), [-3, -2, -1, 0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12], 'K2 through 12th');
  assert.equal(made.find((a) => a.grade === 3).title, `3rd Grade ${y - 1}–${String(y).slice(2)}`);
  assert.equal(made.find((a) => a.grade === -1).title, `K4 ${y - 1}–${String(y).slice(2)}`);
  const album = async (g: number, year = y) => {
    await asSuper();
    return (await one(`select id from gallery_albums where grade = ${g} and school_year = ${year}`)).id as string;
  };
  const [ninth, tenth] = [await album(9), await album(10)];
  const sees = async (u: string, a: string, mfa = false) => {
    await as(u, mfa);
    return (await rows(`select 1 from gallery_albums where id = '${a}'`)).length === 1;
  };

  // A 9th grader's parent (and the 9th grader) see the 9th grade album, not 10th; a 10th grader's parent the other way round.
  assert.equal(await sees('u-p07', ninth), true, 'Priya Shah: Emma is in 9th');
  assert.equal(await sees('u-p07', tenth), false);
  assert.equal(await sees('u-s09', ninth), true);
  assert.equal(await sees('u-s09', tenth), false);
  assert.equal(await sees('u-p04', tenth), true, 'Sun Kim: Noah is in 10th');
  assert.equal(await sees('u-p04', ninth), false);
  assert.equal(await sees('u-p04', await album(3)), false);
  // Staff see every grade; Family accounts (June is linked to Ava, 10th) see none.
  assert.equal(await sees('u-eng', ninth), true);
  assert.equal(await sees('u-libr', await album(-3)), true);
  assert.equal(await sees('u-gran', tenth), false);

  // Photos and their files follow the album.
  await as('u-eng');
  const me = (await one(`select auth.uid()::text as u`)).u;
  await one(`select gallery_add_photos('${tenth}', '[{"path":"${me}/g10.jpg","width":10,"height":10,"caption":"Science fair"}]')`);
  await asSuper();
  await db.exec(`insert into storage.objects (bucket_id, name, owner) values ('gallery', '${me}/g10.jpg', '${me}'), ('gallery', '${me}/g10_t.jpg', '${me}')`);
  for (const [u, n] of [['u-p07', 0], ['u-p04', 1], ['u-s01', 1]] as const) {
    await as(u);
    assert.equal((await rows(`select 1 from gallery_photos where album_id = '${tenth}'`)).length, n, u);
    assert.equal((await rows(`select 1 from storage.objects where bucket_id = 'gallery' and name like '${me}/g10%'`)).length, n * 2, u);
  }

  // Joining during the year: a parent linked now gets the album at once, and keeps it after the link goes.
  await asSuper();
  await db.exec(`insert into guardians (guardian_id, student_id) values (${id('u-p02')}, ${id('u-s09')})`);
  assert.equal(await sees('u-p02', ninth), true);
  await asSuper();
  await db.exec(`delete from guardians where guardian_id = ${id('u-p02')} and student_id = ${id('u-s09')}`);
  assert.equal(await sees('u-p02', ninth), true, 'kept until it is taken off');

  // Moving up: last year's albums stay too (Emma, in 9th now, was in 8th).
  await asSuper();
  await one(`select app.make_grade_albums(${y - 1})`);
  assert.equal(await sees('u-p07', await album(8, y - 1)), true);
  assert.equal(await sees('u-p07', await album(9, y - 1)), false);

  // Taking it off your own account: it doesn't come back with the next daily run.
  await as('u-p07');
  await one(`select gallery_album_leave('${ninth}')`);
  await rejects(`select gallery_album_leave('${ninth}')`, /isn't on your account/);
  await asSuper();
  await one(`select app.make_grade_albums(${y})`);
  assert.equal(await sees('u-p07', ninth), false);
  assert.equal(await sees('u-s09', ninth), true, 'Emma keeps hers');

  // The office (gallery.manage, with the authenticator) sees who's on it and puts people on or takes them off.
  await as('u-eng');
  await rejects(`select * from gallery_album_people('${ninth}')`, /permission/);
  await as('u-ap');
  await rejects(`select * from gallery_album_people('${ninth}')`, /MFA_REQUIRED/);
  await as('u-ap', true);
  const people = await rows(`select * from gallery_album_people('${ninth}')`);
  const priya = people.find((p) => p.name === 'Priya Shah');
  assert.deepEqual([priya.removed, priya.removed_by_self], [true, true]);
  assert.equal(people.find((p) => p.name === 'Emma Shah').removed, false);
  await one(`select gallery_album_set_member('${ninth}', ${id('u-p07')}, true)`);
  assert.equal(await sees('u-p07', ninth), true);
  await as('u-ap', true);
  await one(`select gallery_album_set_member('${ninth}', ${id('u-p02')}, false)`);
  assert.equal(await sees('u-p02', ninth), false);
  await rejects(`insert into gallery_album_members (album_id, user_id) values ('${ninth}', ${id('u-p01')})`, /permission denied/);

  // News of new photos in a grade album goes to its people only.
  await as('u-ap', true);
  const grades = (await one(`select id from gallery_categories where name = 'Grades'`)).id;
  await one(`select gallery_album_save('${tenth}', '10th Grade', '', null, true, '${grades}', 'everyone')`);
  await asSuper();
  const told = (await rows(`select user_id from notifications where data->>'albumId' = '${tenth}'`)).map((n) => n.user_id);
  const [kim, shah] = [(await one(`select ${id('u-p04')} as u`)).u, (await one(`select ${id('u-p07')} as u`)).u];
  assert.ok(told.includes(kim) && !told.includes(shah) && !told.includes(null), 'only the 10th grade');

  // Leaving the school (the account deleted): their place on the album goes with it.
  const temp = (await one(`insert into profiles (first_name, last_name, school_role, grade, managed) values ('Temp', 'Kid', 'student', 10, true) returning id`)).id;
  assert.equal((await rows(`select 1 from gallery_album_members where album_id = '${tenth}' and user_id = '${temp}'`)).length, 1);
  await db.exec(`delete from profiles where id = '${temp}'`);
  assert.equal((await rows(`select 1 from gallery_album_members where user_id = '${temp}'`)).length, 0);

  // Event albums: a Volunteer Leader (a parent here) makes Harvest Fest's with the event; once per event; everyone sees it.
  await db.exec(`update profiles set volunteer_lead = true where id = ${id('u-p05')}`);
  await as('u-p05');
  const fest = (await one(`select volunteer_event_save(null, 'Harvest Fest', '', app.school_today() + 10) as id`)).id;
  const festAlbum = (await one(`select gallery_event_album(p_volunteer_event => '${fest}') as a`)).a;
  assert.equal((await one(`select gallery_event_album(p_volunteer_event => '${fest}') as a`)).a, festAlbum);
  await as('u-p01');
  await rejects(`select gallery_event_album(p_volunteer_event => '${fest}')`, /leader or staff/);
  for (const u of ['u-p01', 'u-s09', 'u-gran', 'u-eng']) assert.equal(await sees(u, festAlbum), true, u);
  await asSuper();
  assert.equal((await one(`select title from gallery_albums where id = '${festAlbum}'`)).title, 'Harvest Fest');

  // And for school calendar events: staff make them (not parents, and not for a group's calendar).
  await as('u-ap', true);
  const program = (await one(`insert into events (title, starts_on) values ('Christmas Program', '2026-12-10') returning id`)).id;
  const dinner = (await one(`insert into events (group_id, title, starts_on) values (${id('g-vb')}, 'Team dinner 2', '2026-12-11') returning id`)).id;
  await as('u-p01');
  await rejects(`select gallery_event_album(p_calendar_event => '${program}')`, /Only staff/);
  await as('u-eng');
  const programAlbum = (await one(`select gallery_event_album(p_calendar_event => '${program}') as a`)).a;
  await rejects(`select gallery_event_album(p_calendar_event => '${dinner}')`, /school calendar/);
  await rejects(`select gallery_album_set_member('${programAlbum}', ${id('u-p01')}, true)`, /permission|MFA_REQUIRED/);
  assert.equal(await sees('u-p04', programAlbum), true);

  await asSuper();
  await db.exec(`update profiles set volunteer_lead = false where id = ${id('u-p05')};
    delete from gallery_albums where id in ('${festAlbum}', '${programAlbum}'); delete from volunteer_events where id = '${fest}';
    delete from events where id in ('${program}', '${dinner}')`);
});

test('the bell counts new notifications until the bell page opens them', async () => {
  await as('u-p04');
  await one('select clear_my_notifications()');
  assert.equal((await one('select my_unread_count() as n')).n, 0);
  await asSuper();
  await db.exec(`select app.notify_user(${id('u-p04')}, 'One', '', '{}'), app.notify_user(${id('u-p04')}, 'Two', '', '{}')`);
  await as('u-p04');
  assert.equal((await one('select my_unread_count() as n')).n, 2);
  const [first] = await rows('select id from my_notifications(50)');
  await one(`select mark_notifications_opened(array['${first.id}']::uuid[])`);
  assert.equal((await one('select my_unread_count() as n')).n, 1);
  await one('select clear_my_notifications()');
  assert.equal((await one('select my_unread_count() as n')).n, 0);
  // Only your own: someone else's count is theirs, and signed-out visitors have none.
  await as('u-p07');
  await one('select my_unread_count() as n');
  await asSuper();
  await db.exec('set role anon');
  await rejects('select my_unread_count()', /permission denied/);
  await asSuper();
});

/** Functions that send notifications, by their latest definition (the helpers that pass one on are left out). */
function notificationSenders(): string[] {
  const latest = new Map<string, string>();
  const create = /create\s+(?:or\s+replace\s+)?function\s+([\w.]+)\s*\((.*?)\)\s*returns.*?(\$\w*\$)(.*?)\3/gis;
  const drop = /drop\s+function\s+(?:if\s+exists\s+)?([\w.]+)/gi;
  for (const f of readdirSync(join(ROOT, 'supabase/migrations')).sort()) {
    const text = sql(join('supabase/migrations', f));
    const made = new Set<string>();
    const found = [...text.matchAll(create)].map((m) => ({ at: m.index!, name: m[1], body: m[4] as string | null }))
      .concat([...text.matchAll(drop)].map((m) => ({ at: m.index!, name: m[1], body: null })))
      .sort((a, b) => a.at - b.at);
    for (const x of found) {
      if (x.body !== null) { latest.set(x.name, x.body); made.add(x.name); }
      else if (!made.has(x.name)) latest.delete(x.name);  // a drop after the new version is the old overload
    }
  }
  const sends = /notify_user|insert\s+into\s+(?:public\.)?notifications\b|app\.notify_parents|app\.question_note/i;
  const helpers = ['app.notify_user', 'app.notify_parents', 'app.question_note', 'app.alerts_reach_subs'];
  return [...latest].filter(([name, body]) => sends.test(body) && !helpers.includes(name)).map(([name]) => name).sort();
}

// Notifications that only tell (the bell shows the whole message) and have no screen to open: the admin portal's
// announcements to everyone or to roles.
const TELL_ONLY = new Set(['send_notification']);

test('notifications: everything the app sends reaches a bell and a phone, and opens what it\'s about', async () => {
  await asSuper();
  const log = await rows<{ title: string; data: any; audience: string; recipients: number; pushes: number; reachable: number; sent_from: string }>(
    'select * from test_log.notifications');
  // The function that sent it: the innermost call on the stack that isn't a helper passing it on (by bare name;
  // the stack leaves the schema off some).
  const bare = (n: string) => n.replace(/^\w+\./, '');
  const passOn = ['notify_user', 'notify_parents', 'question_note', 'record'];
  const sender = (ctx: string) => [...ctx.matchAll(/function ([\w.]+)\(|SQL function "(\w+)"/g)]
    .map((m) => bare(m[1] ?? m[2])).find((n) => !passOn.includes(n)) ?? '(direct)';
  const sent = log.map((n) => ({ ...n, from: sender(n.sent_from) }));

  // Every function that sends one is exercised here, so the checks below cover it.
  const senders = notificationSenders().map(bare);
  const seen = new Set(sent.map((n) => n.from));
  assert.deepEqual(senders.filter((n) => !seen.has(n)), [], 'notification senders no test exercises');

  // Each reaches at least one person's bell (a group post, anyone it could), and their phone (the settings they
  // start with push it).
  const nobody = sent.filter((n) => n.from !== '(direct)' && n.reachable === 0).map((n) => `${n.from}: ${n.title}`);
  assert.deepEqual([...new Set(nobody)], [], 'notifications that reached nobody');
  const silent = sent.filter((n) => n.from !== '(direct)' && n.recipients > 0 && n.pushes === 0).map((n) => `${n.from}: ${n.title}`);
  assert.deepEqual([...new Set(silent)], [], 'notifications that pushed to nobody');

  // Tapping one opens what it's about.
  const nowhere = sent.filter((n) => n.from !== '(direct)' && !TELL_ONLY.has(n.from) && !notificationHref(n.data))
    .map((n) => `${n.from}: ${JSON.stringify(n.data)}`);
  assert.deepEqual([...new Set(nowhere)], [], 'notifications with nothing to open');
});
