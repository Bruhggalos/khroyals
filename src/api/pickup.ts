/** pickup: internal API implementation. Screens import the connect facade. */
import type { ChildPickupPeople, Person, PickupRelationship, PickupTransfers } from './types';
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

/** Parents: approved adults to hand pickup to, by name (at least two letters). Names only. */
export async function pickupTransferPeople(query: string): Promise<{ id: string; name: string }[]> {
  if (!live || !current || query.trim().length < 2) return [];
  return rpc('pickup_transfer_people', { p_query: query.trim() }) as Promise<{ id: string; name: string }[]>;
}

/** Parents: ask someone to pick these children up on a day ("YYYY-MM-DD", default today). They accept or decline. */
export async function transferPickup(studentIds: string[], toId: string, day?: string | null): Promise<string> {
  return rpc('pickup_transfer', { p_students: studentIds, p_to: toId, p_day: day || null }) as Promise<string>;
}

/** The person asked: accept or decline every child in the ask. */
export async function answerPickupTransfer(requestId: string, accept: boolean) {
  await rpc('pickup_transfer_answer', { p_request: requestId, p_accept: accept });
}

/** A parent calls a child's handoff off, or the person asked says they can't make it. */
export async function cancelPickupTransfer(id: string) { await rpc('pickup_transfer_cancel', { p_id: id }); }

/** Handoffs from today on: your children's, and the asks made of you. */
export async function pickupTransfers(): Promise<PickupTransfers> {
  if (!live || !current) return { children: [], asked: [] };
  return rpc('my_pickup_transfers') as Promise<PickupTransfers>;
}
