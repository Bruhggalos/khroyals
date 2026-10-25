/** src/alerts/rollCall.ts: a critical alert's roll call lists for the senders. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { rollCall } from '../src/alerts/rollCall';

const row = (name: string, status: 'safe' | 'help' | 'none', updatedAt: string | null = null) =>
  ({ id: name, name, role: 'teacher' as const, status, note: null, updatedAt });

test('each list: help by who asked first, the others by name', () => {
  const { groups } = rollCall([
    row('Zoe', 'help', '2026-10-25T22:45:00Z'), row('Amy', 'help', '2026-10-25T22:44:00Z'),
    row('Pat', 'safe', '2026-10-25T22:43:00Z'), row('Ben', 'safe', '2026-10-25T22:44:00Z'),
    row('Kristal', 'none'), row('Hannah', 'none'),
  ]);
  assert.deepEqual(groups.help.map((r) => r.name), ['Amy', 'Zoe'], 'the longest waiting on top');
  assert.deepEqual(groups.none.map((r) => r.name), ['Hannah', 'Kristal']);
  assert.deepEqual(groups.safe.map((r) => r.name), ['Ben', 'Pat']);
});

test('opens on Need help when someone does, else on who has not answered', () => {
  assert.equal(rollCall([row('A', 'none'), row('B', 'help')]).first, 'help');
  assert.equal(rollCall([row('A', 'none'), row('B', 'safe')]).first, 'none');
  assert.equal(rollCall([row('B', 'safe')]).first, 'safe');
  assert.equal(rollCall([]).first, 'safe');
});
