/**
 * Delivers queued notifications through Expo's push service (free; it relays
 * to Firebase Cloud Messaging on Android and APNs on iOS).
 *
 * Called by the database (app.kick_push) whenever a notification is queued.
 * It needs no secret: it only ever sends notifications that are already
 * queued, so calling it can't create or alter one. Deploy with JWT
 * verification off:  supabase functions deploy send-push --no-verify-jwt
 */
import { createClient } from 'npm:@supabase/supabase-js@2';

const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
  auth: { persistSession: false },
});
const EXPO = 'https://exp.host/--/api/v2/push/send';
const MAX_AGE_MS = 15 * 60 * 1000; // don't deliver stale notifications (e.g. queued before setup)

type Note = { id: string; title: string; body: string; data: Record<string, unknown>; created_at: string };

async function deliver(n: Note) {
  // Claim it so concurrent calls don't double-send.
  const { data: claimed } = await db.from('notifications').update({ status: 'sending' })
    .eq('id', n.id).eq('status', 'queued').select('id');
  if (!claimed?.length) return 0;
  if (Date.now() - new Date(n.created_at).getTime() > MAX_AGE_MS) {
    await db.from('notifications').update({ status: 'failed', error: 'expired' }).eq('id', n.id);
    return 0;
  }
  const { data: targets, error } = await db.rpc('push_targets', { p_notification: n.id });
  if (error) {
    await db.from('notifications').update({ status: 'failed', error: error.message }).eq('id', n.id);
    return 0;
  }
  const owner = new Map<string, string>((targets ?? []).map((t: { token: string; user_id: string }) => [t.token, t.user_id]));
  const tokens = [...owner.keys()];
  // Group posts: each recipient's reply pass, so they can answer from the
  // notification or Android Auto without opening the app.
  const passes = new Map<string, string>();
  if (n.data?.postId) {
    const { data: rt } = await db.rpc('push_reply_tokens', { p_notification: n.id });
    for (const r of (rt ?? []) as { user_id: string; token: string }[]) passes.set(r.user_id, r.token);
  }
  let sent = 0;
  const dead: string[] = [];
  for (let i = 0; i < tokens.length; i += 100) {
    const batch = tokens.slice(i, i + 100);
    const res = await fetch(EXPO, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(batch.map((to) => ({
        to, title: n.title, body: n.body, sound: 'default', channelId: 'default',
        data: { ...n.data, notificationId: n.id, ...(passes.has(owner.get(to)!) ? { replyToken: passes.get(owner.get(to)!) } : {}) },
      }))),
    });
    const out = await res.json().catch(() => ({}));
    (out.data ?? []).forEach((r: { status: string; details?: { error?: string } }, j: number) => {
      if (r.status === 'ok') sent++;
      else if (r.details?.error === 'DeviceNotRegistered') dead.push(batch[j]);
    });
  }
  if (dead.length) await db.from('push_tokens').delete().in('token', dead);
  await db.from('notifications').update({ status: 'sent', sent_count: sent }).eq('id', n.id);
  return sent;
}

Deno.serve(async () => {
  // Deliver everything still queued (covers missed calls), oldest first.
  const { data: queued } = await db.from('notifications').select('id, title, body, data, created_at')
    .eq('status', 'queued').order('created_at').limit(50);
  let total = 0;
  for (const n of (queued ?? []) as Note[]) total += await deliver(n);
  return new Response(JSON.stringify({ processed: queued?.length ?? 0, sent: total }), {
    headers: { 'Content-Type': 'application/json' },
  });
});
