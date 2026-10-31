/**
 * Wallet passes for event tickets, with no Deno or npm imports (tests run it): what an Apple Wallet pass
 * says (pass.json) and its manifest, the "Save to Google Wallet" link's claims and signature, and the
 * short-lived link a phone downloads its Apple pass from. The QR code is "KHT-<code>", like My Tickets.
 */

export type PassTicket = {
  id: string; code: string; type: string; priceCents: number; eventId: string | null; title: string;
  startsAt: string; endsAt: string | null; location: string | null; address: string | null; holder: string;
};

export const qrMessage = (code: string) => `KHT-${code}`;
/** The short code printed under the QR code, for typing at the door when a scan won't read. */
export const shortCode = (code: string) => code.slice(0, 8).toUpperCase();

const NAVY = 'rgb(10, 31, 77)';
const GOLD = 'rgb(242, 183, 5)';

/** pass.json for an Apple Wallet event ticket. */
export function passJson(t: PassTicket, cfg: { passTypeId: string; teamId: string }) {
  const where = [t.location, t.address].filter(Boolean).join(', ');
  return {
    formatVersion: 1,
    passTypeIdentifier: cfg.passTypeId,
    teamIdentifier: cfg.teamId,
    serialNumber: t.id,
    organizationName: 'Kingdom Heights',
    description: `Ticket: ${t.title}`,
    logoText: 'KH Royals',
    foregroundColor: 'rgb(255, 255, 255)',
    backgroundColor: NAVY,
    labelColor: GOLD,
    relevantDate: t.startsAt,
    eventTicket: {
      primaryFields: [{ key: 'event', label: 'EVENT', value: t.title }],
      secondaryFields: [
        { key: 'date', label: 'WHEN', value: t.startsAt, dateStyle: 'PKDateStyleMedium', timeStyle: 'PKDateStyleShort' },
        { key: 'type', label: 'TICKET', value: t.type },
      ],
      auxiliaryFields: [
        { key: 'holder', label: 'NAME', value: t.holder },
        ...(t.location ? [{ key: 'place', label: 'WHERE', value: t.location }] : []),
      ],
      backFields: [
        ...(where ? [{ key: 'where', label: 'Where', value: where }] : []),
        { key: 'code', label: 'Ticket code', value: shortCode(t.code) },
        { key: 'about', label: 'About', value: 'Show this ticket at the door. Each ticket admits one person, once.' },
      ],
    },
    barcodes: [{ format: 'PKBarcodeFormatQR', message: qrMessage(t.code), messageEncoding: 'iso-8859-1', altText: shortCode(t.code) }],
  };
}

const enc = (s: string) => new TextEncoder().encode(s);
const hex = (b: ArrayBuffer) => [...new Uint8Array(b)].map((x) => x.toString(16).padStart(2, '0')).join('');

/** manifest.json: each file's SHA-1, as Apple Wallet checks them. */
export async function manifestFor(files: Record<string, Uint8Array>) {
  const out: Record<string, string> = {};
  for (const [name, bytes] of Object.entries(files)) out[name] = hex(await crypto.subtle.digest('SHA-1', bytes as BufferSource));
  return out;
}

const b64url = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const fromB64url = (s: string) => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/')), (c) => c.charCodeAt(0));

async function hmac(secret: string, data: string) {
  const key = await crypto.subtle.importKey('raw', enc(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return b64url(new Uint8Array(await crypto.subtle.sign('HMAC', key, enc(data))));
}

/** A link token for downloading a ticket's Apple pass: "<ticket>.<expires>.<signature>", good for ten minutes. */
export async function passLink(ticketId: string, secret: string, now = Date.now()) {
  const body = `${ticketId}.${Math.floor(now / 1000) + 600}`;
  return `${body}.${await hmac(secret, body)}`;
}

/** The ticket a pass link is for, or null if it's forged or expired. */
export async function readPassLink(token: string, secret: string, now = Date.now()) {
  const [ticket, expires, sig] = token.split('.');
  if (!ticket || !expires || !sig || Number(expires) < now / 1000) return null;
  return (await hmac(secret, `${ticket}.${expires}`)) === sig ? ticket : null;
}

/** The claims of a "Save to Google Wallet" link: the event (a class) and this ticket (an object). */
export function googleClaims(t: PassTicket, cfg: { issuerId: string; serviceEmail: string }, now = Date.now()) {
  const text = (value: string) => ({ defaultValue: { language: 'en-US', value } });
  const classId = `${cfg.issuerId}.event-${t.eventId ?? t.id}`;
  return {
    iss: cfg.serviceEmail, aud: 'google', typ: 'savetowallet', iat: Math.floor(now / 1000), origins: [],
    payload: {
      eventTicketClasses: [{
        id: classId, issuerName: 'Kingdom Heights', reviewStatus: 'UNDER_REVIEW', eventName: text(t.title),
        dateTime: { start: t.startsAt, ...(t.endsAt ? { end: t.endsAt } : {}) },
        ...(t.location ? { venue: { name: text(t.location), address: text(t.address ?? t.location) } } : {}),
        hexBackgroundColor: '#0A1F4D',
      }],
      eventTicketObjects: [{
        id: `${cfg.issuerId}.ticket-${t.id}`, classId, state: 'ACTIVE', ticketHolderName: t.holder, ticketType: text(t.type),
        barcode: { type: 'QR_CODE', value: qrMessage(t.code), alternateText: shortCode(t.code) },
      }],
    },
  };
}

/** Signs a JWT with RS256 (a Google service account's private key, PEM). */
export async function signJwt(claims: object, privateKeyPem: string) {
  const der = Uint8Array.from(atob(privateKeyPem.replace(/-----[^-]+-----/g, '').replace(/\s+/g, '')), (c) => c.charCodeAt(0));
  const key = await crypto.subtle.importKey('pkcs8', der, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['sign']);
  const head = b64url(enc(JSON.stringify({ alg: 'RS256', typ: 'JWT' })));
  const body = b64url(enc(JSON.stringify(claims)));
  const sig = new Uint8Array(await crypto.subtle.sign('RSASSA-PKCS1-v1_5', key, enc(`${head}.${body}`)));
  return `${head}.${body}.${b64url(sig)}`;
}

export const jwtParts = (jwt: string) => jwt.split('.').slice(0, 2).map((p) => JSON.parse(new TextDecoder().decode(fromB64url(p))));
