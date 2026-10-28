/**
 * The car line board's festive touches (app/carline-board.tsx, src/carline/SeasonScene.tsx): which
 * scene shows today, and the school-wide switches for them. No app imports, so tests run it.
 *
 * Breaks get the last school week before them; holidays get the school day before them and the day
 * itself. The keys are listed in both FESTIVE and the database's check in carline_set_festive.
 */

const DAY = 86_400_000;
const utc = (day: string) => Date.parse(`${day}T00:00:00Z`);
const iso = (ms: number) => new Date(ms).toISOString().slice(0, 10);
const mondayOf = (ms: number) => ms - ((new Date(ms).getUTCDay() + 6) % 7) * DAY;

/** The `nth` `weekday` (0 = Sunday) of `month` (1–12) in `year`; nth -1 is the last one. */
function nthWeekday(year: number, month: number, weekday: number, nth: number): string {
  if (nth < 0) {
    const last = Date.UTC(year, month, 0);
    return iso(last - ((new Date(last).getUTCDay() - weekday + 7) % 7) * DAY);
  }
  const first = Date.UTC(year, month - 1, 1);
  return iso(first + (((weekday - new Date(first).getUTCDay() + 7) % 7) + (nth - 1) * 7) * DAY);
}

/** Thanksgiving Day (the fourth Thursday of November) in `year`, as YYYY-MM-DD. */
export const thanksgiving = (year: number) => nthWeekday(year, 11, 4, 4);

/** Easter Sunday in `year` (the Gregorian computus). */
export function easter(year: number): string {
  const a = year % 19, b = Math.floor(year / 100), c = year % 100, d = Math.floor(b / 4), e = b % 4;
  const f = Math.floor((b + 8) / 25), g = Math.floor((b - f + 1) / 3), h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4), k = c % 4, l = (32 + 2 * e + 2 * i - h - k) % 7, m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31), day = ((h + l - 7 * m + 114) % 31) + 1;
  return iso(Date.UTC(year, month - 1, day));
}

/** A "No School" stretch on the school calendar: its first and last day (the same for one day). */
export type SchoolBreak = { title: string; date: string; end?: string | null };

/** A weekday that no No School stretch covers. */
export function isSchoolDay(day: string, breaks: SchoolBreak[] = []): boolean {
  const weekday = new Date(utc(day)).getUTCDay();
  return weekday !== 0 && weekday !== 6 && !breaks.some((b) => b.date <= day && day <= (b.end || b.date));
}

/** The last school day before `day`. */
export function schoolDayBefore(day: string, breaks: SchoolBreak[] = []): string {
  let d = utc(day) - DAY;
  for (let i = 0; i < 40 && !isSchoolDay(iso(d), breaks); i++) d -= DAY;
  return iso(d);
}

/**
 * The last school week before a break: from the Monday of the week before `firstDayOff`'s week
 * through the day before it. Dates are YYYY-MM-DD on the school's clock.
 */
export function weekBefore(day: string, firstDayOff: string): boolean {
  const d = utc(day), off = utc(firstDayOff);
  return d >= mondayOf(off) - 7 * DAY && d < off;
}

/**
 * The first day of Christmas break in `year`: the school calendar's (a No School event in December
 * with Christmas or Winter in its name), else the Monday of the week Christmas falls in.
 */
export function christmasBreak(year: number, breaks: SchoolBreak[] = []): string {
  const listed = breaks.find((b) => /christmas|winter/i.test(b.title) && b.date.startsWith(`${year}-12`));
  return listed ? listed.date : iso(mondayOf(utc(`${year}-12-25`)));
}

export type BreakScene = 'fall-break' | 'thanksgiving' | 'christmas' | 'spring-break';
export type HolidayScene = 'labor-day' | 'veterans-day' | 'mlk-day' | 'valentines' | 'presidents-day'
  | 'st-patricks' | 'easter' | 'mothers-day' | 'memorial-day';
export type Scene = BreakScene | HolidayScene;
export type FestiveKey = Scene | 'birthdays';

