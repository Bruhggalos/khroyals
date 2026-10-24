/** Date and time values for the pickers: dates "YYYY-MM-DD", times 24-hour "HH:MM" (no React Native, so tests can use it). */
export const pad = (n: number) => String(n).padStart(2, '0');

/** "2026-10-24" ↔ Date (local midnight). */
export const toDateString = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const parseDate = (v: string) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(v);
  if (!m) return null;
  const date = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return toDateString(date) === v ? date : null;
};
/** "15:30" ↔ Date (today at that time). */
export const toTimeString = (d: Date) => `${pad(d.getHours())}:${pad(d.getMinutes())}`;
export const parseTime = (v: string) => {
  const m = /^(\d{1,2}):(\d{2})$/.exec(v);
  if (!m || Number(m[1]) > 23 || Number(m[2]) > 59) return null;
  const d = new Date();
  d.setHours(Number(m[1]), Number(m[2]), 0, 0);
  return d;
};

export const isDate = (value: string) => parseDate(value) !== null;
export const isTime = (value: string) => parseTime(value) !== null;

/** Birthdays: from 25 years ago up to today, opening around a young student's age. */
export const birthdayMax = () => toDateString(new Date());
export const birthdayMin = () => { const d = new Date(); d.setFullYear(d.getFullYear() - 25); return toDateString(d); };
export const birthdayStart = () => { const d = new Date(); d.setFullYear(d.getFullYear() - 8); return toDateString(d); };

/** "Fri, Oct 24, 2026" */
export const dateLabel = (v: string) =>
  parseDate(v)?.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' }) ?? '';
/** "3:30 PM" */
export const timeLabel = (v: string) =>
  parseTime(v)?.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }) ?? '';
