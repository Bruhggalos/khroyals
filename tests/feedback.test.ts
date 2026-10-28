/** src/feedback/kinds.ts: feedback labels, triage filters and order, and the database's checks. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { AREAS, STATUSES, deviceLine, matches, triageOrder } from '../src/feedback/kinds';

test('areas and statuses match the database checks', () => {
  const dir = join(__dirname, '../supabase/migrations');
  const sql = readFileSync(join(dir, readdirSync(dir).find((f) => f.endsWith('_feedback.sql'))!), 'utf8');
  for (const a of AREAS) assert.match(sql, new RegExp(`'${a.key}'`), a.key);
  for (const s of STATUSES) assert.match(sql, new RegExp(`status in \\([^)]*'${s.key}'`), s.key);
});

test('triage sees open ones by default, high priority and new first', () => {
  assert.equal(matches('open', 'planned'), true);
  assert.equal(matches('open', 'done'), false);
  assert.equal(matches('done', 'done'), true);
  assert.equal(matches('all', 'declined'), true);
  const f = (id: string, priority: string | null, status: string, createdAt: string) => ({ id, priority, status, createdAt });
  const order = triageOrder([f('a', null, 'reviewing', '3'), f('b', 'low', 'new', '4'), f('c', null, 'new', '1'), f('d', 'high', 'planned', '0')]);
  assert.deepEqual(order.map((x) => x.id), ['d', 'c', 'a', 'b']);
});

test('the device line', () => {
  assert.equal(deviceLine('ios', '27.0', '0.1.0'), 'ios 27.0 · app 0.1.0');
  assert.equal(deviceLine('web', null, '0.1.0'), 'web · app 0.1.0');
});
