/**
 * What the Volunteer screens work out from an opportunity: its banner art, how long it
 * runs, how soon it starts, and its details split into sections. No app imports, so
 * tests run it.
 */
import type { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { schoolToday } from '../calendar/past';

type When = { startsOn: string; endsOn: string | null; startTime: string | null; endTime: string | null };
type Glyph = React.ComponentProps<typeof MaterialCommunityIcons>['name'];
type Icon = React.ComponentProps<typeof Ionicons>['name'];
export type Theme = { glyph: Glyph; label: string };

/** Banner art by the words in an opportunity's title (then its details); the first match wins. */
const THEMES: [RegExp, Theme][] = [
  [/christmas|nativity|advent/i, { glyph: 'pine-tree', label: 'Christmas' }],
  [/car ?line|carpool|parking|traffic|pick-?up|drop-?off/i, { glyph: 'car-side', label: 'Car line' }],
  [/book|library|reading/i, { glyph: 'book-open-variant', label: 'Books' }],
  [/\bcop(y|ies|ying)\b|laminat|workroom|bulletin board|classroom/i, { glyph: 'printer', label: 'Classroom help' }],
  [/lunch|snack|food|bake|meal|kitchen|concession|breakfast|potluck/i, { glyph: 'food-apple', label: 'Food' }],
  [/usher|program|concert|recital|musical|performance|assembly|graduation/i, { glyph: 'ticket', label: 'Program' }],
  [/festival|party|carnival|celebrat|dance/i, { glyph: 'party-popper', label: 'Celebration' }],
  [/field day|tournament|\bgames?\b|athletic|\bsports?\b/i, { glyph: 'trophy-outline', label: 'Athletics' }],
  [/garden|landscap|grounds|clean-?up|beautif|planting/i, { glyph: 'flower', label: 'Grounds' }],
  [/fundrais|auction|donat|\bsale\b/i, { glyph: 'hand-coin', label: 'Fundraising' }],
  [/field trip|chaperon|\bbus\b/i, { glyph: 'bus-school', label: 'Field trip' }],
  [/pray|worship|chapel|devotion/i, { glyph: 'hands-pray', label: 'Faith' }],
  [/photo|picture|yearbook/i, { glyph: 'camera', label: 'Photos' }],
];
export const HELPING_HANDS: Theme = { glyph: 'hand-heart', label: 'Helping hands' };

export function themeOf(o: { title: string; description: string }): Theme {
  return (THEMES.find(([re]) => re.test(o.title)) ?? THEMES.find(([re]) => re.test(o.description)))?.[1] ?? HELPING_HANDS;
}

const dayNumber = (iso: string) => Date.UTC(+iso.slice(0, 4), +iso.slice(5, 7) - 1, +iso.slice(8, 10)) / 86_400_000;
const daysBetween = (from: string, to: string) => Math.round(dayNumber(to) - dayNumber(from));
const minutes = (hm: string) => { const [h, m] = hm.split(':').map(Number); return h * 60 + m; };

/** "45 min", "2 hours", "1 hr 30 min" or "4 days"; null without times. */
export function durationLabel(o: When): string | null {
  if (o.endsOn && o.endsOn > o.startsOn) return `${daysBetween(o.startsOn, o.endsOn) + 1} days`;
  if (!o.startTime || !o.endTime) return null;
  const total = minutes(o.endTime) - minutes(o.startTime);
  if (total <= 0) return null;
  const h = Math.floor(total / 60), m = total % 60;
  return h === 0 ? `${m} min` : m ? `${h} hr ${m} min` : `${h} hour${h === 1 ? '' : 's'}`;
}

/** "Today", "Tomorrow", "In 9 days", "Happening now" (a multi-day one under way), or null once it's over. */
export function startsLabel(o: When, today = schoolToday()): string | null {
  if ((o.endsOn ?? o.startsOn) < today) return null;
  const n = daysBetween(today, o.startsOn);
  return n < 0 ? 'Happening now' : n === 0 ? 'Today' : n === 1 ? 'Tomorrow' : `In ${n} days`;
}

/** "3 spots left", "Last spot!" or "Full"; null without a limit. */
export const spotsLeft = (n: number, spots: number | null) =>
  !spots ? null : n >= spots ? 'Full' : spots - n === 1 ? 'Last spot!' : `${spots - n} spots left`;

/** The opportunity's days:"16–19" in "NOV", or "30–2" in "NOV–DEC". */
export function dateTile(o: When): { month: string; days: string } {
  const month = (iso: string) => new Date(`${iso}T12:00`).toLocaleDateString('en-US', { month: 'short' }).toUpperCase();
  const day = (iso: string) => String(Number(iso.slice(8, 10)));
  if (!o.endsOn || o.endsOn <= o.startsOn) return { month: month(o.startsOn), days: day(o.startsOn) };
  const m1 = month(o.startsOn), m2 = month(o.endsOn);
  return { month: m1 === m2 ? m1 : `${m1}–${m2}`, days: `${day(o.startsOn)}–${day(o.endsOn)}` };
}

export type DetailSection = { heading: string | null; paragraphs: string[] };

/**
 * "What to bring:" on a line of its own, or a short "Questions: ask in the chat" (three
 * words at most, so a sentence with a colon in it stays a sentence). The colon must
 * end the line or be followed by a space, so "3:30 PM" and links don't count.
 */
const HEADING_LINE = /^([A-Za-z][^:\n]{0,39}):$/;
const HEADING_INLINE = /^([A-Za-z][^:\n\s]*(?: [^:\n\s]+){0,2}):\s+(.+)$/;
const heading = (line: string) => {
  const own = line.match(HEADING_LINE);
  if (own) return { heading: own[1].trim(), rest: '' };
  const inline = line.length <= 200 ? line.match(HEADING_INLINE) : null;
  return inline && inline[1].length <= 24 ? { heading: inline[1].trim(), rest: inline[2].trim() } : null;
};

/**
 * The details split into sections. A blank line starts a new block; a block whose first
 * line is a short heading ending in ":" starts a section with that heading. Text before
 * the first heading is the "About" section (heading null); later blocks without a
 * heading belong to the section above them.
 */
export function detailSections(text: string): DetailSection[] {
  const out: DetailSection[] = [];
  for (const block of text.split(/\n\s*\n/).map((b) => b.trim()).filter(Boolean)) {
    const [first, ...rest] = block.split('\n');
    const h = heading(first.trim());
    if (h) out.push({ heading: h.heading, paragraphs: [h.rest, rest.join('\n').trim()].filter(Boolean) });
    else if (out.length) out[out.length - 1].paragraphs.push(block);
    else out.push({ heading: null, paragraphs: [block] });
  }
  return out;
}

/** An icon for a details section, by its heading. */
export function sectionIcon(heading: string | null): Icon {
  const h = heading ?? '';
  return !heading ? 'document-text-outline'
    : /bring|pack|supplies/i.test(h) ? 'bag-handle-outline'
    : /wear|dress|attire/i.test(h) ? 'shirt-outline'
    : /park|arriv|meet|check.?in/i.test(h) ? 'navigate-outline'
    : /question|contact|ask/i.test(h) ? 'help-circle-outline'
    : /schedule|shift|time/i.test(h) ? 'time-outline'
    : /do\b|task|job|role|duties|help with/i.test(h) ? 'construct-outline'
    : /kid|child|student/i.test(h) ? 'happy-outline'
    : 'information-circle-outline';
}
