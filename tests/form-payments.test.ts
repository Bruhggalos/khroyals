/** src/schoolForms/payments.ts: payment methods (matched with the database) and dollars. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { PAYMENT_METHODS, money, parseDollars } from '../src/schoolForms/payments';

test('the payment methods match the database check', () => {
  const sql = readFileSync(join(__dirname, '../supabase/migrations/20261024000032_forms.sql'), 'utf8');
  const check = /method\s+text not null check \(method in \(([^)]*)\)\)/.exec(sql)![1];
  assert.deepEqual(check.split(',').map((s) => s.trim().replace(/'/g, '')), PAYMENT_METHODS.map((m) => m.value));
});

test('dollars in and out', () => {
  assert.equal(money(2500), '$25.00');
  assert.equal(money(123456), '$1,234.56');
  assert.equal(parseDollars('25'), 2500);
  assert.equal(parseDollars('$25.5'), 2550);
  assert.equal(parseDollars('1,200.00'), 120000);
  for (const bad of ['', '0', 'abc', '25.555', '-5', '100000.01']) assert.equal(parseDollars(bad), null, bad);
});
