/** src/carline/checkInButton.ts: the parent's check-in button never disappears. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { checkInButton } from '../src/carline/checkInButton';

const open = { state: 'open' as const };
const early = { state: 'early' as const, opensAt: '2026-10-21T19:45:00Z' };
const closed = { state: 'closed' as const };

test("during pickup hours it's Check In, then Checked In! once everyone is in line", () => {
  assert.deepEqual(checkInButton(open, 0, 2), { kind: 'ready' });
  assert.deepEqual(checkInButton(open, 1, 1), { kind: 'ready' }, 'one child still to check in');
  assert.deepEqual(checkInButton(open, 2, 0), { kind: 'checked-in' });
  assert.deepEqual(checkInButton(open, 0, 0), { kind: 'done' }, 'all picked up');
});

test('outside pickup hours it stays, greyed out', () => {
  assert.deepEqual(checkInButton(early, 0, 2), { kind: 'outside', opensAt: early.opensAt });
  assert.deepEqual(checkInButton(closed, 0, 2), { kind: 'outside' });
  assert.deepEqual(checkInButton(closed, 2, 0), { kind: 'outside' }, 'after hours, even with children still in line');
  assert.deepEqual(checkInButton(early, 1, 0), { kind: 'checked-in' }, 'already in line before the start');
});

test('no car line settings yet: the button works', () => {
  assert.deepEqual(checkInButton(undefined, 0, 1), { kind: 'ready' });
});
