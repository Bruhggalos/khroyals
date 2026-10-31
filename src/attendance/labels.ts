/**
 * Class attendance as the app shows it: the marks a teacher gives, the office's check-ins on a
 * student's row, a class's roll at a glance, and stepping between school days. The mark keys match
 * class_attendance.status's check in the database (tests/attendance.test.ts compares). No app imports.
 */
import type { AttendanceMark, RollCheck } from '../api/types';
import { schoolToday } from '../calendar/past';
import { clock } from '../carline/time';
import { reasonLabel } from '../checkin/labels';

export const MARKS: { key: AttendanceMark; label: string; short: string; color: string }[] = [
  { key: 'present', label: 'Present', short: 'P', color: '#15803D' },
  { key: 'late', label: 'Late', short: 'L', color: '#B45309' },
  { key: 'absent', label: 'Absent', short: 'A', color: '#B42318' },
];
export const markColor = (m: AttendanceMark | null) => MARKS.find((x) => x.key === m)?.color ?? '#94A3B8';

type Counts = { students: number; present: number; late: number; absent: number; unmarked: number; left: number };

/** A class's roll at a glance: "Roll not taken yet", or "18 present · 1 late · 1 absent · 1 left early". */
export function rollLine(c: Counts) {
  if (c.students === 0) return 'No students in this class';
  const left = c.left > 0 && `${c.left} left early`;
  if (c.unmarked === c.students) return ['Roll not taken yet', left].filter(Boolean).join(' · ');
  return [c.present > 0 && `${c.present} present`, c.late > 0 && `${c.late} late`, c.absent > 0 && `${c.absent} absent`,
    left, c.unmarked > 0 && `${c.unmarked} not marked`].filter(Boolean).join(' · ');
}

/** The office's check-ins and check-outs on a student's row: "Arrived 9:12 AM · Appointment", "Left 1:15 PM with Rosa Reyes · Sick". */
export function checkLine(c: RollCheck) {
  const reason = c.reason === 'late' ? null : reasonLabel(c.reason);
  return c.kind === 'in'
    ? ['Arrived ' + clock(c.at), reason].filter(Boolean).join(' · ')
    : [`Left ${clock(c.at)}${c.person ? ` with ${c.person}` : ''}`, reason].filter(Boolean).join(' · ');
}

/** The school day before or after (weekends skipped); never later than today. */
export function stepDay(day: string, by: -1 | 1, today = schoolToday()) {
  const d = new Date(`${day}T12:00:00Z`);
  do d.setUTCDate(d.getUTCDate() + by); while (d.getUTCDay() === 0 || d.getUTCDay() === 6);
  const next = d.toISOString().slice(0, 10);
  return next > today ? day : next;
}
