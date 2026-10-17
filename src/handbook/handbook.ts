/**
 * The Student / Parent Handbook for the in-app reader, from the same text the
 * Assistant answers from (supabase/functions/assistant/handbook.ts, generated
 * from the school's PDF). Page numbers are the PDF's, which the Assistant cites.
 */
import { HANDBOOK, HANDBOOK_SOURCE } from '../../supabase/functions/assistant/handbook';

export { HANDBOOK_SOURCE };
export type Block = { kind: 'heading' | 'text'; text: string };
export type Page = { page: number; blocks: Block[]; plain: string };
export type Match = { page: number; before: string; hit: string; after: string };

/** Lines this long were wrapped mid-paragraph in the PDF. */
const WRAPPED = 72;

/** Title Case, allowing short joining words: "Early Drop Off and Late Pick Up". */
const TITLE = /^[A-Z0-9&][\w'’/&-]*(\s+([A-Z0-9&][\w'’/&-]*|a|an|and|at|by|for|from|in|of|on|or|the|to|with))*$/;

const isHeading = (line: string) =>
  line.length <= 60 && /[A-Za-z]{2}/.test(line) && !/[.,;:!?)]$/.test(line)
  && (line === line.toUpperCase() || TITLE.test(line));

/** Rebuild paragraphs and headings from a page's wrapped lines (dropping the printed page number). */
export function toBlocks(text: string): Block[] {
  const lines = text.split('\n').map((l) => l.trim()).filter(Boolean);
  if (lines.length && /^\d{1,3}$/.test(lines[lines.length - 1])) lines.pop();
  const blocks: Block[] = [];
  let para = '';
  const flush = () => { if (para) blocks.push({ kind: 'text', text: para }); para = ''; };
  for (const line of lines) {
    // A title line right after a finished sentence starts a new section, even if that sentence's line was long.
    if ((!para || /[.!?]$/.test(para)) && isHeading(line)) { flush(); blocks.push({ kind: 'heading', text: line }); continue; }
    para = para ? `${para} ${line}` : line;
    if (line.length < WRAPPED || line.endsWith(':')) flush();
  }
  flush();
  return blocks;
}

/** Pages from the "[Page N]"-marked handbook text. */
export function parsePages(source: string): Page[] {
  return source.split(/\[Page (\d+)\]\n/).slice(1).reduce<Page[]>((pages, part, i, all) => {
    if (i % 2 === 0) {
      const blocks = toBlocks(all[i + 1] ?? '');
      pages.push({ page: Number(part), blocks, plain: blocks.map((b) => b.text).join('\n') });
    }
    return pages;
  }, []);
}

export const PAGES = parsePages(HANDBOOK);

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
/** A case-insensitive pattern for the search text (null when it's too short to search). */
export const pattern = (query: string) => (query.trim().length >= 2 ? new RegExp(escape(query.trim()), 'gi') : null);

/** Every place the text appears, with a little context either side. */
export function search(pages: Page[], query: string, context = 50): Match[] {
  const re = pattern(query);
  if (!re) return [];
  const matches: Match[] = [];
  for (const p of pages) {
    const text = p.plain.replace(/\n/g, ' ');
    for (const m of text.matchAll(re)) {
      const at = m.index ?? 0;
      const from = Math.max(0, at - context);
      const to = Math.min(text.length, at + m[0].length + context);
      matches.push({
        page: p.page,
        before: (from > 0 ? '…' : '') + text.slice(from, at),
        hit: m[0],
        after: text.slice(at + m[0].length, to) + (to < text.length ? '…' : ''),
      });
    }
  }
  return matches;
}
