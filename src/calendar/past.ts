/**
 * The rule every calendar in the app follows: past events stay out of view (behind a
 * "Show past events" control) and look greyed out when shown. Dates use the school's
 * clock (Central time). No app imports, so tests run it.
 */

/** Today as YYYY-MM-DD on the school's clock, like app.school_today() in the database. */
export function schoolToday(now = new Date()): string {
  try {
    return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Chicago', year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
  } catch {
    // No time zone support: the phone's own date (families are on Central time anyway).
    return new Date(now.getTime() - now.getTimezoneOffset() * 60_000).toISOString().slice(0, 10);
  }
}

/** An all-day (or multi-day) event is past once its last day is before today. */
export const isPastDay = (lastDay: string, today = schoolToday()) => lastDay < today;

/** A timed event is past once it ends (or, with no end time, a few hours after it starts). */
export const isPastTime = (startsAt: string, endsAt: string | null, now = Date.now(), grace = 3 * 3600_000) =>
  (endsAt ? Date.parse(endsAt) : Date.parse(startsAt) + grace) < now;

/** Split a list into what's still to come and what's past (both keep their order). */
export function splitPast<T>(items: T[], isPast: (x: T) => boolean): { upcoming: T[]; past: T[] } {
  const upcoming: T[] = [];
  const past: T[] = [];
  for (const x of items) (isPast(x) ? past : upcoming).push(x);
  return { upcoming, past };
}
