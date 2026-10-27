/** src/carline/board.ts: the big-screen board puts waiting cars on top and picked-up children below. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { boardOrder, boardTextSize, isNew, newArrivals, splitInitial } from '../src/carline/board';

const row = (id: string, status: 'waiting' | 'picked_up', arrivedAt: string, pickedUpAt: string | null = null) => ({ id, status, arrivedAt, pickedUpAt });

test('waiting cars come first, first to arrive at the top; picked up children follow, latest first', () => {
  const { waiting, done } = boardOrder([
    row('late', 'waiting', '2026-10-27T20:10:00+00:00'),
    row('gone-early', 'picked_up', '2026-10-27T20:00:00+00:00', '2026-10-27T20:03:00+00:00'),
    row('first', 'waiting', '2026-10-27T20:01:00+00:00'),
    row('gone-just-now', 'picked_up', '2026-10-27T20:02:00+00:00', '2026-10-27T20:12:00+00:00'),
    // Same moment written with a different offset: compared as times, not text.
    row('second', 'waiting', '2026-10-27T15:05:00-05:00'),
  ]);
  assert.deepEqual(waiting.map((r) => r.id), ['first', 'second', 'late']);
  assert.deepEqual(done.map((r) => r.id), ['gone-just-now', 'gone-early']);
});

test('confirming a pickup moves the row from the line to the top of the picked up list', () => {
  const before = [row('a', 'waiting', '2026-10-27T20:00:00Z'), row('b', 'waiting', '2026-10-27T20:01:00Z'), row('c', 'picked_up', '2026-10-27T19:50:00Z', '2026-10-27T19:55:00Z')];
  const after = before.map((r) => (r.id === 'a' ? { ...r, status: 'picked_up' as const, pickedUpAt: '2026-10-27T20:05:00Z' } : r));
  assert.deepEqual(boardOrder(after).waiting.map((r) => r.id), ['b']);
  assert.deepEqual(boardOrder(after).done.map((r) => r.id), ['a', 'c']);
});

test('only a car the board has not seen yet sets off the ripples', () => {
  const first = [row('a', 'waiting', '2026-10-27T20:00:00Z'), row('b', 'picked_up', '2026-10-27T19:50:00Z', '2026-10-27T19:55:00Z')];
  assert.deepEqual(newArrivals(null, first), [], 'opening the board is quiet');
  const seen = new Set(first.map((r) => r.id));
  assert.deepEqual(newArrivals(seen, first), [], 'nothing changed');
  const later = [...first, row('c', 'waiting', '2026-10-27T20:02:00Z')];
  assert.deepEqual(newArrivals(seen, later).map((r) => r.id), ['c']);
  const undone = first.map((r) => (r.id === 'b' ? { ...r, status: 'waiting' as const, pickedUpAt: null } : r));
  assert.deepEqual(newArrivals(seen, undone), [], 'an undone pickup is not a new car');
  const confirmed = first.map((r) => ({ ...r, status: 'picked_up' as const, pickedUpAt: '2026-10-27T20:05:00Z' }));
  assert.deepEqual(newArrivals(seen, confirmed), []);
});

test("the birthday crown sits on the name's first letter", () => {
  assert.deepEqual(splitInitial('Avery Johnson'), ['A', 'very Johnson']);
  assert.deepEqual(splitInitial(' Émile Durand'), ['É', 'mile Durand'], 'accents and stray spaces');
  assert.deepEqual(splitInitial('J'), ['J', '']);
  assert.deepEqual(splitInitial(''), ['', '']);
});

test('new arrivals are marked for a minute, and the text grows with the screen', () => {
  const now = Date.parse('2026-10-27T20:01:00Z');
  assert.equal(isNew('2026-10-27T20:00:30Z', now), true);
  assert.equal(isNew('2026-10-27T20:00:00Z', now), false);
  assert.equal(boardTextSize(390), 15, 'a phone');
  assert.equal(boardTextSize(1280), 20, 'a laptop');
  assert.equal(boardTextSize(1920), 30, 'a TV');
  assert.equal(boardTextSize(3840), 30, 'capped on 4K');
});
