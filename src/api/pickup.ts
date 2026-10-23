/** pickup: internal API implementation. Screens import the connect facade. */
import type { ChildPickupPeople, Person, PickupRelationship } from './types';
import { live, run, sb, rpc } from './client';
import { current, directory } from './session';

/** A child's parents (mother/father), Family links and approved pickup people (parents and staff). */
export async function childPickupPeople(studentId: string): Promise<ChildPickupPeople> {
  return rpc('child_pickup_people', { p_student: studentId }) as Promise<ChildPickupPeople>;
}

/** Parents (or the office): allow the account with this email to pick the child up (dates: "YYYY-MM-DD"; no end = until removed). */
export async function addPickupPerson(studentId: string, email: string, relationship: PickupRelationship, startsOn?: string | null, endsOn?: string | null) {
  return rpc('add_pickup_person', {
    p_student: studentId, p_email: email.trim(), p_relationship: relationship, p_starts: startsOn || null, p_ends: endsOn || null,
  }) as Promise<{ id: string; name: string; pending: boolean }>;
}

export async function removePickupPerson(id: string) { await rpc('remove_pickup_person', { p_id: id }); }

/** Children this person may pick up today: their own, Family links, and approvals that cover today. */
export async function myPickupChildren(): Promise<Person[]> {
  if (!live || !current) return [];
  const rows = await rpc('my_pickup_children');
  return rows.map((r) => directory.get(typeof r === 'string' ? r : Object.values(r)[0] as string)).filter(Boolean) as Person[];
}
