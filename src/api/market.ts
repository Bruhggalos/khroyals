import { uploadJpeg } from './storage';
import { subscribeChanges } from './realtime';
/** market: internal API implementation. Screens import the connect facade. */
import type { Condition, Listing, MarketLine, MarketTerms } from './types';
import { live, rpc, run, sb } from './client';
import { current } from './session';
import { toLine, toListing } from './mappers';

export async function marketTerms(): Promise<MarketTerms> { return rpc('market_terms') as Promise<MarketTerms>; }

export async function acceptMarketTerms(version: number) { await rpc('market_accept_terms', { p_version: version }); }

/** Posts this person can see (open ones, plus their own and ones they're buying), newest first, and the lines they can see. */
export async function listMarket(): Promise<{ listings: Listing[]; lines: MarketLine[] }> {
  if (!live || !current) return { listings: [], lines: [] };
  const [l, r] = await Promise.all([
    run(sb().from('market_listings').select('*').neq('status', 'removed').order('created_at', { ascending: false })),
    run(sb().from('market_responses').select('*').order('created_at')),
  ]);
  return { listings: l.map(toListing), lines: r.map(toLine) };
}

export async function getListing(id: string): Promise<{ listing: Listing | null; lines: MarketLine[] }> {
  const [l, r] = await Promise.all([
    run(sb().from('market_listings').select('*').eq('id', id).maybeSingle()),
    run(sb().from('market_responses').select('*').eq('listing_id', id).order('created_at')),
  ]);
  return { listing: l ? toListing(l) : null, lines: r.map(toLine) };
}

/** Upload a JPEG (base64) into the seller's own folder; returns its path for marketPost. */
export async function uploadMarketPhoto(base64: string): Promise<string> {
  const path = `${current!.id}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.jpg`;
  await uploadJpeg('marketplace', path, base64);
  return path;
}

export async function marketPost(p: {
  title: string; description: string; priceCents: number; quantity: number; condition: Condition; photoPath: string | null;
}): Promise<Listing> {
  return toListing(await rpc('market_post', {
    p_title: p.title, p_description: p.description, p_price_cents: p.priceCents, p_quantity: p.quantity,
    p_condition: p.condition, p_photo_path: p.photoPath,
  }));
}

export async function marketRemove(id: string, reason?: string) { await rpc('market_remove', { p_listing: id, p_reason: reason ?? null }); }

export async function marketDibs(id: string) { await rpc('market_dibs', { p_listing: id }); }

export async function marketOffer(id: string, cents: number, message: string) {
  await rpc('market_offer', { p_listing: id, p_cents: cents, p_message: message });
}

/** Seller: accept an offer, or counter it with another price. */
export async function marketAnswerOffer(lineId: string, accept: boolean, counterCents?: number) {
  await rpc('market_answer_offer', { p_response: lineId, p_accept: accept, p_counter_cents: counterCents ?? null });
}

/** Buyer: accept or decline the seller's counter. */
export async function marketAnswerCounter(lineId: string, accept: boolean) {
  await rpc('market_answer_counter', { p_response: lineId, p_accept: accept });
}

export async function marketWithdraw(lineId: string) { await rpc('market_withdraw', { p_response: lineId }); }

/** Seller: confirm this buyer; the sale is pending until the handoff. */
export async function marketSelect(lineId: string) { await rpc('market_select', { p_response: lineId }); }

export async function marketComplete(id: string) { await rpc('market_complete', { p_listing: id }); }

export async function marketCancelSale(id: string) { await rpc('market_cancel_sale', { p_listing: id }); }

/** Live marketplace changes (row-level security limits them to what this person may see). */
export function subscribeMarket(onChange: () => void): () => void {
  return subscribeChanges('subscribeMarket', [{ event: '*', table: 'market_listings' }, { event: '*', table: 'market_responses' }], onChange);
}
