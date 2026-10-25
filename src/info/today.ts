/**
 * What the Planner tab works out about today, on the school's clock (Central time): the date
 * for the header, the greeting, whether there's school, the uniform to wear (from the
 * 2026–2027 Uniform Guide) and what's coming up in the next two weeks. No app imports,
 * so tests run it.
 */
import { schoolToday } from '../calendar/past';

type Day = { date: string; endDate: string | null; title: string; category: string };

const noon = (iso: string) => new Date(`${iso}T12:00:00`);
export const addDays = (iso: string, n: number) => {
  const d = noon(iso);
  d.setDate(d.getDate() + n);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
const covers = (e: Day, iso: string) => e.date <= iso && (e.endDate ?? e.date) >= iso;

/** "Saturday, October 24", for the header. */
export const headerDate = (today = schoolToday()) =>
  noon(today).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });

/** The hour on the school's clock (0–23). */
export function schoolHour(now = new Date()) {
  try {
    return Number(new Intl.DateTimeFormat('en-US', { timeZone: 'America/Chicago', hour: 'numeric', hourCycle: 'h23' }).format(now));
  } catch {
    return now.getHours();
  }
}

/** "Good morning Ava!": a student's first name, else "Royal". */
export function greeting(hour: number, person?: { firstName?: string | null; schoolRole?: string | null } | null) {
  const part = hour < 12 ? 'morning' : hour < 17 ? 'afternoon' : 'evening';
  const name = person?.schoolRole === 'student' && person.firstName?.trim() ? person.firstName.trim() : 'Royal';
  return `Good ${part} ${name}!`;
}

/** Why there's no school today ("Weekend", "Veteran's Day – Closed"), or null on a school day. */
export function noSchool(today: string, events: Day[]): string | null {
  const off = events.find((e) => covers(e, today) && ['No School', 'Teacher In-Service'].includes(e.category));
  if (off) return off.title;
  const dow = noon(today).getDay();
  return dow === 0 || dow === 6 ? 'Weekend' : null;
}

/** The school calendar's events today (other than the day off itself). */
export const eventsToday = <T extends Day>(today: string, events: T[]) =>
  events.filter((e) => covers(e, today) && !['No School', 'Teacher In-Service'].includes(e.category));

/** The days the Planner tab pages through: today and the 13 after it. */
export const twoWeeks = (today: string, n = 14) => Array.from({ length: n }, (_, i) => addDays(today, i));

/** How a day reads in a heading: "Today", "Tomorrow", "Monday", or "Monday, Nov 30" a week or more out. */
export function dayLabel(day: string, today: string) {
  const days = Math.round((noon(day).getTime() - noon(today).getTime()) / 86_400_000);
  if (days === 0) return 'Today';
  if (days === 1) return 'Tomorrow';
  return noon(day).toLocaleDateString('en-US', days < 7 ? { weekday: 'long' } : { weekday: 'long', month: 'short', day: 'numeric' });
}

/** The school day (Central time) a timestamp falls on. */
export const dayOf = (iso: string) => schoolToday(new Date(iso));

type Due = { dueOn: string | null; done: boolean; title: string };
/**
 * A student's assignments for one day: what's due (done ones too, checked off) and, on
 * today, what's still overdue. Soonest first.
 */
export function assignmentsOn<T extends Due>(list: T[], day: string, today: string) {
  const sorted = [...list].sort((a, b) => (a.dueOn ?? '').localeCompare(b.dueOn ?? '') || a.title.localeCompare(b.title));
  return {
    overdue: day === today ? sorted.filter((a) => !a.done && !!a.dueOn && a.dueOn < today) : [],
    due: sorted.filter((a) => a.dueOn === day),
  };
}

/** What's on the calendar after today through the next two weeks, soonest first. */
export const nextTwoWeeks = <T extends Day>(events: T[], today = schoolToday(), days = 14) => {
  const from = addDays(today, 1);
  const to = addDays(today, days);
  return events.filter((e) => (e.endDate ?? e.date) >= from && e.date <= to).sort((a, b) => a.date.localeCompare(b.date));
};

