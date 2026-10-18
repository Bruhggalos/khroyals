#!/usr/bin/env node
/**
 * End-to-end check against a live Supabase project, using the same queries
 * as src/api/connect.ts and the seeded demo accounts. Only works on a project
 * set up with `supabase_setup.mjs --demo` (demo accounts sign in with a password).
 *
 *   SUPABASE_URL=… SUPABASE_PUBLISHABLE_KEY=… DEMO_PASSWORD=… node scripts/smoke_supabase.mjs
 *
 * Writes a few test rows (a post, a reply, a reaction, an event) and removes
 * the event again; posts stay, marked "[smoke test]".
 */
import { createHmac } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';

/** RFC 6238 code from a base32 secret, like an authenticator app. */
function totp(secret, at = Date.now()) {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  let bits = '';
  for (const ch of secret.replace(/=+$/, '').toUpperCase()) bits += alphabet.indexOf(ch).toString(2).padStart(5, '0');
  const key = Buffer.from(bits.match(/.{8}/g).map((b) => parseInt(b, 2)));
  const msg = Buffer.alloc(8);
  msg.writeBigUInt64BE(BigInt(Math.floor(at / 30000)));
  const h = createHmac('sha1', key).update(msg).digest();
  const o = h[h.length - 1] & 15;
  return String((h.readUInt32BE(o) & 0x7fffffff) % 1_000_000).padStart(6, '0');
}

const URL = process.env.SUPABASE_URL;
const KEY = process.env.SUPABASE_PUBLISHABLE_KEY;
const PW = process.env.DEMO_PASSWORD;
if (!URL || !KEY || !PW) { console.error('Set SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY and DEMO_PASSWORD'); process.exit(1); }

let failures = 0;
const ok = (cond, msg) => { console.log(`${cond ? '✓' : '✗'} ${msg}`); if (!cond) failures++; };
const must = ({ data, error }) => { if (error) throw new Error(error.message); return data; };

async function as(legacy) {
  const c = createClient(URL, KEY, { auth: { persistSession: false } });
  must(await c.auth.signInWithPassword({ email: `${legacy}@demo.khroyals.test`, password: PW }));
  return c;
}

const anon = createClient(URL, KEY, { auth: { persistSession: false } });
const school = must(await anon.from('events').select('id').is('group_id', null));
ok(school.length >= 30, `signed-out visitors read the school calendar (${school.length} events)`);
ok(must(await anon.from('groups').select('id')).length === 0, 'signed-out visitors see no groups');

const parent = await as('u-p01');
const pGroups = must(await parent.rpc('my_groups'));
ok(pGroups.length > 0 && !pGroups.some((g) => g.slug === 'g-faculty'), `parent sees their ${pGroups.length} groups, not the staff lounge`);
const announce = pGroups.find((g) => g.slug === 'g-announce');
const abil = must(await parent.rpc('group_abilities', { p_group: announce.id }));
ok(abil.role === 'subscriber' && abil.post.allowed === false && abil.react.allowed === true, 'parent can react but not post in announcements');
const posts = must(await parent.from('posts').select('*, reactions(emoji, user_id), poll_options(id, label, position, poll_votes(user_id))').eq('group_id', announce.id));
ok(posts.length > 0, `parent reads announcements (${posts.length})`);
const denied = await parent.rpc('create_post', { p_group: announce.id, p_kind: 'announcement', p_body: 'hi' });
ok(!!denied.error && /Only moderators/.test(denied.error.message), `server refuses the post: "${denied.error?.message}"`);
const direct = await parent.from('posts').insert({ group_id: announce.id, kind: 'message', body: 'sneaky' });
ok(!!direct.error, 'direct table writes are blocked');
must(await parent.rpc('toggle_reaction', { p_post: posts[0].id, p_emoji: '🎉' }));
must(await parent.rpc('toggle_reaction', { p_post: posts[0].id, p_emoji: '🎉' }));
ok(true, 'parent toggles a reaction on and off');

const student = await as('u-s01');
const sGroups = must(await student.rpc('my_groups'));
const vb = sGroups.find((g) => g.slug === 'g-vb');
const post = must(await student.rpc('create_post', { p_group: vb.id, p_kind: 'message', p_body: '[smoke test] see everyone at practice' }));
ok(post.status === 'published', 'student posts in the team chat');
const reply = must(await student.rpc('add_comment', { p_post: post.id, p_body: '[smoke test] reply' }));
ok(!!reply.id, 'student replies');
const silenced = await as('u-s08');
const eng = must(await silenced.rpc('my_groups')).find((g) => g.slug === 'g-eng-p3');
const s8 = await silenced.rpc('create_post', { p_group: eng.id, p_kind: 'thread', p_body: 'x', p_title: 'x' });
ok(!!s8.error, `silenced student is blocked: "${s8.error?.message}"`);

const coach = await as('u-vbcoach');
const ev = must(await coach.from('events').insert({ group_id: vb.id, title: '[smoke test] film session', starts_on: '2026-10-29' }).select().single());
ok(!!ev.id, 'coach adds a team event');
const studentEvents = must(await student.from('events').select('id, title, groups(name, icon)').eq('id', ev.id));
ok(studentEvents.length === 1 && studentEvents[0].groups?.name, 'players see it on their calendar');
ok(must(await parent.from('events').select('id').eq('id', ev.id)).length === 0, 'non-members do not');
must(await coach.from('events').delete().eq('id', ev.id));

// Demo accounts ship with a public password, so none of them has admin powers.
for (const legacy of ['u-admin', 'u-ap', 'u-eng']) {
  const c = await as(legacy);
  const r = await c.rpc('admin_list_people');
  ok(!!r.error, `demo ${legacy} cannot open admin tools`);
}
const studentPush = await student.rpc('send_notification', { p_title: 'x', p_body: 'y', p_audience: 'everyone' });
ok(!!studentPush.error, 'students cannot send notifications');
// Admin paths (MFA, tiers, push) are covered by tests/db.test.ts; the real director tests them in the portal.

console.log(failures ? `\n${failures} check(s) failed` : '\nAll checks passed');
process.exit(failures ? 1 : 0);
