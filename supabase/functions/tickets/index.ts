/**
 * Event tickets: paying by card through Stripe Checkout, and Apple and Google Wallet passes.
 * Deployed without JWT verification (Stripe's webhook and a phone's pass download carry none), so
 * each route checks for itself; the database decides who may buy and whose ticket is whose.
 *
 *   GET  /tickets/setup       which of Stripe, Apple Wallet and Google Wallet the school has set up
 *   POST /tickets/checkout    { eventId, items, back: 'app' | 'web' } as the buyer → { url } (or { free, orderId })
 *   GET  /tickets/back        Stripe sends the buyer here after paying or cancelling; on to the app or the web app
 *   POST /tickets/stripe      Stripe's webhook: checkout.session.completed / expired
 *   POST /tickets/wallet      { ticketId, kind: 'apple' | 'google' } as the buyer → { url }
 *   GET  /tickets/pass        ?token=… → the signed .pkpass (the token came from /wallet and lasts ten minutes)
 *
 * Secrets (DEVELOPING.md): STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET; APPLE_PASS_TYPE_ID, APPLE_TEAM_ID,
 * APPLE_PASS_CERT, APPLE_PASS_KEY, APPLE_PASS_KEY_PASSWORD (if the key has one), APPLE_WWDR_CERT;
 * GOOGLE_WALLET_ISSUER_ID, GOOGLE_WALLET_SERVICE_ACCOUNT (the service account's JSON key).
 */
import { createClient } from 'npm:@supabase/supabase-js@2';
import { makePkpass } from './pkpass.ts';
import { checkoutForm, verifyStripeSignature, type Order } from './stripe.ts';
import { googleClaims, passJson, passLink, readPassLink, signJwt, type PassTicket } from './wallet.ts';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
};
const reply = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });

const env = (k: string) => Deno.env.get(k) ?? '';
const SUPABASE = env('SUPABASE_URL');
const FUNCTIONS = `${SUPABASE}/functions/v1`;
const WEB_APP = 'https://royalrockinapps.github.io/khroyals';
const admin = createClient(SUPABASE, env('SUPABASE_SERVICE_ROLE_KEY'), { auth: { persistSession: false } });

const setup = () => ({
  stripe: !!env('STRIPE_SECRET_KEY') && !!env('STRIPE_WEBHOOK_SECRET'),
  apple: ['APPLE_PASS_TYPE_ID', 'APPLE_TEAM_ID', 'APPLE_PASS_CERT', 'APPLE_PASS_KEY', 'APPLE_WWDR_CERT'].every((k) => !!env(k)),
  google: !!env('GOOGLE_WALLET_ISSUER_ID') && !!env('GOOGLE_WALLET_SERVICE_ACCOUNT'),
});

/** The signed-in caller's database client: their permissions apply. */
function asCaller(req: Request) {
  const auth = req.headers.get('Authorization');
  const apikey = req.headers.get('apikey') ?? env('SUPABASE_ANON_KEY');
  if (!auth || !apikey) return null;
  return createClient(SUPABASE, apikey, { auth: { persistSession: false }, global: { headers: { Authorization: auth } } });
}

async function checkout(req: Request) {
  const db = asCaller(req);
  if (!db) return reply(401, { error: 'Sign in first.' });
  let body: { eventId?: string; items?: unknown; back?: string } = {};
  try { body = await req.json(); } catch { /* checked below */ }
  if (!body.eventId || !Array.isArray(body.items)) return reply(400, { error: 'Choose the tickets first.' });
  const { data: order, error } = await db.rpc('ticket_order_start', { p_event: body.eventId, p_items: body.items });
  if (error) return reply(400, { error: error.message });
  const o = order as Order & { free: boolean };
  if (o.free) return reply(200, { free: true, orderId: o.orderId });
  if (!setup().stripe) {
    await db.rpc('ticket_order_cancel', { p_order: o.orderId });
    return reply(503, { error: "Card payments aren't set up yet. The school office can tell you how to get tickets." });
  }
  const to = body.back === 'web' ? 'web' : 'app';
  const back = (result: string) => `${FUNCTIONS}/tickets/back?to=${to}&order=${o.orderId}&result=${result}`;
  const r = await fetch('https://api.stripe.com/v1/checkout/sessions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${env('STRIPE_SECRET_KEY')}`, 'Content-Type': 'application/x-www-form-urlencoded', 'Idempotency-Key': `order-${o.orderId}` },
    body: checkoutForm(o, { success: back('paid'), cancel: back('cancel') }),
  });
  const session = await r.json();
  if (!r.ok) {
    await db.rpc('ticket_order_cancel', { p_order: o.orderId });
    return reply(502, { error: `The payment page couldn't be opened: ${session?.error?.message ?? r.status}` });
  }
  await admin.rpc('ticket_order_checkout', { p_order: o.orderId, p_session: session.id, p_expires_at: new Date(session.expires_at * 1000).toISOString() });
  return reply(200, { url: session.url, orderId: o.orderId });
}

