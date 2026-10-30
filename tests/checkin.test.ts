/** src/checkin/labels.ts: check-in reasons match the database, and the check-out progress line. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { IN_REASONS, OUT_REASONS, REASONS, dayLabel, progressLine } from '../src/checkin/labels';

test('the reasons are the same in the app and the database', () => {
  const dir = join(__dirname, '../supabase/migrations');
  const sql = readFileSync(join(dir, readdirSync(dir).find((f) => f.endsWith('_checkin_checkout.sql'))!), 'utf8');
  const check = /reason\s+text not null[^,]*check \(reason in \(([^)]*)\)\)/.exec(sql);
  assert.ok(check, 'school_checks.reason has a check');
  assert.deepEqual([...check[1].matchAll(/'([^']+)'/g)].map((m) => m[1]), REASONS.map((r) => r.key));
  for (const r of [...IN_REASONS, ...OUT_REASONS]) assert.ok(REASONS.some((x) => x.key === r), r);
});

test("a list's day", () => {
  assert.equal(dayLabel('2026-11-03', '2026-11-03'), 'Today');
  assert.equal(dayLabel('2026-11-04', '2026-11-03'), 'Wed, Nov 4');
});

test('the check-out progress line', () => {
  assert.equal(progressLine(3, 12), '3 of 12 checked out');
  assert.equal(progressLine(12, 12), "Everyone's checked out (12)");
  assert.equal(progressLine(0, 0), 'No students on this list');
});
