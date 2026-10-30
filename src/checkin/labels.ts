/**
 * Checking children in and out: reasons and progress, as the app shows them. The reason keys match
 * school_checks.reason's check in the database (tests/checkin.test.ts compares). No app imports.
 */
import { schoolToday } from '../calendar/past';

export const REASONS: { key: string; label: string }[] = [
  { key: 'late', label: 'Late arrival' }, { key: 'appointment', label: 'Appointment' }, { key: 'illness', label: 'Sick' },
  { key: 'family', label: 'Family' }, { key: 'other', label: 'Other' },
];
/** Arriving late, and leaving early: the reasons the office picks from. */
export const IN_REASONS = ['late', 'appointment', 'other'];
export const OUT_REASONS = ['appointment', 'illness', 'family', 'other'];

export const reasonLabel = (key: string) => REASONS.find((r) => r.key === key)?.label ?? 'Other';

/** A list's day: "Today", or "Tue, Nov 3". */
export const dayLabel = (day: string, today = schoolToday()) => (day === today ? 'Today'
  : new Date(`${day}T12:00:00`).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }));

/** "3 of 12 checked out", or "Everyone's checked out (12)" once nobody is left. */
export function progressLine(released: number, total: number) {
  if (total === 0) return 'No students on this list';
  return released >= total ? `Everyone's checked out (${total})` : `${released} of ${total} checked out`;
}
