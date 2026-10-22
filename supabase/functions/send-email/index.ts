/**
 * Sends queued emails (app.email_queue) through Resend: today, car line pickup
 * emails to parents. pg_cron wakes it every minute when something is due
 * (app.kick_email). It needs no caller secret: it only sends what the
 * database already queued, so calling it can't create or change an email.
 *
 * Secrets (Supabase → Edge Functions → Secrets, never in the repo):
 *   RESEND_API_KEY  a Resend API key for a domain verified in Resend
 * The sender address is app.settings 'email_from'.
 * Deploy with JWT verification off:  supabase functions deploy send-email --no-verify-jwt
 */
import { createClient } from 'npm:@supabase/supabase-js@2';

const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
  auth: { persistSession: false },
});
const RESEND_KEY = Deno.env.get('RESEND_API_KEY');

type Mail = { id: string; to_email: string; subject: string; body: string; sender: string };

const escape = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** Plain text → simple HTML: blank lines make paragraphs, single newlines line breaks. */
function html(body: string) {
  const paras = body.split(/\n{2,}/).map((p) => `<p style="margin:0 0 14px">${escape(p).replace(/\n/g, '<br>')}</p>`).join('');
  return `<div style="font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;font-size:15px;line-height:1.5;color:#111827;max-width:560px">${paras}</div>`;
}

async function send(m: Mail): Promise<string | null> {
  if (!RESEND_KEY) return 'RESEND_API_KEY is not set';
  const r = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${RESEND_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: m.sender, to: [m.to_email], subject: m.subject, text: m.body, html: html(m.body) }),
  });
  if (r.ok) return null;
  return `${r.status} ${(await r.text()).slice(0, 300)}`;
}

Deno.serve(async () => {
  const { data, error } = await db.rpc('email_claim', { p_limit: 50 });
  if (error) return new Response(JSON.stringify({ error: error.message }), { status: 500 });
  let sent = 0;
  for (const m of (data ?? []) as Mail[]) {
    const problem = await send(m).catch((e) => String(e));
    await db.rpc('email_done', { p_id: m.id, p_error: problem });
    if (!problem) sent++;
  }
  return new Response(JSON.stringify({ claimed: data?.length ?? 0, sent }), { headers: { 'Content-Type': 'application/json' } });
});
