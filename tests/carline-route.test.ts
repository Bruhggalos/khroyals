/** src/carline/route.ts: which car line each family drives, from the Traffic Flow Map. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { familyLines, lineFor } from '../src/carline/route';

test('K2–K4 take the blue line; Kindergarten through 12th the red line', () => {
  assert.equal(lineFor(-3), 'k2-k4', 'K2');
  assert.equal(lineFor(-1), 'k2-k4', 'K4');
  assert.equal(lineFor(0), 'k-12', 'Kindergarten');
  assert.equal(lineFor(12), 'k-12');
  assert.equal(lineFor(null), null);
});

test("a family's lines: one, both, or none without grades", () => {
  assert.deepEqual(familyLines([2, 6]), ['k-12']);
  assert.deepEqual(familyLines([6, -2]), ['k2-k4', 'k-12']);
  assert.deepEqual(familyLines([null, undefined]), []);
});
