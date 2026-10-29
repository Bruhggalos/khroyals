/** src/gate.ts and app/_layout.tsx: only approved accounts get past the welcome screen. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { gateFor } from '../src/gate';

test('signed out sees sign-in; signed in but not approved waits; approved gets in', () => {
  assert.equal(gateFor(null), 'out');
  assert.equal(gateFor({ pending: true }), 'waiting');
  assert.equal(gateFor({ pending: false }), 'in');
});

test('the welcome screen covers the whole app, from the root layout', () => {
  const root = readFileSync(join(__dirname, '../app/_layout.tsx'), 'utf8');
  assert.match(root, /useAccountGate\(\)/);
  assert.match(root, /<AccountGate /, 'mounted over every screen');
});
