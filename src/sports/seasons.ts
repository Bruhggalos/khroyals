/**
 * Sports app rules with no app imports (so tests run them): where a season stands,
 * whether sign-ups are open, who's eligible, and how the Sports page is grouped.
 * The database checks the same things (supabase/migrations/…_sports.sql).
 */
import { gradeLabel } from '../comms/grades';

export type SeasonInfo = {
  id: string; sportId: string; name: string; startsOn: string; endsOn: string;
  signupOpens: string | null; signupCloses: string | null; minGrade: number | null; maxGrade: number | null;
};

/** Today as YYYY-MM-DD on the school's clock (Central time), like app.school_today(). */
export function schoolToday(now = new Date()): string {
  try {
    return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Chicago', year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
  } catch {
    // No time zone support: the phone's own date (families are on Central time anyway).
    const d = new Date(now.getTime() - now.getTimezoneOffset() * 60_000);
    return d.toISOString().slice(0, 10);
  }
}

export const seasonState = (s: SeasonInfo, today: string): 'in-season' | 'upcoming' | 'over' =>
  s.endsOn < today ? 'over' : s.startsOn > today ? 'upcoming' : 'in-season';

/** Online sign-up: open now, opening later, closed, or none (the season has no sign-up window). */
export function signupState(s: SeasonInfo, today: string): 'open' | 'soon' | 'closed' | 'none' {
  if (!s.signupOpens || !s.signupCloses) return 'none';
  if (today < s.signupOpens) return 'soon';
  return today <= s.signupCloses ? 'open' : 'closed';
}

export const eligible = (s: SeasonInfo, grade: number | null | undefined) =>
  (s.minGrade == null || (grade != null && grade >= s.minGrade)) && (s.maxGrade == null || (grade != null && grade <= s.maxGrade));

/** "6th–12th grade", "11th grade and up", or '' for any grade (as the database words it). */
export function gradesLabel(s: Pick<SeasonInfo, 'minGrade' | 'maxGrade'>): string {
  if (s.minGrade != null && s.maxGrade != null) return `${gradeLabel(s.minGrade)}–${gradeLabel(s.maxGrade)} grade`;
  if (s.minGrade != null) return `${gradeLabel(s.minGrade)} grade and up`;
  if (s.maxGrade != null) return `${gradeLabel(s.maxGrade)} grade and below`;
  return '';
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
/** "Aug 3" from YYYY-MM-DD. */
export const shortDay = (iso: string) => `${MONTHS[Number(iso.slice(5, 7)) - 1]} ${Number(iso.slice(8, 10))}`;
export const dateRange = (a: string, b: string) => (a === b ? shortDay(a) : `${shortDay(a)} – ${shortDay(b)}`);

/**
 * The Sports page: sports with a season on now, seasons coming up (soonest first, with
 * sign-up info), and every other sport, so people can follow it before its season.
 */
export function sportSections<S extends { id: string }, T extends SeasonInfo>(sports: S[], seasons: T[], today: string) {
  const live = seasons.filter((s) => seasonState(s, today) !== 'over');
  const inSeason = sports
    .map((sport) => ({ sport, season: live.find((s) => s.sportId === sport.id && seasonState(s, today) === 'in-season') }))
    .filter((x): x is { sport: S; season: T } => !!x.season);
  const upcoming = live.filter((s) => seasonState(s, today) === 'upcoming')
    .sort((a, b) => a.startsOn.localeCompare(b.startsOn))
    .map((season) => ({ sport: sports.find((x) => x.id === season.sportId)!, season }))
    .filter((x) => x.sport);
  const busy = new Set([...inSeason, ...upcoming].map((x) => x.sport.id));
  return { inSeason, upcoming, others: sports.filter((s) => !busy.has(s.id)) };
}

/** A sport's seasons that aren't over: the current one first, then the next. */
export const activeSeasons = <T extends SeasonInfo>(seasons: T[], sportId: string, today: string) =>
  seasons.filter((s) => s.sportId === sportId && seasonState(s, today) !== 'over').sort((a, b) => a.startsOn.localeCompare(b.startsOn));

/** A time typed as "4:30 PM", "4pm" or "16:30" → hours and minutes (24-hour), or null. */
export function parseTime(text: string): { h: number; m: number } | null {
  const t = text.trim().toLowerCase().replace(/\./g, '');
  const m = t.match(/^(\d{1,2})(?::(\d{2}))?\s*(am|pm|a|p)?$/);
  if (!m) return null;
  let h = Number(m[1]);
  const min = m[2] ? Number(m[2]) : 0;
  const half = m[3]?.[0];
  if (min > 59 || (half ? h < 1 || h > 12 : h > 23) || (!half && !m[2])) return null;
  if (half === 'p' && h !== 12) h += 12;
  if (half === 'a' && h === 12) h = 0;
  return { h, m: min };
}

/** "4:30 PM" from 24-hour parts (for filling the form back in). */
export const timeLabel = (h: number, m: number) => `${((h + 11) % 12) + 1}:${String(m).padStart(2, '0')} ${h >= 12 ? 'PM' : 'AM'}`;
