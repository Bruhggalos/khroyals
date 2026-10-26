/**
 * Reads a Smore newsletter page (app.smore.com/n/…) into Royal News blocks: section headings,
 * text items (a title and paragraphs of plain, bold and linked text) and pictures. Links keep
 * their real destination; Smore's per-reader tracking links are dropped (they can name the
 * reader). No Deno or app imports, so the Edge Function, the app and tests share it.
 */
export type Span = { text: string; bold?: boolean; href?: string };
export type NewsBlock =
  | { kind: 'heading'; text: string }
  | { kind: 'text'; title: string | null; paragraphs: Span[][] }
  | { kind: 'image'; src: string };
export type Newsletter = { title: string; sentOn: string | null; sourceUrl: string; blocks: NewsBlock[] };

/** Only Smore's own newsletter pages are read. */
export function smoreUrl(input: string): string | null {
  try {
    const u = new URL(input.trim());
    if (u.protocol !== 'https:' || !/^(app\.|www\.)?smore\.com$/.test(u.hostname)) return null;
    const m = u.pathname.match(/^\/n\/([A-Za-z0-9]+)(-[A-Za-z0-9-]*)?\/?$/);
    return m ? `https://app.smore.com/n/${m[1]}${m[2] ?? ''}` : null;
  } catch {
    return null;
  }
}

const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', '#39': "'" };
const decode = (s: string) => s
  .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
  .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
  .replace(/&([a-z#0-9]+);/gi, (m, n) => ENTITIES[n] ?? m);
const text = (html: string) => decode(html.replace(/<[^>]*>/g, '')).replace(/\s+/g, ' ').trim();
const attr = (tag: string, name: string) => tag.match(new RegExp(`\\s${name}="([^"]*)"`))?.[1];
/** A field of a block: `data-field-key="title"` and so on, up to the element's end. */
function field(block: string, key: string): string | null {
  const i = block.indexOf(`data-field-key="${key}"`);
  if (i < 0) return null;
  const open = block.indexOf('>', i) + 1;
  const tag = block.slice(block.lastIndexOf('<', i) + 1).match(/^[a-z0-9]+/i)?.[0] ?? 'div';
  // Walk to the matching close tag of the same name.
  let depth = 1, pos = open;
  const re = new RegExp(`<(/?)${tag}\\b[^>]*>`, 'gi');
  re.lastIndex = open;
  for (let m = re.exec(block); m; m = re.exec(block)) {
    depth += m[1] ? -1 : 1;
    if (!depth) return block.slice(open, m.index);
    pos = re.lastIndex;
  }
  return block.slice(open, pos);
}

/** A safe link: a real http(s) address, never a tracking redirect. */
function link(tag: string): string | undefined {
  const href = decode(attr(tag, 'o-href') ?? attr(tag, 'href') ?? '');
  try {
    const u = new URL(href);
    if (!/^https?:$/.test(u.protocol) || /(^|\.)edulnk\.com$/.test(u.hostname) || /__\$u__/.test(href)) return undefined;
    return u.toString();
  } catch {
    return undefined;
  }
}

/** Rich text (p, strong, a, br, li) into paragraphs of spans. */
export function paragraphs(html: string): Span[][] {
  const out: Span[][] = [];
  let line: Span[] = [];
  let bold = 0;
  let href: string | undefined;
  let bullet = false;
  const push = (t: string) => {
    if (!t) return;
    if (bullet && t.trim()) { bullet = false; t = `• ${t.trimStart()}`; }
    const last = line[line.length - 1];
    if (last && !!last.bold === bold > 0 && last.href === href) last.text += t;
    else line.push({ text: t, ...(bold > 0 ? { bold: true } : {}), ...(href ? { href } : {}) });
  };
  const flush = () => {
    const cleaned = line.map((s) => ({ ...s, text: s.text.replace(/\s+/g, ' ') }));
    if (cleaned.length) { cleaned[0].text = cleaned[0].text.trimStart(); cleaned[cleaned.length - 1].text = cleaned[cleaned.length - 1].text.trimEnd(); }
    const kept = cleaned.filter((s) => s.text);
    if (kept.length) out.push(kept);
    line = [];
  };
  for (const part of html.split(/(<[^>]+>)/)) {
    if (!part.startsWith('<')) { push(decode(part)); continue; }
    const name = part.match(/^<\/?([a-z0-9]+)/i)?.[1]?.toLowerCase() ?? '';
    const closing = part.startsWith('</');
    if (name === 'strong' || name === 'b') bold += closing ? -1 : 1;
    else if (name === 'a') href = closing ? undefined : link(part);
    else if (name === 'br') push('\n');
    else if (['p', 'div', 'li', 'h1', 'h2', 'h3', 'h4', 'ul', 'ol'].includes(name)) {
      flush();
      if (!closing && name === 'li') bullet = true;
    }
  }
  flush();
  return out;
}

const MONTHS = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'];
/** "October 23, 2026" → "2026-10-23". */
export function isoDate(s: string | null): string | null {
  const m = s?.toLowerCase().match(/([a-z]+)\s+(\d{1,2}),\s*(\d{4})/);
  const month = m ? MONTHS.indexOf(m[1]) : -1;
  return m && month >= 0 ? `${m[3]}-${String(month + 1).padStart(2, '0')}-${m[2].padStart(2, '0')}` : null;
}

export function parseSmore(html: string, sourceUrl: string): Newsletter {
  const chunks = html.split(/data-block-type="/).slice(1);
  let title = text(html.match(/<title>([^<]*)<\/title>/)?.[1] ?? '') || 'Royal News';
  let sentOn: string | null = null;
  const blocks: NewsBlock[] = [];
  for (const chunk of chunks) {
    const type = chunk.slice(0, chunk.indexOf('"'));
    if (type === 'header') {
      title = text(field(chunk, 'title') ?? '') || title;
      sentOn = isoDate(text(field(chunk, 'subtitle') ?? ''));
    } else if (type === 'text.title') {
      // Titles are drawn as SVG lettering; the words are in data-toc-text / aria-label.
      const t = decode(chunk.match(/data-toc-text="([^"]*)"/)?.[1] ?? chunk.match(/aria-label="([^"]*)"/)?.[1] ?? '').trim();
      if (t) blocks.push({ kind: 'heading', text: t });
    } else if (type.startsWith('text.')) {
      const t = text(field(chunk, 'title') ?? '') || null;
      const body = paragraphs(field(chunk, 'content') ?? '');
      if (t || body.length) blocks.push({ kind: 'text', title: t, paragraphs: body });
    } else if (type.startsWith('image.')) {
      for (const tag of chunk.match(/<a [^>]*data-img-full="[^"]+"[^>]*>/g) ?? []) {
        const src = decode(attr(tag, 'data-img-full') ?? '');
        if (/^https:\/\/cdn\.smore\.com\//.test(src)) blocks.push({ kind: 'image', src });
      }
    }
  }
  return { title, sentOn, sourceUrl, blocks };
}
