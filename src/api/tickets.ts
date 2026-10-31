/**
 * tickets: internal API implementation for event tickets. Screens import the connect facade.
 * Activity leaders set up an event's tickets and check them at the door; parents, staff and Family
 * accounts buy them through Stripe Checkout (the tickets Edge Function) and keep them in My Tickets
 * or Apple / Google Wallet. The database checks who may.
 */
import type { AdmitResult, MyTicket, TicketEvent, TicketSale, TicketSetup } from './types';
import { live, rpc, sb } from './client';

const noServer = () => { throw new Error('Tickets need the school server; this build is running on demo data.'); };

/** An Edge Function route's answer, or its { error } as the thrown message. */
async function call<T>(route: string, body?: object): Promise<T> {
  const { data, error } = await sb().functions.invoke(`tickets/${route}`, body ? { body } : { method: 'GET' });
  if (error) {
    const reply = await (error as { context?: Response }).context?.json?.().catch(() => null);
    throw new Error(reply?.error ?? error.message);
  }
  return data as T;
}

/** Which of card payments, Apple Wallet and Google Wallet the school has set up. */
export async function ticketSetup(): Promise<TicketSetup> {
  if (!live) return { stripe: false, apple: false, google: false };
  return call<TicketSetup>('setup').catch(() => ({ stripe: false, apple: false, google: false }));
}

/** Upcoming events with tickets on sale, and their lowest price. */
export async function ticketsOnSale(): Promise<{ eventId: string; fromCents: number | null }[]> {
  if (!live) return [];
  return (await rpc('tickets_on_sale')) as { eventId: string; fromCents: number | null }[];
}

export async function ticketEvent(eventId: string): Promise<TicketEvent> {
  if (!live) noServer();
  return (await rpc('ticket_event', { p_event: eventId })) as TicketEvent;
}

/** Leaders: what's for sale (the whole list of kinds, in order), whether it's on sale, and when sales close. */
export async function saveTicketEvent(eventId: string, t: {
  onSale: boolean; closesAt: string | null; maxPerOrder: number; types: { id?: string; name: string; priceCents: number; capacity: number | null }[];
}) {
  if (!live) noServer();
  await rpc('ticket_event_save', { p_event: eventId, p_on_sale: t.onSale, p_closes_at: t.closesAt, p_types: t.types, p_max_per_order: t.maxPerOrder });
}

export async function ticketSales(eventId: string): Promise<TicketSale[]> {
  if (!live) return [];
  return (await rpc('ticket_sales', { p_event: eventId })) as TicketSale[];
}

/** Leaders at the door: a scanned QR code or a typed short code. */
export async function admitTicket(eventId: string, code: string): Promise<AdmitResult> {
  if (!live) noServer();
  return (await rpc('ticket_admit', { p_event: eventId, p_code: code })) as AdmitResult;
}

export async function myTickets(): Promise<MyTicket[]> {
  if (!live) return [];
  return (await rpc('my_tickets')) as MyTicket[];
}

/**
 * Hold the tickets and open Stripe's payment page: { url } to open, or { free } when there's nothing
 * to pay (they're issued already). `back`: where Stripe sends them afterwards, the app or the web app.
 */
export async function startTicketCheckout(eventId: string, items: { typeId: string; quantity: number }[], back: 'app' | 'web') {
  if (!live) noServer();
  return call<{ url?: string; free?: boolean; orderId: string }>('checkout', { eventId, items, back });
}

export async function ticketOrderStatus(orderId: string): Promise<{ status: 'pending' | 'paid' | 'cancelled'; tickets: number; title: string } | null> {
  if (!live) return null;
  return (await rpc('ticket_order_status', { p_order: orderId })) as { status: 'pending' | 'paid' | 'cancelled'; tickets: number; title: string } | null;
}

/** They left the payment page without paying: let the hold go (a payment that still comes through wins). */
export async function cancelTicketOrder(orderId: string) { if (!live) return; await rpc('ticket_order_cancel', { p_order: orderId }); }

/** A link that adds the ticket to Apple Wallet (a .pkpass download) or Google Wallet. */
export async function walletLink(ticketId: string, kind: 'apple' | 'google'): Promise<string> {
  if (!live) noServer();
  return (await call<{ url: string }>('wallet', { ticketId, kind })).url;
}
