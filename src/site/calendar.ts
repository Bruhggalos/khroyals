import { isPastDay, schoolToday } from '../calendar/past';
import type { CalendarEvent } from './types';

const d = (iso: string) => new Date(iso + 'T12:00:00');
const md = (iso: string) => d(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

/** "Oct 5 – 9", "Dec 21 – Jan 1" or "Sep 7". */
export function dateRange(e: Pick<CalendarEvent, 'date' | 'endDate'>) {
  if (!e.endDate || e.endDate === e.date) return md(e.date);
  const sameMonth = e.date.slice(0, 7) === e.endDate.slice(0, 7);
  return `${md(e.date)} – ${sameMonth ? d(e.endDate).getDate() : md(e.endDate)}`;
}

/** Events that haven't finished yet (today counts, on the school's clock), soonest first. */
export function upcoming(events: CalendarEvent[], limit: number, today = schoolToday()) {
  return [...events]
    .filter((e) => !isPastDay(e.endDate ?? e.date, today))
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(0, limit);
}
