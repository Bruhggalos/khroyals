/** Shapes of the content imported from khroyals.com by scripts/import_site.py. */

export type Link = { label: string; url: string };

export type Block =
  | { type: 'heading'; level: number; text: string }
  | { type: 'paragraph'; text: string; links?: Link[] }
  | { type: 'list'; ordered: boolean; items: string[] }
  | { type: 'quote'; text: string }
  | { type: 'button'; label: string; url: string }
  | { type: 'image'; src: string; alt?: string; title?: string; subtitle?: string; caption?: string; url?: string; button?: Link }
  | { type: 'gallery'; images: string[] }
  | { type: 'cards'; items: { title: string; text: string; image?: string; button?: Link }[] }
  | { type: 'accordion'; items: { title: string; blocks: Block[] }[] }
  /** Squarespace-hosted video, streamed as HLS. */
  | { type: 'video'; hls: string; thumbnail: string; durationSeconds?: number; aspectRatio?: number; background?: boolean }
  | { type: 'vimeo'; id: string; aspectRatio: number }
  | { type: 'youtube'; id: string; aspectRatio: number }
  | { type: 'rotatingText'; level: number; words: string[]; intervalMs: number }
  | { type: 'marquee'; text: string }
  /** An interactive widget that only exists on the website (e.g. tuition calculator). */
  | { type: 'webTool'; title: string; text: string; url: string }
  | { type: 'embed'; url: string }
  | { type: 'newsFeed'; limit: number };

export type Section = {
  blocks: Block[];
  background?: { type: 'image'; src: string } | Extract<Block, { type: 'video' }>;
};

export type SitePage = {
  _meta: { source: string; scrapedAt: string };
  page: { id: string; title: string; sourceUrl: string };
  sections: Section[];
};

export type Article = {
  id: string;
  slug: string;
  title: string;
  publishedAt: string;
  author: string;
  category: string;
  tags: string[];
  featured: boolean;
  heroImage: string | null;
  summary: string;
  sourceUrl: string;
  body: Block[];
};

export type CalendarEvent = {
  id: string;
  title: string;
  date: string;
  endDate: string | null;
  allDay: boolean;
  category: string;
};

export type NavItem = { label: string; url?: string; items?: Link[] };
