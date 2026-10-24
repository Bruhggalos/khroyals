import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseGrades } from '../src/comms/groupRules';

test('grade rules keep Kindergarten and preschool; malformed restrictions never become unrestricted', () => {
  assert.deepEqual(parseGrades('0'), [0]);
  assert.deepEqual(parseGrades('-3, -2, -1, 0, 12, 0'), [-3, -2, -1, 0, 12]);
  assert.equal(parseGrades('  '), undefined);
  for (const input of ['abc', '0,', ',1', '13', '-4', '2.5', '1,NaN']) assert.throws(() => parseGrades(input));
});
