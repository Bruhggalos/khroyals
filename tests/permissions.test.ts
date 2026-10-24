import { test } from 'node:test';
import assert from 'node:assert/strict';
import users from '../mock-db/comms/users.json';
import groups from '../mock-db/comms/groups.json';
import mships from '../mock-db/comms/memberships.json';
import posts from '../mock-db/comms/posts.json';
import { can, canComment, canEditSettings } from '../src/comms/permissions';
import { syncRuleMemberships } from '../src/comms/assignment';
import type { Group, Membership, Post, User } from '../src/comms/types';

const U = (id: string) => (users.users as User[]).find((u) => u.id === id)!;
const G = (id: string) => (groups.groups as unknown as Group[]).find((g) => g.id === id)!;
const M = (g: string, u: string) => (mships.memberships as Membership[]).find((m) => m.groupId === g && m.userId === u) ?? null;
const ctx = (u: string, g: string, now = new Date('2026-10-14T15:00:00-05:00')) => ({ user: U(u), group: G(g), membership: M(g, u), now });

test('broadcast: subscribers read and react, cannot post or comment', () => {
  assert.equal(can(ctx('u-s01', 'g-announce'), 'viewContent').allowed, true);
  assert.equal(can(ctx('u-s01', 'g-announce'), 'react').allowed, true);
  assert.equal(can(ctx('u-s01', 'g-announce'), 'post').allowed, false);
  assert.equal(can(ctx('u-s01', 'g-announce'), 'comment').allowed, false);
  assert.equal(can(ctx('u-libr', 'g-announce'), 'post').allowed, true); // moderator
});

test('broadcast with override: parents may comment on class updates', () => {
  assert.equal(can(ctx('u-p01', 'g-eng-p3-parents'), 'comment').allowed, true);
  assert.equal(can(ctx('u-p01', 'g-eng-p3-parents'), 'post').allowed, false);
});

test('Q&A: parents ask, questions held for approval, anonymous allowed', () => {
  const d = can(ctx('u-p01', 'g-c2029-parents'), 'askQuestion');
  assert.deepEqual([d.allowed, d.needsApproval], [true, true]);
  assert.equal(can(ctx('u-p01', 'g-c2029-parents'), 'answerQuestion').allowed, false);
  assert.equal(can(ctx('u-couns', 'g-c2029-parents'), 'answerQuestion').allowed, true);
});

test('lockdown blocks members but not moderators', () => {
  assert.equal(can(ctx('u-s01', 'g-homecoming'), 'post').allowed, false);
  assert.match(can(ctx('u-s01', 'g-homecoming'), 'post').reason!, /Paused/);
  assert.equal(can(ctx('u-ap', 'g-homecoming'), 'post').allowed, true);
});

test('quiet hours apply to students at night', () => {
  assert.equal(can(ctx('u-s01', 'g-eng-p3', new Date('2026-10-15T03:30:00Z')), 'post').allowed, false);
  assert.equal(can(ctx('u-s01', 'g-eng-p3', new Date('2026-10-14T20:00:00Z')), 'post').allowed, true);
  assert.equal(can(ctx('u-s01', 'g-eng-p3', new Date('2026-12-15T04:30:00Z')), 'post').allowed, false);
});

test('per-member silence and timed mute', () => {
  assert.equal(can(ctx('u-s08', 'g-eng-p3'), 'post').allowed, false);
  assert.equal(can(ctx('u-s08', 'g-eng-p3'), 'react').allowed, true);
  assert.equal(can(ctx('u-s03', 'g-vb'), 'post').allowed, false);
});

test('slow mode', () => {
  const c = { ...ctx('u-s01', 'g-eng-p3'), lastPostAt: new Date('2026-10-14T14:59:50-05:00') };
  assert.match(can(c, 'post').reason!, /Slow mode/);
});

test('comments auto-close by age; mods exempt', () => {
  const old = { ...(posts.posts[0] as unknown as Post), groupId: 'g-eng-p3', createdAt: '2026-09-01T10:00:00Z', commentsLocked: false };
  assert.equal(canComment(ctx('u-s01', 'g-eng-p3'), old).allowed, false);
  assert.equal(canComment(ctx('u-eng', 'g-eng-p3'), old).allowed, true);
});

test('non-members cannot see private or hidden groups; admins can do anything', () => {
  assert.equal(can(ctx('u-p01', 'g-faculty'), 'viewContent').allowed, false);
  assert.equal(can(ctx('u-s01', 'g-robotics'), 'viewContent').allowed, false);
  assert.equal(canEditSettings(ctx('u-admin', 'g-vb')), true);
  assert.equal(canEditSettings(ctx('u-s07', 'g-vb')), false); // student captain is moderator, not owner
});

test('rule sync: guardians follow students; manual roles preserved', () => {
  const g = G('g-c2029-parents');
  const out = syncRuleMemberships(g, users.users as User[], mships.memberships as Membership[]);
  assert.equal(out.find((m) => m.userId === 'u-p01')?.role, 'member');  // parent of 10th grader
  assert.equal(out.find((m) => m.userId === 'u-p07'), undefined);       // parent of 9th grader
  assert.equal(out.find((m) => m.userId === 'u-ap')?.role, 'owner');
});