export type Uniform = {
  kind: 'daily' | 'chapel';
  title: string;
  boys: string[];
  girls: string[];
  shoes: string;
  /** Grade-level Chapel details for these grades, and day notes (PE, Spirit Day). */
  notes: string[];
};

const DAILY = {
  boys: ['White, navy or light blue polo, or a white or light blue oxford', 'Khaki or navy pants or shorts', 'Black or brown belt if needed'],
  girls: ['White, navy or light blue polo, or a white or light blue Peter Pan blouse', 'Khaki or navy pants or shorts, or an approved skirt, skort or jumper'],
  shoes: 'Closed-toe shoes, mostly white, black, brown or navy. Sneakers are fine.',
};
const CHAPEL = {
  boys: ['White or light blue oxford with a tie', 'Sweater vest or blazer (by grade)', 'Uniform pants', 'Black or brown belt if needed'],
  girls: ['White or light blue Peter Pan blouse with a crossbow', 'Approved skirt, skort or jumper'],
  shoes: 'Black, brown or navy dress shoes. No sneakers on Chapel Day.',
};
/** The Chapel uniform by grade band (grades: K2 = −3 … 12th = 12). */
const CHAPEL_BANDS: { from: number; to: number; label: string; text: string }[] = [
  { from: -3, to: -2, label: 'K2–K3', text: 'boys wear a tie, white oxford and khaki or navy pants; girls a Peter Pan blouse, crossbow, and navy polo dress or approved skort or jumper.' },
  { from: -1, to: 5, label: 'K4–5th', text: 'boys wear the KHPS sweater vest over a white oxford; girls may wear the KHPS cardigan or vest.' },
  { from: 6, to: 8, label: '6th–8th', text: 'boys wear the KHPS sweater vest over a plain white oxford, or the KHPS blazer; girls may wear the “at the knee” plaid or khaki pleated skirt, and the KHPS cardigan or vest.' },
  { from: 9, to: 12, label: '9th–12th', text: 'the KHPS blazer is required.' },
];

/** Whose Chapel details to show: a grade, or a parent's child by name. */
type Wearer = number | null | undefined | { name: string; grade: number | null | undefined };
const gradeOf = (w: Wearer) => (typeof w === 'object' && w ? w.grade : w);
/** "Ava", "Ava and Liam", "Ava, Liam and Mia". */
export const names = (list: string[]) => list.length < 2 ? list.join('') : `${list.slice(0, -1).join(', ')} and ${list[list.length - 1]}`;

/**
 * The uniform for a day: the Chapel uniform on Wednesdays, the daily uniform on other
 * school days, nothing when there's no school. `wearers` (the student's grade, or a
 * parent's children by name) add the Chapel details for their grades, with the names.
 */
export function uniformFor(today: string, events: Day[], wearers: Wearer[] = []): Uniform | null {
  if (noSchool(today, events)) return null;
  const chapel = noon(today).getDay() === 3;
  const base = chapel ? CHAPEL : DAILY;
  const notes: string[] = [];
  if (chapel) {
    for (const b of CHAPEL_BANDS) {
      const here = wearers.filter((w) => { const g = gradeOf(w); return g != null && g >= b.from && g <= b.to; });
      const who = here.flatMap((w) => (typeof w === 'object' && w ? [w.name] : []));
      if (here.length) notes.push(`${b.label}${who.length ? ` (${names(who)})` : ''}: ${b.text}`);
    }
  } else {
    notes.push('On your PE days, wear the PE uniform with white or black athletic shoes.');
  }
  if (eventsToday(today, events).some((e) => /spirit/i.test(e.title))) notes.push('Spirit Day: Kingdom Heights sweatshirts are allowed.');
  return { kind: chapel ? 'chapel' : 'daily', title: chapel ? 'Wednesday Chapel uniform' : 'Daily uniform', boys: base.boys, girls: base.girls, shoes: base.shoes, notes };
}

export const UNIFORM_GUIDE = 'https://www.khroyals.com/s/Uniform-Guide.pdf';

/** Royal News, the newsletter emailed to families. Until the school gives its web address, the link opens the News page. */
export const ROYAL_NEWS_URL: string | null = null;
