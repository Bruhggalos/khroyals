/** src/calendar/past.ts and src/site/calendar.ts: past events stay out of view in every calendar. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isPastDay, isPastTime, schoolToday, splitPast } from '../src/calendar/past';
import { upcoming } from '../src/site/calendar';

test('an all-day event is past once its last day is over (today still counts)', () => {
  assert.ok(isPastDay('2026-10-17', '2026-10-18'));
  assert.ok(!isPastDay('2026-10-18', '2026-10-18'), 'today');
  assert.ok(!isPastDay('2026-10-20', '2026-10-18'));
});

test('a timed event is past once it ends, or a few hours after it starts with no end time', () => {
  const now = Date.parse('2026-10-18T22:00:00Z');
  assert.ok(isPastTime('2026-10-18T19:00:00Z', '2026-10-18T20:00:00Z', now), 'ended');
  assert.ok(!isPastTime('2026-10-18T20:00:00Z', '2026-10-18T23:00:00Z', now), 'still going');
  assert.ok(!isPastTime('2026-10-18T20:30:00Z', null, now), 'started 90 minutes ago, no end time');
  assert.ok(isPastTime('2026-10-18T18:00:00Z', null, now), 'four hours ago');
});

test('lists split into upcoming and past, keeping their order', () => {
  const { upcoming: next, past } = splitPast([1, 5, 2, 8, 3], (n) => n < 4);
  assert.deepEqual(next, [5, 8]);
  assert.deepEqual(past, [1, 2, 3]);
});

test('"Coming Up" uses the school\'s date, so tonight\'s events don\'t vanish early', () => {
  const events = [
    { id: 'a', title: 'Yesterday', date: '2026-10-17', endDate: null, category: 'Event' },
    { id: 'b', title: 'Today', date: '2026-10-18', endDate: null, category: 'Event' },
    { id: 'c', title: 'Break', date: '2026-10-12', endDate: '2026-10-19', category: 'No School' },
    { id: 'd', title: 'Later', date: '2026-11-03', endDate: null, category: 'Academic' },
  ] as any;
  assert.deepEqual(upcoming(events, 5, '2026-10-18').map((e: any) => e.title), ['Break', 'Today', 'Later']);
  // 9 PM Central on Oct 18 is already Oct 19 in UTC; the school's day is still the 18th.
  assert.equal(schoolToday(new Date('2026-10-19T02:00:00Z')), '2026-10-18');
});
