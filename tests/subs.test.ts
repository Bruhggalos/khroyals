/** src/subs/labels.ts: a sub day's days, hours and classes in words. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { classList, clock12, subWhen } from '../src/subs/labels';

test('hours on a 12-hour clock', () => {
  assert.equal(clock12('07:30'), '7:30 AM');
  assert.equal(clock12('12:05'), '12:05 PM');
  assert.equal(clock12('15:30'), '3:30 PM');
  assert.equal(clock12('00:00'), '12:00 AM');
});

test("a sub day's days and hours", () => {
  const d = { startsOn: '2026-11-02', endsOn: '2026-11-02', startTime: '07:30', endTime: '15:30' };
  assert.equal(subWhen(d, '2026-11-02'), 'Today · 7:30 AM–3:30 PM');
  assert.equal(subWhen(d, '2026-10-30'), 'Mon, Nov 2 · 7:30 AM–3:30 PM');
  assert.equal(subWhen({ ...d, endsOn: '2026-11-04' }, '2026-10-30'), 'Nov 2–Nov 4 · 7:30 AM–3:30 PM');
});

test('the classes, with their teachers', () => {
  const d = { classes: [{ id: 'a', name: 'English 10', teacher: 'Jennifer Taylor' }, { id: 'b', name: 'Study Hall', teacher: null }] };
  assert.equal(classList(d), 'English 10 (Jennifer Taylor), Study Hall');
  assert.equal(classList(d, false), 'English 10, Study Hall');
  assert.equal(classList({ classes: [] }), 'A class');
});
