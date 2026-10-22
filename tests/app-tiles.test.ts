/** src/appTiles.ts: the Main Page's standard and staff views. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { visibleTiles, type TileRules } from '../src/appTiles';

const TILES: (TileRules & { label: string })[] = [
  { label: 'Alerts', staffOnly: true },
  { label: 'Car Line', staffVersion: true, student: false },
  { label: 'Student', family: false },
  { label: 'Calendar' },
  { label: 'Ask the School', family: false, student: false, staffVersion: true },
  { label: 'Ask the Teacher', family: false, studentApp: true },
  { label: 'Admin', adminOnly: true },
];
const labels = (v: Parameters<typeof visibleTiles>[1]) => visibleTiles(TILES, v).map((t) => t.label);
const elevated = (v: Parameters<typeof visibleTiles>[1]) => visibleTiles(TILES, v).filter((t) => t.elevated).map((t) => t.label);

test('parents, and staff on the Standard view, see the standard apps', () => {
  const standard = ['Car Line', 'Student', 'Calendar', 'Ask the School'];
  assert.deepEqual(labels({ staffView: false, family: false, admin: false }), standard);
  assert.deepEqual(labels({ staffView: false, family: false, admin: true }), standard, 'an admin on Standard sees no admin tile');
  assert.deepEqual(elevated({ staffView: false, family: false, admin: true }), []);
});

test('the Staff view adds Alerts (and Admin for admins) and marks the staff versions', () => {
  assert.deepEqual(labels({ staffView: true, family: false, admin: false }), ['Alerts', 'Car Line', 'Student', 'Calendar', 'Ask the School', 'Ask the Teacher']);
  assert.deepEqual(labels({ staffView: true, family: false, admin: true }), ['Alerts', 'Car Line', 'Student', 'Calendar', 'Ask the School', 'Ask the Teacher', 'Admin']);
  assert.deepEqual(elevated({ staffView: true, family: false, admin: true }), ['Alerts', 'Car Line', 'Ask the School', 'Ask the Teacher', 'Admin']);
});

test('Family accounts keep their closed set', () => {
  assert.deepEqual(labels({ staffView: false, family: true, admin: false }), ['Car Line', 'Calendar']);
});

test("students see only their apps, including Ask the Teacher", () => {
  assert.deepEqual(labels({ staffView: false, family: false, admin: false, student: true }), ['Student', 'Calendar', 'Ask the Teacher']);
  assert.deepEqual(elevated({ staffView: false, family: false, admin: false, student: true }), []);
});
