/** src/info/today.ts: the Info tab's date, greeting, school day, uniform and next two weeks. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { addDays, eventsToday, greeting, headerDate, nextTwoWeeks, noSchool, schoolHour, uniformFor } from '../src/info/today';

const ev = (date: string, title: string, category = 'Academic', endDate: string | null = null) => ({ id: title, date, endDate, title, category });
const CAL = [
  ev('2026-11-03', 'ACT Testing', 'Academic', '2026-11-04'),
  ev('2026-11-11', 'Veteran’s Day – Closed', 'No School'),
  ev('2026-11-13', 'Spirit Day'),
  ev('2026-11-23', 'Thanksgiving Break', 'No School', '2026-11-27'),
  ev('2026-12-01', 'Christmas Program'),
];

test('the header date and the greeting', () => {
  assert.equal(headerDate('2026-10-24'), 'Saturday, October 24');
  assert.equal(greeting(8, { firstName: 'Ava', schoolRole: 'student' }), 'Good morning Ava!');
  assert.equal(greeting(13, { firstName: 'Ben', schoolRole: 'parent' }), 'Good afternoon Royal!', "only a student's name");
  assert.equal(greeting(19, null), 'Good evening Royal!');
  assert.equal(schoolHour(new Date('2026-10-24T13:30:00Z')), 8, 'Central time');
  assert.equal(addDays('2026-10-31', 1), '2026-11-01');
});

test('school days: weekends and days off have no school', () => {
  assert.equal(noSchool('2026-10-24', CAL), 'Weekend');
  assert.equal(noSchool('2026-11-11', CAL), 'Veteran’s Day – Closed');
  assert.equal(noSchool('2026-11-25', CAL), 'Thanksgiving Break');
  assert.equal(noSchool('2026-11-04', CAL), null);
  assert.deepEqual(eventsToday('2026-11-04', CAL).map((e) => e.title), ['ACT Testing']);
});

test('the uniform: daily, Wednesday Chapel by grade, Spirit Day, none without school', () => {
  assert.equal(uniformFor('2026-10-24', CAL), null);
  const mon = uniformFor('2026-11-02', CAL)!;
  assert.equal(mon.kind, 'daily');
  assert.match(mon.shoes, /Sneakers are fine/);
  const wed = uniformFor('2026-11-04', CAL, [-2, 6])!;
  assert.equal(wed.kind, 'chapel');
  assert.match(wed.shoes, /No sneakers/);
  assert.deepEqual(wed.notes.map((n) => n.split(':')[0]), ['K2–K3', '6th–8th']);
  assert.ok(uniformFor('2026-11-13', CAL)!.notes.some((n) => n.startsWith('Spirit Day')));
});

test('coming up: after today through the next two weeks', () => {
  assert.deepEqual(nextTwoWeeks(CAL, '2026-10-24').map((e) => e.title), ['ACT Testing']);
  assert.deepEqual(nextTwoWeeks(CAL, '2026-11-10').map((e) => e.title), ['Veteran’s Day – Closed', 'Spirit Day', 'Thanksgiving Break']);
  assert.deepEqual(nextTwoWeeks(CAL, '2026-11-24').map((e) => e.title), ['Thanksgiving Break', 'Christmas Program'], 'still on after today');
  assert.deepEqual(nextTwoWeeks(CAL, '2026-12-05'), []);
});
