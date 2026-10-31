/**
 * Event tickets as the app shows them: prices, what a leader types as a price, ticket counts, and the
 * QR code and short code (the same as the Wallet passes in supabase/functions/tickets/wallet.ts). No app imports.
 */

/** "Free", "$10", "$7.50". */
export const money = (cents: number) => (cents === 0 ? 'Free' : `$${(cents / 100).toFixed(2).replace(/\.00$/, '')}`);

/** What a leader typed as a price ("10", "7.50", "$5") in cents, or null if it isn't a price. */
export function toCents(text: string): number | null {
  const t = text.replace(/[$,\s]/g, '');
  if (!/^\d{1,4}(\.\d{1,2})?$/.test(t)) return null;
  return Math.round(Number(t) * 100);
}

/** Cents as a leader edits them: "10", "7.50", "0". */
export const priceText = (cents: number) => (cents % 100 === 0 ? String(cents / 100) : (cents / 100).toFixed(2));

export const ticketCount = (n: number) => `${n} ${n === 1 ? 'ticket' : 'tickets'}`;

/** What the QR code says; the door reads it. */
export const ticketQr = (code: string) => `KHT-${code}`;
/** Printed under the QR code, for typing at the door when a scan won't read. */
export const shortCode = (code: string) => code.slice(0, 8).toUpperCase();
