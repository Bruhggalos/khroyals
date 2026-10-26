/** Royal News (the emailed newsletter) archive: internal API implementation. Screens import the connect facade. */
import type { NewsBlock } from '../../supabase/functions/import-newsletter/smore';
import { live, rpc, run, sb } from './client';

export type { NewsBlock, Span } from '../../supabase/functions/import-newsletter/smore';
/** "Friday, October 23, 2026". */
export const issueDate = (iso: string) =>
  new Date(`${iso}T12:00`).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });

export type NewsletterSummary = { id: string; title: string; sentOn: string; sourceUrl: string };
export type NewsletterIssue = NewsletterSummary & { blocks: NewsBlock[] };

/** Every issue, newest first (without their content). Everyone can read them, signed out too. */
export async function listNewsletters(): Promise<NewsletterSummary[]> {
  if (!live) return [];
  const rows = await run(sb().from('newsletters').select('id, title, sent_on, source_url').order('sent_on', { ascending: false }));
  return rows.map((r) => ({ id: r.id, title: r.title, sentOn: r.sent_on, sourceUrl: r.source_url }));
}

export async function getNewsletter(id: string): Promise<NewsletterIssue | null> {
  if (!live) return null;
  const rows = await run(sb().from('newsletters').select('*').eq('id', id));
  const r = rows[0];
  return r ? { id: r.id, title: r.title, sentOn: r.sent_on, sourceUrl: r.source_url, blocks: r.blocks as unknown as NewsBlock[] } : null;
}

/** push.send: add (or refresh) an issue from its Smore link. The import-newsletter Edge Function reads the page. */
export async function importNewsletter(url: string): Promise<{ id: string; title: string; sentOn: string }> {
  const { data, error } = await sb().functions.invoke('import-newsletter', { body: { url } });
  if (error) {
    const body = await (error as { context?: Response }).context?.json?.().catch(() => null);
    throw new Error(body?.error ?? error.message);
  }
  return data;
}

export async function deleteNewsletter(id: string) { await rpc('newsletter_delete', { p_id: id }); }
