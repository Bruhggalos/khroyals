/** Sub days as the app shows them: the days and hours, and the classes. No app imports. */
import type { SubDay } from '../api/types';
import { schoolToday } from '../calendar/past';

/** "07:30" → "7:30 AM", "15:30" → "3:30 PM". */
export const clock12 = (hm: string) => {
  const [h, m] = hm.split(':').map(Number);
  return `${((h + 11) % 12) + 1}:${String(m).padStart(2, '0')} ${h >= 12 ? 'PM' : 'AM'}`;
};

const dayName = (d: string, weekday: boolean) =>
  new Date(`${d}T12:00:00`).toLocaleDateString('en-US', weekday ? { weekday: 'short', month: 'short', day: 'numeric' } : { month: 'short', day: 'numeric' });

/** "Today · 7:30 AM–3:30 PM", "Mon, Nov 2 · 7:30 AM–3:30 PM", or "Nov 2–Nov 4 · 7:30 AM–3:30 PM". */
export function subWhen(d: Pick<SubDay, 'startsOn' | 'endsOn' | 'startTime' | 'endTime'>, today = schoolToday()) {
  const days = d.startsOn !== d.endsOn ? `${dayName(d.startsOn, false)}–${dayName(d.endsOn, false)}`
    : d.startsOn === today ? 'Today' : dayName(d.startsOn, true);
  return `${days} · ${clock12(d.startTime)}–${clock12(d.endTime)}`;
}

/** "English 10 – Period 3 (Jennifer Taylor), Math 7 (Tom Baker)". */
export const classList = (d: Pick<SubDay, 'classes'>, teachers = true) =>
  d.classes.map((c) => (teachers && c.teacher ? `${c.name} (${c.teacher})` : c.name)).join(', ') || 'A class';
