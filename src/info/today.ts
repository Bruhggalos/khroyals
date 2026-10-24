/**
 * What the Info tab works out about today, on the school's clock (Central time): the date
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
const CHAPEL_BANDS: { from: number; to: number; note: string }[] = [
  { from: -3, to: -2, note: 'K2–K3: boys wear a tie, white oxford and khaki or navy pants; girls a Peter Pan blouse, crossbow, and navy polo dress or approved skort or jumper.' },
  { from: -1, to: 5, note: 'K4–5th: boys wear the KHPS sweater vest over a white oxford; girls may wear the KHPS cardigan or vest.' },
  { from: 6, to: 8, note: '6th–8th: boys wear the KHPS sweater vest over a plain white oxford, or the KHPS blazer; girls may wear the “at the knee” plaid or khaki pleated skirt, and the KHPS cardigan or vest.' },
  { from: 9, to: 12, note: '9th–12th: the KHPS blazer is required.' },
];

/**
 * The uniform for today: the Chapel uniform on Wednesdays, the daily uniform on other
 * school days, nothing when there's no school. `grades` (the student's, or a parent's
 * children's) add the Chapel details for those grades.
 */
export function uniformFor(today: string, events: Day[], grades: (number | null | undefined)[] = []): Uniform | null {
  if (noSchool(today, events)) return null;
  const chapel = noon(today).getDay() === 3;
  const base = chapel ? CHAPEL : DAILY;
  const notes: string[] = [];
  if (chapel) {
    for (const b of CHAPEL_BANDS) if (grades.some((g) => g != null && g >= b.from && g <= b.to)) notes.push(b.note);
  } else {
    notes.push('On your PE days, wear the PE uniform with white or black athletic shoes.');
  }
  if (eventsToday(today, events).some((e) => /spirit/i.test(e.title))) notes.push('Spirit Day: Kingdom Heights sweatshirts are allowed today.');
  return { kind: chapel ? 'chapel' : 'daily', title: chapel ? 'Wednesday Chapel uniform' : 'Daily uniform', boys: base.boys, girls: base.girls, shoes: base.shoes, notes };
}

export const UNIFORM_GUIDE = 'https://www.khroyals.com/s/Uniform-Guide.pdf';
