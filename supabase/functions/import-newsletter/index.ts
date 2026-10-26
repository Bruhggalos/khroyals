/**
 * Adds a Royal News issue from its Smore link: { url } → reads the page (smore.ts) and saves it
 * with newsletter_save as the signed-in caller, so the database's push.send check (and its
 * authenticator rule) decides who may. Only app.smore.com newsletter pages are fetched.
 * Deployed with JWT verification on (scripts/supabase_setup.mjs).
 */
import { createClient } from 'npm:@supabase/supabase-js@2';
import { parseSmore, smoreUrl } from './smore.ts';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const reply = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  const auth = req.headers.get('Authorization');
  const apikey = req.headers.get('apikey') ?? Deno.env.get('SUPABASE_ANON_KEY');
  if (!auth || !apikey) return reply(401, { error: 'Sign in first.' });

  let url: string | null = null;
  try { url = smoreUrl(String((await req.json()).url ?? '')); } catch { /* no body */ }
  if (!url) return reply(400, { error: 'Paste the issue\'s Smore link (https://app.smore.com/n/…).' });

  // As the caller: their permissions apply.
  const db = createClient(Deno.env.get('SUPABASE_URL')!, apikey, {
    auth: { persistSession: false }, global: { headers: { Authorization: auth } },
  });
  const { data: access } = await db.rpc('my_access');
  if (!(access as { permissions?: string[] } | null)?.permissions?.includes('push.send')) {
    return reply(403, { error: 'Adding Royal News needs the Send notifications permission.' });
  }

  let html: string;
  try {
    const page = await fetch(url, { headers: { 'User-Agent': 'KH Royals app (Royal News import)' }, signal: AbortSignal.timeout(15_000) });
    if (!page.ok || !smoreUrl(page.url)) return reply(502, { error: `Smore didn't return that issue (${page.status}).` });
    html = await page.text();
  } catch {
    return reply(502, { error: 'Couldn\'t reach Smore. Try again in a minute.' });
  }

  const issue = parseSmore(html, url);
  if (!issue.blocks.length) return reply(422, { error: 'That page has no newsletter content the app can read.' });
  if (!issue.sentOn) return reply(422, { error: 'Couldn\'t find the issue\'s date under its title.' });
  const { data: id, error } = await db.rpc('newsletter_save', {
    p_source_url: url, p_title: issue.title, p_sent_on: issue.sentOn, p_blocks: issue.blocks,
  });
  if (error) return reply(400, { error: error.message });
  return reply(200, { id, title: issue.title, sentOn: issue.sentOn });
});
