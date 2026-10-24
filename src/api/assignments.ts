import { subscribeChanges } from './realtime';
/** assignments: internal API implementation. Screens import the connect facade. */
import type { Assignment, ChildAssignment, Section } from './types';
import { live, rpc, run, sb } from './client';
import { current } from './session';

export async function listAssignments(): Promise<Assignment[]> {
  if (!live || !current) return [];
  const [a, d, r] = await Promise.all([
    run(sb().from('assignments').select('*').order('due_on', { nullsFirst: false }).order('created_at')),
    run(sb().from('assignment_done').select('assignment_id')),
    run(sb().from('rosters').select('id, name')),
  ]);
  const done = new Set(d.map((x) => x.assignment_id));
  const names = new Map(r.map((x) => [x.id, x.name]));
  return a.map((x) => ({
    id: x.id, rosterId: x.roster_id, className: x.roster_id ? names.get(x.roster_id) ?? null : null, ownerId: x.owner_id,
    title: x.title, details: x.details, dueOn: x.due_on, createdAt: x.created_at, done: done.has(x.id),
  }));
}

/** For a parent: what their children's teachers assigned, due from `from` to `to` (YYYY-MM-DD). */
export async function childAssignments(from: string, to: string): Promise<ChildAssignment[]> {
  if (!live || !current) return [];
  return (await rpc('child_assignments', { p_from: from, p_to: to })).map((x) => ({
    id: x.id, studentId: x.student_id, rosterId: x.roster_id, className: x.class_name, title: x.title, details: x.details, dueOn: x.due_on,
  }));
}

/** With `rosterId`, a teacher assigns it to that class; without, a student adds their own. */
export async function addAssignment(a: { title: string; details: string; dueOn: string | null; rosterId: string | null }) {
  await rpc('assignment_add', { p_title: a.title, p_details: a.details, p_due_on: a.dueOn, p_roster: a.rosterId });
}

export async function deleteAssignment(id: string) { await rpc('assignment_delete', { p_assignment: id }); }

export async function checkAssignment(id: string, done: boolean) { await rpc('assignment_check', { p_assignment: id, p_done: done }); }

/** For a teacher: the class sections they lead. */
export async function mySections(): Promise<Section[]> {
  if (!live || !current) return [];
  return ((await rpc('my_sections'))).map((r) => ({ id: r.id, name: r.name, students: Number(r.students) }));
}

export function subscribeAssignments(onChange: () => void): () => void {
  return subscribeChanges('subscribeAssignments', [{ event: '*', table: 'assignments' }, { event: '*', table: 'assignment_done' }], onChange);
}
