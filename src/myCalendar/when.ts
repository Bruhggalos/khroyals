/** How My calendar shows times and groups days. No app imports, so tests run it. */
import { timeLabel } from '../sports/seasons';

const hm = (t: string) => timeLabel(Number(t.slice(0, 2)), Number(t.slice(3, 5)));

/** "7:30–8:15 AM", "11:00 AM–1:00 PM", "4:00 PM" (no end), or "All day", from 24-hour HH:MM times. */
export function itemTime(start: string | null, end: string | null) {
  if (!start) return 'All day';
  if (!end) return hm(start);
  const [a, b] = [hm(start), hm(end)];
  return a.slice(-2) === b.slice(-2) ? `${a.slice(0, -3)}–${b}` : `${a}–${b}`;
}

/** Items in order, grouped by their YYYY-MM-DD day. */
export function byDay<T>(items: T[], day: (x: T) => string): { day: string; items: T[] }[] {
  const out: { day: string; items: T[] }[] = [];
  for (const x of items) {
    const d = day(x);
    const last = out[out.length - 1];
    if (last && last.day === d) last.items.push(x); else out.push({ day: d, items: [x] });
  }
  return out;
}

/** "Thursday, Oct 29". */
export const longDay = (iso: string) =>
  new Date(`${iso}T12:00:00`).toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' });
