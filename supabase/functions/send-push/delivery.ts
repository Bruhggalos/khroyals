/** Delivery policy, independent of Deno/Supabase so failures can be tested locally. */
export type Note = {
  id: string; title: string; body: string; data: Record<string, unknown>;
  push_claim_id: string; push_remaining: string[];
};
export type DeliveryStore = {
  progress: (note: Note, processed: string[], sent: number, error?: string) => Promise<boolean>;
  release: (note: Note, error?: string) => Promise<void>;
  removeDead: (tokens: string[]) => Promise<void>;
};
type Ticket = { status: 'ok' | 'error'; details?: { error?: string }; message?: string };
const EXPO = 'https://exp.host/--/api/v2/push/send';

/** Alerts use the phone's "Emergency alerts" channel (src/alerts/loudness.ts: alarm volume, lock screen). */
function loudness(n: Note) {
  if (!n.data.alertId) return { sound: 'default', channelId: 'default' };
  const critical = n.data.level === 'critical';
  return {
    sound: critical ? { critical: true, name: 'default', volume: 1 } : 'default',
    interruptionLevel: critical ? 'critical' : 'time-sensitive', channelId: 'emergency', priority: 'high',
  };
}

function tickets(value: unknown, expected: number): Ticket[] {
  if (!value || typeof value !== 'object' || !('data' in value) || !Array.isArray(value.data)
      || value.data.length !== expected || value.data.some((t: unknown) => !t || typeof t !== 'object'
        || !('status' in t) || (t.status !== 'ok' && t.status !== 'error'))) {
    throw new Error('Expo returned an invalid ticket response.');
  }
  return value.data as Ticket[];
}

/** Accepted batches are checkpointed; a retry sends only the remaining devices. */
export async function deliver(note: Note, store: DeliveryStore, request: typeof fetch = fetch): Promise<number> {
  let sent = 0;
  let retry: string | undefined;
  try {
    for (let i = 0; i < note.push_remaining.length; i += 100) {
      const batch = note.push_remaining.slice(i, i + 100);
      const response = await request(EXPO, {
        method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        signal: AbortSignal.timeout(15_000),
        body: JSON.stringify(batch.map((to) => ({ to, ...loudness(note), title: note.title, body: note.body,
          data: { ...note.data, notificationId: note.id } }))),
      });
      if (!response.ok) throw new Error(`Expo returned HTTP ${response.status}.`);
      const result = tickets(await response.json(), batch.length);
      const processed: string[] = [], dead: string[] = [];
      let accepted = 0, permanent: string | undefined;
      result.forEach((ticket, index) => {
        if (ticket.status === 'ok') { accepted++; processed.push(batch[index]); }
        else if (ticket.details?.error === 'DeviceNotRegistered') { dead.push(batch[index]); processed.push(batch[index]); }
        else if (['MessageTooBig', 'InvalidCredentials', 'MismatchSenderId'].includes(ticket.details?.error ?? '')) {
          processed.push(batch[index]); permanent = ticket.details?.error;
        } else retry = ticket.details?.error ?? 'Expo rejected a push ticket.';
      });
      if (!await store.progress(note, processed, accepted, permanent)) return sent;
      sent += accepted;
      if (dead.length) await store.removeDead(dead);
    }
  } catch (error) {
    retry = error instanceof Error ? error.message : String(error);
  }
  await store.release(note, retry);
  return sent;
}
