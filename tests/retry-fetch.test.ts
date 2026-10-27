/** src/api/retryFetch.ts and errors.ts: reads ride out a dropped connection; writes are never sent twice. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { READ_ONLY_RPCS, askForCode, codeAlreadySent, isReadOnly, retryingFetch } from '../src/api/retryFetch';
import { errorText, isNetworkError } from '../src/api/errors';

const API = 'https://x.supabase.co';
const dropped = () => new TypeError('fetch failed: UnexpectedException: The network connection was lost.');

/** A fetch that drops the connection `drops` times, then answers; counts the tries. */
function flaky(drops: number, answer = new Response('[]', { status: 200 })) {
  let tries = 0;
  const f = (async () => { tries++; if (tries <= drops) throw dropped(); return answer; }) as unknown as typeof fetch;
  return { f, tries: () => tries };
}
const noWait = async () => {};

test('reads are tried again after a dropped connection, up to twice', async () => {
  const once = flaky(1);
  assert.equal((await retryingFetch(once.f, [400, 1200], noWait)(`${API}/rest/v1/profiles?select=*`)).status, 200);
  assert.equal(once.tries(), 2);

  const twice = flaky(2);
  await retryingFetch(twice.f, [400, 1200], noWait)(`${API}/rest/v1/rpc/carline_today`, { method: 'POST', body: '{}' });
  assert.equal(twice.tries(), 3, 'a read-only function');

  const down = flaky(5);
  await assert.rejects(retryingFetch(down.f, [400, 1200], noWait)(`${API}/rest/v1/rpc/carline_config`, { method: 'POST', body: '{}' }), /connection was lost/);
  assert.equal(down.tries(), 3, 'then it gives up');
});

test('writes, answers from the server and cancelled requests are never sent again', async () => {
  const write = flaky(1);
  await assert.rejects(retryingFetch(write.f, [400], noWait)(`${API}/rest/v1/rpc/carline_announce`, { method: 'POST', body: '{}' }));
  assert.equal(write.tries(), 1, 'a check-in is never sent twice');

  const refused = flaky(0, new Response('{"message":"nope"}', { status: 500 }));
  assert.equal((await retryingFetch(refused.f, [400], noWait)(`${API}/rest/v1/profiles`)).status, 500);
  assert.equal(refused.tries(), 1);

  const stop = new AbortController(); stop.abort();
  const cancelled = flaky(1);
  await assert.rejects(retryingFetch(cancelled.f, [400], noWait)(`${API}/rest/v1/profiles`, { signal: stop.signal }));
  assert.equal(cancelled.tries(), 1);
});

test('which requests count as read-only', () => {
  assert.equal(isReadOnly(`${API}/rest/v1/pickup_numbers?select=*`), true);
  assert.equal(isReadOnly(`${API}/rest/v1/rpc/my_pickup_children`, 'POST'), true);
  assert.equal(isReadOnly(`${API}/rest/v1/rpc/vehicle_save`, 'POST'), false);
  assert.equal(isReadOnly(`${API}/rest/v1/events`, 'POST'), false);
  assert.equal(isReadOnly(`${API}/rest/v1/events?id=eq.1`, 'DELETE'), false);
  assert.equal(isReadOnly(`${API}/auth/v1/token?grant_type=refresh_token`, 'POST'), true, 'refreshing the sign-in');
  assert.equal(isReadOnly(`${API}/auth/v1/token?grant_type=password`, 'POST'), false);
  assert.equal(isReadOnly(`${API}/auth/v1/otp`, 'POST'), false, 'a sign-in email is never sent twice');
});

test('every function retried is STABLE in the migrations, so it cannot change data', () => {
  const dir = join(__dirname, '../supabase/migrations');
  const sql = readdirSync(dir).filter((f) => f.endsWith('.sql')).sort().map((f) => readFileSync(join(dir, f), 'utf8')).join('\n');
  const volatility = new Map<string, string>();
  const def = /create\s+(?:or\s+replace\s+)?function\s+public\.(\w+)\s*\(.*?\)\s*returns(.*?)as\s+\$\w*\$/gis;
  for (const m of sql.matchAll(def)) volatility.set(m[1], /\bimmutable\b/i.test(m[2]) ? 'immutable' : /\bstable\b/i.test(m[2]) ? 'stable' : 'volatile');
  const notStable = [...READ_ONLY_RPCS].filter((f) => !['stable', 'immutable'].includes(volatility.get(f) ?? 'missing'));
  assert.deepEqual(notStable, [], 'only STABLE functions may be retried');
  for (const f of ['carline_today', 'carline_board', 'carline_config', 'my_pickup_children']) assert.ok(READ_ONLY_RPCS.has(f), f);
});

test('asking for a sign-in code rides out a dropped connection without sending two', async () => {
  const lost = { message: 'fetch failed: UnexpectedException: The network connection was lost. (at ExpoModulesCore/Promise.swift:56)' };
  /** Supabase's answers in turn (null = code sent); counts the tries. */
  const answers = (...list: ({ message: string } | null)[]) => {
    let tries = 0;
    return { ask: async () => ({ error: list[Math.min(tries++, list.length - 1)] }), tries: () => tries };
  };

  const ok = answers(lost, null);
  assert.equal(await askForCode(ok.ask, [400, 1200], noWait), null);
  assert.equal(ok.tries(), 2, 'asked again after the drop');

  // The dropped request got there after all: Supabase refuses a second code, and the first one counts.
  const arrived = answers(lost, { message: 'For security purposes, you can only request this after 59 seconds.' });
  assert.equal(await askForCode(arrived.ask, [400, 1200], noWait), null);
  assert.equal(arrived.tries(), 2);

  const thrown = { tries: 0, ask: async () => { if (thrown.tries++ === 0) throw dropped(); return { error: null }; } };
  assert.equal(await askForCode(thrown.ask, [400, 1200], noWait), null);

  const refused = answers({ message: 'Signups not allowed for otp' });
  assert.equal((await askForCode(refused.ask, [400, 1200], noWait))?.message, 'Signups not allowed for otp');
  assert.equal(refused.tries(), 1, "the server's answer is never asked again");

  const down = answers(lost);
  assert.equal(await askForCode(down.ask, [400, 1200], noWait), lost);
  assert.equal(down.tries(), 3, 'then it gives up');

  assert.equal(codeAlreadySent('email rate limit exceeded'), false, 'the hourly email limit is a real refusal');
});

test('a dropped connection gets a plain message; other errors keep theirs', () => {
  assert.equal(isNetworkError(dropped()), true);
  assert.equal(isNetworkError(new TypeError('Network request failed')), true);
  assert.equal(isNetworkError(new TypeError('Failed to fetch')), true, 'web browsers');
  assert.match(errorText(dropped()), /Couldn't reach the school's server/);
  assert.equal(errorText(new Error('You can check in from the pickup spot.')), 'You can check in from the pickup spot.');
});
