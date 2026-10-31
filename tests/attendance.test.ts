/** src/attendance/labels.ts: marks match the database, a class's roll in words, the office's check-ins on a row, and stepping between school days. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { MARKS, checkLine, rollLine, stepDay } from '../src/attendance/labels';

test('the marks are the same in the app and the database', () => {
  const dir = join(__dirname, '../supabase/migrations');
  const sql = readFileSync(join(dir, readdirSync(dir).find((f) => f.endsWith('_class_attendance.sql'))!), 'utf8');
  const check = /status\s+text not null check \(status in \(([^)]*)\)\)/.exec(sql);
  assert.ok(check, 'class_attendance.status has a check');
  assert.deepEqual([...check[1].matchAll(/'([^']+)'/g)].map((m) => m[1]), MARKS.map((m) => m.key));
});

test("a class's roll in words", () => {
  const c = { students: 20, present: 0, late: 0, absent: 0, unmarked: 20, left: 0 };
  assert.equal(rollLine(c), 'Roll not taken yet');
  assert.equal(rollLine({ ...c, left: 1 }), 'Roll not taken yet · 1 left early');
  assert.equal(rollLine({ ...c, present: 17, late: 1, absent: 1, unmarked: 1, left: 1 }), '17 present · 1 late · 1 absent · 1 left early · 1 not marked');
  assert.equal(rollLine({ ...c, present: 20, unmarked: 0 }), '20 present');
  assert.equal(rollLine({ ...c, students: 0, unmarked: 0 }), 'No students in this class');
});

test("the office's check-ins on a student's row", () => {
  const at = '2026-10-30T14:12:00Z';
  assert.match(checkLine({ kind: 'in', at, reason: 'late', person: null }), /^Arrived \d+:12 [AP]M$/);
  assert.match(checkLine({ kind: 'in', at, reason: 'appointment', person: null }), /^Arrived .* · Appointment$/);
  assert.match(checkLine({ kind: 'out', at, reason: 'illness', person: 'Rosa Reyes' }), /^Left .* with Rosa Reyes · Sick$/);
});

test('stepping between school days skips weekends and stops at today', () => {
  assert.equal(stepDay('2026-10-30', -1, '2026-10-30'), '2026-10-29');
  assert.equal(stepDay('2026-11-02', -1, '2026-11-02'), '2026-10-30', 'Monday back to Friday');
  assert.equal(stepDay('2026-10-30', 1, '2026-11-04'), '2026-11-02', 'Friday on to Monday');
  assert.equal(stepDay('2026-10-30', 1, '2026-10-30'), '2026-10-30', 'never past today');
});
