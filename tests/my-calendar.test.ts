/** src/myCalendar/when.ts: how My calendar shows times and days. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { byDay, itemTime } from '../src/myCalendar/when';

test('times read as a range, a start, or all day', () => {
  assert.equal(itemTime('07:30', '08:15'), '7:30–8:15 AM');
  assert.equal(itemTime('11:00', '13:00'), '11:00 AM–1:00 PM');
  assert.equal(itemTime('16:00', null), '4:00 PM');
  assert.equal(itemTime(null, null), 'All day');
});

test('items group by day, in order', () => {
  const list = [{ d: '2026-10-28', t: 'a' }, { d: '2026-10-28', t: 'b' }, { d: '2026-10-30', t: 'c' }];
  assert.deepEqual(byDay(list, (x) => x.d).map((g) => [g.day, g.items.map((x) => x.t)]), [['2026-10-28', ['a', 'b']], ['2026-10-30', ['c']]]);
});
