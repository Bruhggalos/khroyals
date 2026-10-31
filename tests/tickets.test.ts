/**
 * Event tickets outside the database: prices as shown and typed (src/tickets/labels.ts), the Stripe
 * Checkout form and webhook signatures, and the Wallet passes (supabase/functions/tickets).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generateKeyPairSync, createVerify } from 'node:crypto';
import { money, priceText, shortCode, ticketCount, ticketQr, toCents } from '../src/tickets/labels';
import { checkoutForm, hmacHex, verifyStripeSignature } from '../supabase/functions/tickets/stripe';
import { googleClaims, jwtParts, manifestFor, passJson, passLink, qrMessage, readPassLink, shortCode as passShort, signJwt } from '../supabase/functions/tickets/wallet';

const TICKET = {
  id: '11111111-1111-1111-1111-111111111111', code: 'abcdef0123456789abcdef0123456789', type: 'Adult', priceCents: 1000, eventId: 'e1',
  title: 'Fall Play: Opening night', startsAt: '2026-11-06T19:00:00-06:00', endsAt: null, location: 'Gym', address: '123 Main St', holder: 'Rosa Reyes',
};

test('prices as shown and as a leader types them', () => {
  assert.deepEqual([money(0), money(1000), money(750), money(2550)], ['Free', '$10', '$7.50', '$25.50']);
  assert.deepEqual([toCents('10'), toCents('7.5'), toCents('$7.50'), toCents('0'), toCents('1,000')], [1000, 750, 750, 0, 100000]);
  assert.deepEqual([toCents(''), toCents('ten'), toCents('7.555'), toCents('-5')], [null, null, null, null]);
  assert.deepEqual([priceText(1000), priceText(750)], ['10', '7.50']);
  assert.deepEqual([ticketCount(1), ticketCount(3)], ['1 ticket', '3 tickets']);
});

test('the app and the Wallet passes show the same QR code and short code', () => {
  assert.equal(ticketQr(TICKET.code), qrMessage(TICKET.code));
  assert.equal(shortCode(TICKET.code), passShort(TICKET.code));
  assert.equal(shortCode(TICKET.code), 'ABCDEF01');
});

test('the Stripe Checkout form lists the paid kinds and carries the order', () => {
  const f = checkoutForm({ orderId: 'o1', title: 'Fall Play', totalCents: 2500, email: 'rosa@example.com',
    lines: [{ name: 'Adult', priceCents: 1000, quantity: 2 }, { name: 'Under 5', priceCents: 0, quantity: 1 }, { name: 'Student', priceCents: 500, quantity: 1 }] },
    { success: 'https://x/back?result=paid', cancel: 'https://x/back?result=cancel' }, 1_000_000_000_000);
  assert.equal(f.get('mode'), 'payment');
  assert.equal(f.get('metadata[order_id]'), 'o1');
  assert.equal(f.get('client_reference_id'), 'o1');
  assert.equal(f.get('customer_email'), 'rosa@example.com');
  assert.equal(f.get('expires_at'), String(1_000_000_000 + 31 * 60));
  assert.equal(f.get('line_items[0][price_data][unit_amount]'), '1000');
  assert.equal(f.get('line_items[0][quantity]'), '2');
  assert.equal(f.get('line_items[1][price_data][product_data][name]'), 'Fall Play: Student', 'free kinds left out');
  assert.equal(f.get('line_items[2][quantity]'), null);
});

test("only Stripe's signature on the webhook is accepted, and only fresh", async () => {
  const body = '{"type":"checkout.session.completed"}', secret = 'whsec_test', now = 1_700_000_000_000, t = now / 1000;
  const good = `t=${t},v1=${await hmacHex(secret, `${t}.${body}`)}`;
  assert.equal(await verifyStripeSignature(body, good, secret, now), true);
  assert.equal(await verifyStripeSignature(body, `t=${t},v1=deadbeef,${good.split(',')[1]}`, secret, now), true, 'any v1 may match');
  assert.equal(await verifyStripeSignature(body + ' ', good, secret, now), false, 'tampered body');
  assert.equal(await verifyStripeSignature(body, good, 'whsec_other', now), false);
  assert.equal(await verifyStripeSignature(body, good, secret, now + 10 * 60_000), false, 'too old');
  assert.equal(await verifyStripeSignature(body, null, secret, now), false);
  assert.equal(await verifyStripeSignature(body, good, '', now), false, 'no secret set up');
});

test('a pass download link works for ten minutes and only as signed', async () => {
  const now = 1_700_000_000_000;
  const link = await passLink(TICKET.id, 'secret', now);
  assert.equal(await readPassLink(link, 'secret', now + 60_000), TICKET.id);
  assert.equal(await readPassLink(link, 'secret', now + 11 * 60_000), null, 'expired');
  assert.equal(await readPassLink(link, 'other', now), null);
  assert.equal(await readPassLink(link.replace(TICKET.id, '22222222-2222-2222-2222-222222222222'), 'secret', now), null, 'another ticket');
});

test('the Apple Wallet pass shows the event and the QR code, and its manifest hashes each file', async () => {
  const pass = passJson(TICKET, { passTypeId: 'pass.com.khroyals.tickets', teamId: 'NH4U6X4G8C' });
  assert.equal(pass.serialNumber, TICKET.id);
  assert.equal(pass.eventTicket.primaryFields[0].value, TICKET.title);
  assert.deepEqual(pass.barcodes[0], { format: 'PKBarcodeFormatQR', message: `KHT-${TICKET.code}`, messageEncoding: 'iso-8859-1', altText: 'ABCDEF01' });
  assert.ok(pass.eventTicket.backFields.some((f) => f.value === 'Gym, 123 Main St'));
  const m = await manifestFor({ 'pass.json': new TextEncoder().encode('abc') });
  assert.equal(m['pass.json'], 'a9993e364706816aba3e25717850c26c9cd0d89d');
});

test('the Save to Google Wallet link is signed with the service account and describes the ticket', async () => {
  const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
  const claims = googleClaims(TICKET, { issuerId: '3388000000012345678', serviceEmail: 'wallet@kh.iam.gserviceaccount.com' }, 1_700_000_000_000);
  const jwt = await signJwt(claims, privateKey.export({ type: 'pkcs8', format: 'pem' }).toString());
  const [head, body] = jwtParts(jwt);
  assert.equal(head.alg, 'RS256');
  assert.equal(body.typ, 'savetowallet');
  const object = body.payload.eventTicketObjects[0];
  assert.equal(object.barcode.value, `KHT-${TICKET.code}`);
  assert.equal(object.classId, '3388000000012345678.event-e1');
  assert.equal(object.ticketHolderName, 'Rosa Reyes');
  const [h, b, sig] = jwt.split('.');
  const ok = createVerify('RSA-SHA256').update(`${h}.${b}`).verify(publicKey, Buffer.from(sig.replace(/-/g, '+').replace(/_/g, '/'), 'base64'));
  assert.equal(ok, true);
});
