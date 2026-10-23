/** Called after inserts and by the retry cron. Only already-queued notifications are sent. */
import { createClient } from 'npm:@supabase/supabase-js@2.118.0';
import { deliver, type DeliveryStore } from './delivery.ts';

const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
  auth: { persistSession: false },
});
const store: DeliveryStore = {
  async progress(note, processed, sent, error) {
    const result = await db.rpc('push_progress', {
      p_id: note.id, p_claim: note.push_claim_id, p_processed: processed, p_sent: sent, p_error: error ?? null,
    });
    if (result.error) throw result.error;
    return result.data === true;
  },
  async release(note, error) {
    const result = await db.rpc('push_release', { p_id: note.id, p_claim: note.push_claim_id, p_error: error ?? null });
    if (result.error) throw result.error;
  },
  async removeDead(tokens) {
    const { error } = await db.from('push_tokens').delete().in('token', tokens);
    if (error) throw error;
  },
};

Deno.serve(async () => {
  let processed = 0, sent = 0;
  try {
    for (; processed < 50; processed++) {
      const { data, error } = await db.rpc('push_claim');
      if (error) throw error;
      if (!data?.length) break;
      sent += await deliver(data[0], store);
    }
    return Response.json({ processed, sent });
  } catch (error) {
    console.error('Push delivery failed', error instanceof Error ? error.message : String(error));
    return Response.json({ error: 'Push delivery will retry.', processed, sent }, { status: 503 });
  }
});
