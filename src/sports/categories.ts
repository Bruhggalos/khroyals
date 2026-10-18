/**
 * Activity categories (Apps → Activities): what each is called, who leads it, and which
 * kinds of schedule items it uses. No app imports, so tests run it. The database allows
 * the same categories and kinds (supabase/migrations/…_activity_categories.sql).
 */

export type Category = 'sports' | 'theater' | 'music' | 'art' | 'clubs';
export type EventKind =
  | 'game' | 'practice' | 'tryout' | 'tournament'
  | 'rehearsal' | 'audition' | 'performance'
  | 'meeting' | 'competition' | 'exhibit' | 'other';

export type CategoryInfo = {
  key: Category; label: string; emoji: string;
  /** Who runs an activity: "Coach", "Director", "Leader". */
  leader: string;
  kinds: EventKind[];
};

export const CATEGORIES: CategoryInfo[] = [
  { key: 'sports', label: 'Sports', emoji: '🏅', leader: 'Coach', kinds: ['game', 'practice', 'tryout', 'tournament', 'other'] },
  { key: 'theater', label: 'Theater', emoji: '🎭', leader: 'Director', kinds: ['rehearsal', 'audition', 'performance', 'other'] },
  { key: 'music', label: 'Music', emoji: '🎵', leader: 'Director', kinds: ['rehearsal', 'audition', 'performance', 'other'] },
  { key: 'art', label: 'Art', emoji: '🎨', leader: 'Leader', kinds: ['meeting', 'exhibit', 'competition', 'other'] },
  { key: 'clubs', label: 'Clubs', emoji: '🤝', leader: 'Leader', kinds: ['meeting', 'competition', 'other'] },
];

export const categoryInfo = (key: string | null | undefined): CategoryInfo =>
  CATEGORIES.find((c) => c.key === key) ?? CATEGORIES[0];

export const KIND_LABELS: Record<EventKind, string> = {
  game: 'Game', practice: 'Practice', tryout: 'Tryouts', tournament: 'Tournament',
  rehearsal: 'Rehearsal', audition: 'Auditions', performance: 'Performance',
  meeting: 'Meeting', competition: 'Competition', exhibit: 'Exhibit', other: 'Other',
};

/** Big events (bold color in the schedule): games, shows and competitions. */
export const isHeadline = (k: EventKind) => ['game', 'tournament', 'performance', 'competition', 'exhibit'].includes(k);
/** Home or away applies to games, tournaments and competitions. */
export const hasHomeAway = (k: EventKind) => k === 'game' || k === 'tournament' || k === 'competition';

/** "Coach" / "Coaches", "Director" / "Directors"… */
export const leaders = (key: string | null | undefined, n: number) => {
  const one = categoryInfo(key).leader;
  return n === 1 ? one : one.endsWith('h') ? `${one}es` : `${one}s`;
};

/** The activities shown for a category pill ('all' shows every one). */
export const inCategory = <T extends { category: string }>(items: T[], filter: Category | 'all') =>
  filter === 'all' ? items : items.filter((x) => x.category === filter);

/** A title hint for a new schedule item. */
export const titleHint = (k: EventKind) =>
  k === 'game' ? 'vs. Westminster Christian' : k === 'performance' ? 'Opening night' : k === 'audition' ? 'Auditions' : KIND_LABELS[k];
