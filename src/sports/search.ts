/**
 * Activities search. Every word of the query has to appear (in any order, ignoring capitals
 * and accents) in an activity (its name, description, category, and its seasons' names and
 * details) or in a schedule item (its title, kind, place, address and notes; its season and
 * activity count too, but only along with a word from the item itself, so "basketball"
 * finds the activity rather than every game). Schedule items come soonest first, with the
 * ones still to come apart from past ones (latest first). No app imports, so tests run it.
 */
import type { Sport, SportEvent, SportSeason } from '../api/types';
import { isPastTime, splitPast } from '../calendar/past';
import { KIND_LABELS, categoryInfo } from './categories';

const fold = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[–—]/g, '-').toLowerCase();
/** The words to look for. */
export const searchWords = (query: string) => fold(query).split(/\s+/).filter(Boolean);
const has = (text: string, w: string) => fold(text).includes(w);

export type EventHit = { event: SportEvent; sport: Sport | undefined; season: SportSeason | undefined };

export function searchActivities(query: string, sports: Sport[], seasons: SportSeason[], events: SportEvent[], now = Date.now()) {
  const words = searchWords(query);
  if (!words.length) return { activities: [] as Sport[], upcoming: [] as EventHit[], past: [] as EventHit[] };

  const activities = sports.filter((sp) => {
    const text = [sp.name, sp.description, categoryInfo(sp.category).label,
      ...seasons.filter((se) => se.sportId === sp.id).flatMap((se) => [se.name, se.details])].join(' ');
    return words.every((w) => has(text, w));
  });

  const hits: EventHit[] = [];
  for (const event of events) {
    const season = seasons.find((se) => se.id === event.seasonId);
    const sport = sports.find((sp) => sp.id === season?.sportId);
    const own = [event.title, KIND_LABELS[event.kind] ?? '', event.location ?? '', event.address ?? '', event.notes].join(' ');
    const around = [season?.name ?? '', sport?.name ?? ''].join(' ');
    if (words.some((w) => has(own, w)) && words.every((w) => has(own, w) || has(around, w))) hits.push({ event, sport, season });
  }
  hits.sort((a, b) => a.event.startsAt.localeCompare(b.event.startsAt));
  const { upcoming, past } = splitPast(hits, (h) => isPastTime(h.event.startsAt, h.event.endsAt, now));
  return { activities, upcoming, past: past.reverse() };
}
