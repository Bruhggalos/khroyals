/**
 * Stripe Checkout for event tickets, with no Deno or npm imports (tests run it): the form that makes a
 * Checkout Session for an order, and checking that a webhook really came from Stripe.
 */

export type Order = {
  orderId: string; title: string; totalCents: number; email?: string | null;
  lines: { name: string; priceCents: number; quantity: number }[];
};

/**
 * The body for POST https://api.stripe.com/v1/checkout/sessions. The order id rides along so the webhook
 * can mark it paid. Free kinds in a paid order aren't listed (they're issued with it). The page lasts 31
 * minutes (Stripe's shortest is 30), and the tickets stay held as long.
 */
export function checkoutForm(o: Order, urls: { success: string; cancel: string }, now = Date.now()): URLSearchParams {
  const f = new URLSearchParams();
  f.set('mode', 'payment');
  f.set('success_url', urls.success);
  f.set('cancel_url', urls.cancel);
  f.set('client_reference_id', o.orderId);
  f.set('metadata[order_id]', o.orderId);
  f.set('payment_intent_data[metadata][order_id]', o.orderId);
  f.set('payment_intent_data[description]', `Tickets: ${o.title}`);
  if (o.email) f.set('customer_email', o.email);
  f.set('expires_at', String(Math.floor(now / 1000) + 31 * 60));
  o.lines.filter((l) => l.priceCents > 0).forEach((l, i) => {
    f.set(`line_items[${i}][quantity]`, String(l.quantity));
    f.set(`line_items[${i}][price_data][currency]`, 'usd');
    f.set(`line_items[${i}][price_data][unit_amount]`, String(l.priceCents));
    f.set(`line_items[${i}][price_data][product_data][name]`, `${o.title}: ${l.name}`);
  });
  return f;
}

const enc = (s: string) => new TextEncoder().encode(s);
const hex = (b: ArrayBuffer) => [...new Uint8Array(b)].map((x) => x.toString(16).padStart(2, '0')).join('');

export async function hmacHex(secret: string, data: string) {
  const key = await crypto.subtle.importKey('raw', enc(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return hex(await crypto.subtle.sign('HMAC', key, enc(data)));
}

/** Compares without stopping at the first difference. */
export function sameText(a: string, b: string) {
  if (a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}

/**
 * A webhook's Stripe-Signature header ("t=1700000000,v1=<hex>,…") is genuine when one v1 is
 * HMAC-SHA256(signing secret, "<t>.<raw body>") and t is within five minutes of now.
 */
export async function verifyStripeSignature(payload: string, header: string | null, secret: string, now = Date.now()) {
  if (!header || !secret) return false;
  const parts = header.split(',').map((p) => p.trim().split('='));
  const t = parts.find(([k]) => k === 't')?.[1];
  const sigs = parts.filter(([k]) => k === 'v1').map(([, v]) => v ?? '');
  if (!t || !sigs.length || !Number.isFinite(Number(t)) || Math.abs(now / 1000 - Number(t)) > 300) return false;
  const expected = await hmacHex(secret, `${t}.${payload}`);
  return sigs.some((s) => sameText(s, expected));
}
