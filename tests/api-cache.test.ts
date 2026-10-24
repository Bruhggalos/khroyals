import { test } from 'node:test';
import assert from 'node:assert/strict';
import { AsyncCache } from '../src/api/cache';

test('session reads share pending work, expire and never cross accounts', async () => {
  let now = 0, calls = 0;
  const cache = new AsyncCache<number>(100, () => now);
  const load = async () => ++calls;
  assert.deepEqual(await Promise.all([cache.get('a', load), cache.get('a', load)]), [1, 1]);
  assert.equal(await cache.get('a', load), 1);
  now = 101;
  assert.equal(await cache.get('a', load), 2);
  assert.equal(await cache.get('b', load), 3);
});
test('invalidation prevents an in-flight result restoring a signed-out session', async () => {
  const cache = new AsyncCache<string>(100);
  let finish!: (value: string) => void;
  const pending = cache.get('a', () => new Promise<string>((resolve) => { finish = resolve; }));
  cache.clear(); finish('old user');
  await assert.rejects(pending, /account changed/);
  assert.equal(await cache.get('a', async () => 'new user'), 'new user');
});
