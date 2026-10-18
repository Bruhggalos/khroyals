/** src/comms/inbox.ts: every notification reaches the Notifications page, and taps go to the right place. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { addLocal, cancelLocalEntry, notificationHref, removeLocal, shownLocal, type LocalNotice } from '../src/comms/inbox';

const NOW = Date.parse('2026-10-16T19:00:00Z');
const min = (m: number) => new Date(NOW + m * 60_000).toISOString();
const note = (id: string, showAt: string, title = id): LocalNotice => ({
  key: `${id}@${showAt}`, notificationId: id, title, body: '', data: {}, showAt,
});

test('the phone\'s own notifications show on the page once they have appeared, newest first', () => {
  let list: LocalNotice[] = [];
  list = addLocal(list, note('checked-in', min(-30)), NOW);
  list = addLocal(list, note('carline-opens', min(15)), NOW);
  assert.deepEqual(shownLocal(list, NOW).map((n) => n.notificationId), ['checked-in'], 'a scheduled reminder waits until it shows');
  assert.deepEqual(shownLocal(list, NOW + 20 * 60_000).map((n) => n.notificationId), ['carline-opens', 'checked-in']);
});

test('rescheduling or cancelling a reminder only touches the one that hasn\'t shown yet', () => {
  let list = addLocal([], note('carline-opens', min(-24 * 60), 'yesterday'), NOW);
  list = addLocal(list, note('carline-opens', min(10), 'today'), NOW);
  list = addLocal(list, note('carline-opens', min(12), 'today again'), NOW);
  assert.deepEqual(list.map((n) => n.title), ['today again', 'yesterday']);
  list = cancelLocalEntry(list, 'carline-opens', NOW);
  assert.deepEqual(list.map((n) => n.title), ['yesterday'], 'yesterday\'s reminder showed, so it stays');
});

test('deleting one from the page removes just that showing', () => {
  const list = [note('carline-opens', min(-60), 'today'), note('carline-opens', min(-24 * 60), 'yesterday')];
  assert.deepEqual(removeLocal(list, list[1].key).map((n) => n.title), ['today']);
});

test('the page keeps the last 50, for 30 days', () => {
  let list: LocalNotice[] = [];
  for (let i = 0; i < 60; i++) list = addLocal(list, note(`n${i}`, min(-i)), NOW);
  assert.equal(list.length, 50);
  assert.equal(list[0].notificationId, 'n0');
  assert.deepEqual(shownLocal([note('old', min(-31 * 24 * 60))], NOW), []);
});

test('tapping a notification opens what it is about', () => {
  assert.equal(notificationHref({ carline: 'checked-in', pickupIds: ['p'] }), '/carline');
  assert.equal(notificationHref({ listingId: 'l1' }), '/market/l1');
  assert.equal(notificationHref({ opportunityId: 'o1' }), '/volunteer/o1');
  assert.equal(notificationHref({ questionId: 'q1' }), '/questions/q1');
  assert.equal(notificationHref({ sportId: 's1', eventId: 'e1' }), '/sports/s1');
  assert.equal(notificationHref({ groupId: 'g1', postId: 'p1' }), '/group/g1');
  assert.equal(notificationHref({}), null);
  assert.equal(notificationHref(null), null);
});

test('every notification the phone shows by itself goes through notifyLocal (so it reaches the page)', () => {
  const root = join(__dirname, '..');
  const files: string[] = [];
  const walk = (dir: string) => {
    for (const name of readdirSync(dir)) {
      const p = join(dir, name);
      if (statSync(p).isDirectory()) walk(p);
      else if (/\.(ts|tsx|js)$/.test(name)) files.push(p);
    }
  };
  walk(join(root, 'app'));
  walk(join(root, 'src'));
  const direct = files
    .filter((f) => /\b(scheduleNotificationAsync|presentNotificationAsync)\b/.test(readFileSync(f, 'utf8')))
    .map((f) => relative(root, f));
  assert.deepEqual(direct, ['src/comms/localInbox.ts']);
});
