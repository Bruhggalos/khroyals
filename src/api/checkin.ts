/**
 * checkin: internal API implementation for checking children in and out. Screens import the connect facade.
 * School (the office, checkin.manage): late arrivals and early check-outs. Events (teachers, coaches):
 * check-out lists where each child goes only to someone on their pickup list. The database checks both.
 */
import type { CheckinStudent, CheckoutList, CheckoutListSummary, CheckoutPerson, SchoolCheck } from './types';
import { live, rpc } from './client';

const noServer = () => { throw new Error('Check-in and check-out need the school server; this build is running on demo data.'); };

/** Office: students by name (everyone when empty), with where they stand today. */
export async function checkinStudents(query: string): Promise<CheckinStudent[]> {
  if (!live) return [];
  return (await rpc('checkin_students', { p_query: query })) as CheckinStudent[];
}

/** Office: today's check-ins and check-outs, newest first. */
export async function checkinToday(): Promise<SchoolCheck[]> {
  if (!live) return [];
  return (await rpc('checkin_today')) as SchoolCheck[];
}

/** Office: check a student in (arriving late) or out (leaving early, with someone on their pickup list). */
export async function schoolCheck(c: { studentId: string; kind: 'in' | 'out'; personId?: string | null; reason: string; note?: string }) {
  if (!live) noServer();
  await rpc('school_check', { p_student: c.studentId, p_kind: c.kind, p_person: c.personId ?? null, p_reason: c.reason, p_note: c.note ?? '' });
}

export async function undoSchoolCheck(id: string) { if (!live) noServer(); await rpc('school_check_undo', { p_id: id }); }

/** Who a child may go home with today (their pickup list), for the office or someone checking them out. */
export async function checkoutPeople(studentId: string): Promise<CheckoutPerson[]> {
  if (!live) return [];
  return (await rpc('checkout_people', { p_student: studentId })) as CheckoutPerson[];
}

/** The check-out lists the signed-in teacher or coach runs, from a week back on. */
export async function myCheckoutLists(): Promise<CheckoutListSummary[]> {
  if (!live) return [];
  return (await rpc('checkout_my_lists')) as CheckoutListSummary[];
}

export async function checkoutList(id: string): Promise<CheckoutList> {
  if (!live) noServer();
  return (await rpc('checkout_list', { p_id: id })) as CheckoutList;
}

/** Activities events the signed-in coach or director runs, today through two weeks out. */
export async function checkoutEventOptions(): Promise<{ id: string; title: string; startsAt: string; listId: string | null }[]> {
  if (!live) return [];
  return (await rpc('checkout_event_options')) as { id: string; title: string; startsAt: string; listId: string | null }[];
}

/** Students in the sections the signed-in teacher leads, for a field trip or class event list. */
export async function checkoutMyStudents(): Promise<{ id: string; name: string; grade: number | null; sections: string }[]> {
  if (!live) return [];
  return (await rpc('checkout_my_students')) as { id: string; name: string; grade: number | null; sections: string }[];
}

export async function saveCheckoutList(l: { title: string; day: string; studentIds: string[] }): Promise<string> {
  if (!live) noServer();
  return (await rpc('checkout_list_save', { p_title: l.title, p_day: l.day, p_students: l.studentIds })) as string;
}

/** An Activities event's list (made the first time), with every registered student. */
export async function checkoutListForEvent(eventId: string): Promise<string> {
  if (!live) noServer();
  return (await rpc('checkout_list_for_event', { p_event: eventId })) as string;
}

export async function deleteCheckoutList(id: string) { if (!live) noServer(); await rpc('checkout_list_delete', { p_id: id }); }

/** Release a child to someone on their pickup list (their parents are told). */
export async function releaseStudent(listId: string, studentId: string, personId: string) {
  if (!live) noServer();
  await rpc('checkout_release', { p_list: listId, p_student: studentId, p_person: personId });
}

export async function unreleaseStudent(listId: string, studentId: string) {
  if (!live) noServer();
  await rpc('checkout_unrelease', { p_list: listId, p_student: studentId });
}
