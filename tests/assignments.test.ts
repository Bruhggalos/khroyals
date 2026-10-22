/** src/assignments/groups.ts: how a student's assignments are sorted. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { dueLabel, groupAssignments } from '../src/assignments/groups';

const today = '2026-10-21';
const a = (title: string, dueOn: string | null, done = false) => ({ title, dueOn, done });

test('overdue, today, upcoming, no date and done, soonest first', () => {
  const g = groupAssignments([
    a('Essay', '2026-10-23'), a('Quiz', '2026-10-21'), a('Reading log', null), a('Worksheet', '2026-10-19'),
    a('Old essay', '2026-10-12', true), a('Map', '2026-10-22'), a('Lab', '2026-10-20'),
  ], today);
  assert.deepEqual(g.overdue.map((x) => x.title), ['Worksheet', 'Lab']);
  assert.deepEqual(g.today.map((x) => x.title), ['Quiz']);
  assert.deepEqual(g.upcoming.map((x) => x.title), ['Map', 'Essay']);
  assert.deepEqual(g.someday.map((x) => x.title), ['Reading log']);
  assert.deepEqual(g.done.map((x) => x.title), ['Old essay']);
});

test('due labels', () => {
  assert.equal(dueLabel('2026-10-21', today), 'Due today');
  assert.equal(dueLabel('2026-10-22', today), 'Due tomorrow');
  assert.equal(dueLabel('2026-10-23', today), 'Due Fri, Oct 23');
  assert.equal(dueLabel('2026-10-19', today), 'Overdue · Mon, Oct 19');
  assert.equal(dueLabel(null, today), 'No due date');
});
