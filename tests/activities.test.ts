/** src/sports/events.ts: event card countdowns and Directions links. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { countdown, directionsUrl, two } from '../src/sports/events';

test('the countdown reads days, hours and minutes until the start', () => {
  const now = Date.parse('2026-10-19T20:00:00Z');
  assert.deepEqual(countdown('2026-10-23T23:15:00Z', now), { started: false, days: 4, hours: 3, minutes: 15 });
  assert.deepEqual(countdown('2026-10-19T20:00:30Z', now), { started: false, days: 0, hours: 0, minutes: 1 }, 'seconds away still shows a minute');
  assert.equal(countdown('2026-10-19T19:00:00Z', now).started, true);
  assert.equal(two(3), '03');
});

test('Directions go to the address (with the venue), or the venue alone', () => {
  assert.equal(directionsUrl('Mark Russell Rec Center', '429 Taylor Road, Huntsville, AL', 'ios'),
    'https://maps.apple.com/?daddr=Mark%20Russell%20Rec%20Center%2C%20429%20Taylor%20Road%2C%20Huntsville%2C%20AL');
  assert.equal(directionsUrl('KH Gym', null, 'android'), 'geo:0,0?q=KH%20Gym');
  assert.match(directionsUrl(null, '429 Taylor Road', 'web')!, /^https:\/\/www\.google\.com\/maps\/dir\/\?api=1&destination=429%20Taylor%20Road$/);
  assert.equal(directionsUrl('  ', null, 'ios'), null);
});
