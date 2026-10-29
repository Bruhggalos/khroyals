/** src/alerts/whereabouts.ts: how the senders read where someone answered from, and the pasted access point list. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { accuracyLine, mapsUrl, noLocationReason, normalizeMac, parseApList, placeLine, shortWhere } from '../src/alerts/whereabouts';

test('the place on the map, the GPS accuracy, and why there is none', () => {
  const place = { place: 'Room 112', building: 'Main building', floor: '', approx: false };
  assert.equal(placeLine({ status: 'help', place }), 'Room 112 · Main building');
  assert.equal(placeLine({ status: 'help', place: { ...place, approx: true } }), 'Probably Room 112 · Main building');
  assert.equal(accuracyLine(11.6), 'Within 12 m');
  assert.equal(accuracyLine(1520), 'Within about 1.5 km');
  assert.equal(shortWhere({ status: 'safe', lat: 34.7, lng: -86.6, accuracy: 30 }), 'GPS within 30 m');
  assert.equal(shortWhere({ status: 'safe', place, lat: 34.7, lng: -86.6 }), 'Room 112 · Main building');
  assert.equal(noLocationReason({ status: 'safe', lat: 34.7, lng: -86.6 }), null);
  assert.equal(noLocationReason({ status: 'none' }), null);
  assert.match(noLocationReason({ status: 'safe', locationError: 'no_consent' })!, /chose not/);
  assert.match(noLocationReason({ status: 'help', consent: false })!, /chose not/);
  assert.match(noLocationReason({ status: 'help', locationError: 'denied' })!, /turned off/);
  assert.match(noLocationReason({ status: 'help' })!, /No location/);
});

test('Maps links for each phone', () => {
  assert.equal(mapsUrl(34.7, -86.6, 'ios'), 'https://maps.apple.com/?ll=34.7,-86.6&q=Answered%20here');
  assert.equal(mapsUrl(34.7, -86.6, 'android'), 'geo:34.7,-86.6?q=34.7,-86.6(Answered%20here)');
  assert.equal(mapsUrl(34.7, -86.6, 'web'), 'https://www.google.com/maps/search/?api=1&query=34.7,-86.6');
});

test('MAC addresses in any common form', () => {
  assert.equal(normalizeMac('3C-84-6A-00-00-10'), '3c:84:6a:00:00:10');
  assert.equal(normalizeMac('3c84.6a00.0010'), '3c:84:6a:00:00:10');
  assert.equal(normalizeMac('3c846a00001'), null);
});

test('a pasted list: commas or tabs, a header, blank lines and bad lines', () => {
  const { rows, errors } = parseApList('BSSID,Place,Building,Floor\n3C:84:6A:00:00:10, Room 112, Main, 1st\n\n3c846a000020\tGym\nnope, Library\n3c:84:6a:00:00:30,\n');
  assert.deepEqual(rows, [
    { bssid: '3c:84:6a:00:00:10', place: 'Room 112', building: 'Main', floor: '1st', notes: '' },
    { bssid: '3c:84:6a:00:00:20', place: 'Gym', building: '', floor: '', notes: '' },
  ]);
  assert.deepEqual(errors, ['Line 5: "nope" isn\'t a MAC address.', 'Line 6: say where 3c:84:6a:00:00:30 is.']);
});
