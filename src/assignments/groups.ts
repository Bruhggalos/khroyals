/**
 * How the Assignments app sorts a student's list: what's overdue (still not done), due
 * today, coming up, and with no due date, soonest first; done ones go behind "Show done".
 * Dates go by the school's day. No app imports, so tests run it.
 */
import { schoolToday } from '../calendar/past';

type Item = { dueOn: string | null; done: boolean; title: string };
export type Groups<T> = { overdue: T[]; today: T[]; upcoming: T[]; someday: T[]; done: T[] };

export function groupAssignments<T extends Item>(list: T[], today = schoolToday()): Groups<T> {
  const g: Groups<T> = { overdue: [], today: [], upcoming: [], someday: [], done: [] };
  const byDue = [...list].sort((a, b) => (a.dueOn ?? '9999').localeCompare(b.dueOn ?? '9999') || a.title.localeCompare(b.title));
  for (const a of byDue) {
    if (a.done) g.done.push(a);
    else if (!a.dueOn) g.someday.push(a);
    else if (a.dueOn < today) g.overdue.push(a);
    else if (a.dueOn === today) g.today.push(a);
    else g.upcoming.push(a);
  }
  return g;
}

const dayNumber = (iso: string) => Date.UTC(+iso.slice(0, 4), +iso.slice(5, 7) - 1, +iso.slice(8, 10)) / 86_400_000;
const shortDay = (iso: string) => new Date(`${iso}T12:00`).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });

/** "Due today", "Due tomorrow", "Due Fri, Oct 23", "Overdue · Mon, Oct 19", or "No due date". */
export function dueLabel(dueOn: string | null, today = schoolToday()): string {
  if (!dueOn) return 'No due date';
  const n = Math.round(dayNumber(dueOn) - dayNumber(today));
  return n < 0 ? `Overdue · ${shortDay(dueOn)}` : n === 0 ? 'Due today' : n === 1 ? 'Due tomorrow' : `Due ${shortDay(dueOn)}`;
}