/** Holidays in the school year, with their dates. */
const HOLIDAYS: { key: HolidayScene; date: (year: number) => string }[] = [
  { key: 'labor-day', date: (y) => nthWeekday(y, 9, 1, 1) },
  { key: 'veterans-day', date: (y) => `${y}-11-11` },
  { key: 'mlk-day', date: (y) => nthWeekday(y, 1, 1, 3) },
  { key: 'valentines', date: (y) => `${y}-02-14` },
  { key: 'presidents-day', date: (y) => nthWeekday(y, 2, 1, 3) },
  { key: 'st-patricks', date: (y) => `${y}-03-17` },
  { key: 'easter', date: easter },
  { key: 'mothers-day', date: (y) => nthWeekday(y, 5, 0, 2) },
  { key: 'memorial-day', date: (y) => nthWeekday(y, 5, 1, -1) },
];

/** A holiday's date in `year`. */
export const holidayDate = (key: HolidayScene, year: number) => HOLIDAYS.find((h) => h.key === key)!.date(year);

/** Every festive touch, in school-year order, for the switches in Car line settings. */
export const FESTIVE: { key: FestiveKey; name: string; what: string }[] = [
  { key: 'birthdays', name: 'Birthdays', what: "👑 A crown on the child's name and a fanfare when they're announced" },
  { key: 'labor-day', name: 'Labor Day', what: '🦅 Stars and an eagle' },
  { key: 'fall-break', name: 'Fall Break', what: '🐿️ Acorns and a squirrel, all week before' },
  { key: 'veterans-day', name: 'Veterans Day', what: '🦅 Stars and an eagle' },
  { key: 'thanksgiving', name: 'Thanksgiving', what: '🦃 Fall leaves and a turkey, all week before' },
  { key: 'christmas', name: 'Christmas break', what: '⛄ Snow and a snowman, all week before' },
  { key: 'mlk-day', name: 'Martin Luther King Jr. Day', what: '🕊️ Stars and a dove' },
  { key: 'valentines', name: "Valentine's Day", what: '🧸 Hearts and a teddy bear' },
  { key: 'presidents-day', name: "Presidents' Day", what: '🦅 Stars and an eagle' },
  { key: 'st-patricks', name: "St. Patrick's Day", what: '🌈 Shamrocks and a rainbow' },
  { key: 'spring-break', name: 'Spring Break', what: '🦀 Sand and a crab, all week before' },
  { key: 'easter', name: 'Easter', what: '🐑 Spring flowers and a lamb' },
  { key: 'mothers-day', name: "Mother's Day", what: '💝 Bouquets and a gift' },
  { key: 'memorial-day', name: 'Memorial Day', what: '🦅 Stars and an eagle' },
];

/** The school's choice (carline_config().festive): everything on unless switched off. */
export type Festive = { enabled: boolean; off: string[] };
export const ALL_ON: Festive = { enabled: true, off: [] };

/** Whether this festive touch is on. */
export const festiveOn = (f: Festive, key: FestiveKey) => f.enabled && !f.off.includes(key);

/** A holiday shows on the school day before it and on the day itself (when that's a school day). */
export function holidayShows(day: string, holiday: string, breaks: SchoolBreak[] = []): boolean {
  return day === holiday || day === schoolDayBefore(holiday, breaks);
}

/**
 * The board's scene today, if any. A holiday (two days at most) wins over a break's week. Breaks come
 * from the school calendar (`breaks`: No School stretches around today), except Thanksgiving, which
 * goes by its date (the school is off Thanksgiving week); Christmas falls back to Christmas week.
 */
export function festiveScene(day: string, breaks: SchoolBreak[] = [], festive: Festive = ALL_ON): Scene | null {
  const year = Number(day.slice(0, 4));
  const holiday = HOLIDAYS.find((h) => festiveOn(festive, h.key) && holidayShows(day, h.date(year), breaks));
  if (holiday) return holiday.key;
  const listed = (name: RegExp) => breaks.some((b) => name.test(b.title) && weekBefore(day, b.date));
  const scene: BreakScene | null = weekBefore(day, thanksgiving(year)) ? 'thanksgiving'
    : weekBefore(day, christmasBreak(year, breaks)) ? 'christmas'
      : listed(/fall break/i) ? 'fall-break'
        : listed(/spring break/i) ? 'spring-break' : null;
  return scene && festiveOn(festive, scene) ? scene : null;
}
