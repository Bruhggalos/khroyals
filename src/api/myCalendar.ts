/** myCalendar: internal API implementation. Screens import the connect facade. */
import type { MyCalendarItem, StudentEvent } from './types';
import { live, rpc } from './client';
import { current } from './session';
import { enumValue } from './validation';
import { KIND_LABELS } from '../sports/categories';

const noServer = () => { throw new Error('My calendar needs the school server; this build is running on demo data.'); };

/** The signed-in staff member's own calendar from `from` to `to` (YYYY-MM-DD). */
export async function myCalendar(from: string, to: string): Promise<MyCalendarItem[]> {
  if (!live || !current) return [];
  return (await rpc('my_calendar', { p_from: from, p_to: to })).map((r) => ({
    id: r.id, sportEventId: r.sport_event_id ?? null, sportId: r.sport_id ?? null, title: r.title, date: r.starts_on,
    startTime: r.start_time ?? null, endTime: r.end_time ?? null, location: r.location ?? null, address: r.address ?? null,
    notes: r.notes ?? '', cancelled: !!r.cancelled,
  }));
}

/** For a teacher: activity schedule items students in their classes take part in, from `from` to `to`. */
export async function studentEvents(from: string, to: string): Promise<StudentEvent[]> {
  if (!live || !current) return [];
  return (await rpc('student_events', { p_from: from, p_to: to })).map((r) => ({
    id: r.id, seasonId: r.season_id, kind: enumValue(r.kind, Object.keys(KIND_LABELS) as (keyof typeof KIND_LABELS)[]), title: r.title,
    startsAt: r.starts_at, endsAt: r.ends_at ?? null, location: r.location ?? null, address: r.address ?? null, home: r.home ?? null,
    notes: r.notes ?? '', cancelled: !!r.cancelled, sportId: r.sport_id, sportName: r.sport_name, sportIcon: r.sport_icon,
    students: Array.isArray(r.students) ? (r.students as { id: string; name: string }[]) : [], planned: !!r.planned,
  }));
}

/** Add (no `id`) or change one of your own events. */
export async function savePersonalEvent(e: {
  id?: string | null; title: string; date: string; startTime: string | null; endTime: string | null; location: string; notes: string;
}) {
  if (!live) noServer();
  await rpc('personal_event_save', {
    p_id: e.id ?? null, p_title: e.title, p_on: e.date, p_start: e.startTime,
    p_end: e.endTime, p_location: e.location, p_notes: e.notes,
  });
}

export async function deletePersonalEvent(id: string) { if (!live) noServer(); await rpc('personal_event_delete', { p_id: id }); }

/**
 * Put an activity schedule item on your calendar, or take it off. With `tell`, your students in
 * it and their parents hear you're coming (once). Returns how many of your students were told.
 */
export async function planStudentEvent(eventId: string, going: boolean, tell = false): Promise<number> {
  if (!live) noServer();
  return Number(await rpc('student_event_plan', { p_event: eventId, p_going: going, p_tell: tell }));
}