/** After Stripe: back into the app (its link) or the web app, saying how it went. */
function back(url: URL) {
  const order = (url.searchParams.get('order') ?? '').replace(/[^0-9a-f-]/gi, '');
  const result = url.searchParams.get('result') === 'paid' ? 'paid' : 'cancel';
  const base = url.searchParams.get('to') === 'web' ? `${WEB_APP}/tickets` : 'khroyals://tickets';
  return new Response(null, { status: 302, headers: { Location: `${base}?order=${order}&result=${result}` } });
}

async function webhook(req: Request) {
  const payload = await req.text();
  if (!(await verifyStripeSignature(payload, req.headers.get('Stripe-Signature'), env('STRIPE_WEBHOOK_SECRET')))) {
    return reply(400, { error: 'Bad signature.' });
  }
  const event = JSON.parse(payload);
  const s = event.data?.object ?? {};
  const order = s.metadata?.order_id ?? s.client_reference_id;
  if (!order) return reply(200, { ignored: true });
  if (event.type === 'checkout.session.completed' || event.type === 'checkout.session.async_payment_succeeded') {
    if (s.payment_status !== 'paid') return reply(200, { waiting: true });
    const { error } = await admin.rpc('ticket_order_paid', { p_order: order, p_session: s.id, p_payment: s.payment_intent ?? null });
    if (error) return reply(500, { error: error.message });   // Stripe tries again
  } else if (event.type === 'checkout.session.expired' || event.type === 'checkout.session.async_payment_failed') {
    await admin.rpc('ticket_order_expired', { p_order: order });
  }
  return reply(200, { received: true });
}

async function wallet(req: Request) {
  const db = asCaller(req);
  if (!db) return reply(401, { error: 'Sign in first.' });
  let body: { ticketId?: string; kind?: string } = {};
  try { body = await req.json(); } catch { /* checked below */ }
  const { data, error } = await db.rpc('ticket_for_wallet', { p_ticket: body.ticketId ?? '' });
  if (error) return reply(400, { error: error.message });
  const t = data as PassTicket;
  const ready = setup();
  if (body.kind === 'google') {
    if (!ready.google) return reply(503, { error: "Google Wallet isn't set up yet." });
    const account = JSON.parse(env('GOOGLE_WALLET_SERVICE_ACCOUNT'));
    const jwt = await signJwt(googleClaims(t, { issuerId: env('GOOGLE_WALLET_ISSUER_ID'), serviceEmail: account.client_email }), account.private_key);
    return reply(200, { url: `https://pay.google.com/gp/v/save/${jwt}` });
  }
  if (!ready.apple) return reply(503, { error: "Apple Wallet isn't set up yet." });
  return reply(200, { url: `${FUNCTIONS}/tickets/pass?token=${await passLink(t.id, env('SUPABASE_SERVICE_ROLE_KEY'))}` });
}

async function pass(url: URL) {
  const ticket = await readPassLink(url.searchParams.get('token') ?? '', env('SUPABASE_SERVICE_ROLE_KEY'));
  if (!ticket || !setup().apple) return new Response('This link has expired. Open the ticket in KH Royals and tap Add to Apple Wallet again.', { status: 410 });
  const { data, error } = await admin.rpc('ticket_pass', { p_ticket: ticket });
  if (error || !data) return new Response('That ticket is no longer valid.', { status: 404 });
  const file = await makePkpass(passJson(data as PassTicket, { passTypeId: env('APPLE_PASS_TYPE_ID'), teamId: env('APPLE_TEAM_ID') }), {
    certPem: env('APPLE_PASS_CERT'), keyPem: env('APPLE_PASS_KEY'), keyPassword: env('APPLE_PASS_KEY_PASSWORD') || undefined, wwdrPem: env('APPLE_WWDR_CERT'),
  });
  return new Response(new Blob([file as BlobPart]), { headers: { 'Content-Type': 'application/vnd.apple.pkpass', 'Content-Disposition': 'attachment; filename="ticket.pkpass"' } });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  const url = new URL(req.url);
  const route = url.pathname.split('/').filter(Boolean).pop();
  try {
    if (route === 'setup') return reply(200, setup());
    if (route === 'back') return back(url);
    if (route === 'pass') return await pass(url);
    if (req.method !== 'POST') return reply(405, { error: 'Not here.' });
    if (route === 'checkout') return await checkout(req);
    if (route === 'stripe') return await webhook(req);
    if (route === 'wallet') return await wallet(req);
    return reply(404, { error: 'Not here.' });
  } catch (e) {
    return reply(500, { error: e instanceof Error ? e.message : String(e) });
  }
});
