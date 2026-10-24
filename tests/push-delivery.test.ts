import { test } from 'node:test';
import assert from 'node:assert/strict';
import { deliver, type DeliveryStore, type Note } from '../supabase/functions/send-push/delivery';

const note: Note = { id: 'notice', title: 'Alert', body: 'Test', data: { alertId: 'alert', level: 'critical' },
  push_claim_id: 'claim', push_remaining: ['a', 'b'] };
function fixture() {
  const checkpoints: { tokens: string[]; sent: number; error?: string }[] = [];
  const releases: (string | undefined)[] = [], dead: string[][] = [];
  const store: DeliveryStore = {
    progress: async (_, tokens, sent, error) => { checkpoints.push({ tokens, sent, error }); return true; },
    release: async (_, error) => { releases.push(error); }, removeDead: async (tokens) => { dead.push(tokens); },
  };
  return { store, checkpoints, releases, dead };
}
test('HTTP errors, network failures and malformed tickets release the claim for retry', async () => {
  for (const request of [async () => new Response('', { status: 503 }), async () => { throw new Error('offline'); },
    async () => Response.json({ data: [] }), async () => new Response('invalid JSON')]) {
    const f = fixture();
    assert.equal(await deliver(note, f.store, request), 0);
    assert.equal(f.releases.length, 1);
    assert.ok(f.releases[0]);
    assert.deepEqual(f.checkpoints, []);
  }
});
test('partial acceptance checkpoints only processed devices and retries rejected tickets', async () => {
  const f = fixture();
  const request: typeof fetch = async (_, init) => {
    const payload = JSON.parse(String(init?.body));
    assert.equal(payload[0].sound.critical, true);
    assert.equal(payload[0].data.notificationId, note.id);
    assert.ok(init?.signal);
    return Response.json({ data: [{ status: 'ok' }, { status: 'error', details: { error: 'MessageRateExceeded' } }] });
  };
  assert.equal(await deliver(note, f.store, request), 1);
  assert.deepEqual(f.checkpoints[0].tokens, ['a']);
  assert.match(f.releases[0]!, /MessageRateExceeded/);
});
test('dead tokens are removed, and later batch failures preserve accepted checkpoints', async () => {
  const f = fixture(); let batch = 0;
  const request: typeof fetch = async () => {
    if (batch++) throw new Error('offline');
    return Response.json({ data: Array.from({ length: 100 }, (_, i) => i === 0
      ? { status: 'error', details: { error: 'DeviceNotRegistered' } } : { status: 'ok' }) });
  };
  assert.equal(await deliver({ ...note, push_remaining: Array.from({ length: 101 }, (_, i) => `t${i}`) }, f.store, request), 99);
  assert.equal(f.checkpoints[0].tokens.length, 100);
  assert.deepEqual(f.dead, [['t0']]);
  assert.equal(f.releases[0], 'offline');
});
