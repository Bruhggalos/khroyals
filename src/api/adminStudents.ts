/** adminStudents: internal API implementation. Screens import the connect facade. */
import { parentsSchema } from './schemas';
import { rpc } from './client';
import type { AdminFamilyRequest, AdminStudent, ParentRelation, SimilarStudent } from './types';

export async function adminListStudents(opts: { search?: string; limit?: number; offset?: number } = {}) {
  const rows = await rpc('admin_list_students', {
    p_search: opts.search?.trim() || null, p_limit: opts.limit ?? 20, p_offset: opts.offset ?? 0,
  });
  return {
    total: rows.length ? Number(rows[0].total) : 0,
    students: rows.map((r): AdminStudent => ({
      id: r.id, firstName: r.first_name, lastName: r.last_name, grade: r.grade, gradeLabel: r.grade_label, classOf: r.class_of,
      managed: r.managed, photoPath: r.photo_path, parents: parentsSchema.parse(r.parents ?? []),
    })),
  };
}

export async function adminCreateStudent(c: {
  firstName: string; lastName: string; grade: number; birthday?: string | null; guardianId?: string | null; relation?: ParentRelation | null;
  /** The office confirmed it's a different child from a likely match. */
  notDuplicate?: boolean;
}) {
  return rpc('admin_create_student', {
    p_first: c.firstName, p_last: c.lastName, p_grade: c.grade, p_birthday: c.birthday || null, p_guardian: c.guardianId ?? null,
    p_relation: c.relation ?? null, p_force: !!c.notDuplicate,
  }) as Promise<string>;
}

export async function adminUpdateStudent(id: string, c: { firstName: string; lastName: string; grade: number }) {
  await rpc('admin_update_student', { p_student: id, p_first: c.firstName, p_last: c.lastName, p_grade: c.grade });
}

export async function adminDeleteStudent(id: string) { await rpc('admin_delete_student', { p_student: id }); }

/** The office: students that look like a child about to be added (strong = needs confirming it's a different child). */
export async function adminSimilarStudents(c: { firstName: string; lastName: string; birthday?: string | null; grade?: number | null }) {
  return rpc('admin_similar_students', {
    p_first: c.firstName, p_last: c.lastName, p_birthday: c.birthday || null, p_grade: c.grade ?? null,
  }) as Promise<SimilarStudent[]>;
}

export async function adminFamilyRequests(): Promise<AdminFamilyRequest[]> {
  return rpc('admin_family_requests') as Promise<AdminFamilyRequest[]>;
}

/** Approve (optionally linking to an existing student instead of creating one) or decline. */
export async function adminDecideFamilyRequest(id: string, approve: boolean,
  opts: { existingStudentId?: string | null; note?: string; notDuplicate?: boolean } = {}) {
  await rpc('admin_decide_family_request', {
    p_request: id, p_approve: approve, p_existing: opts.existingStudentId ?? null, p_note: opts.note ?? null,
    p_force: !!opts.notDuplicate,
  });
}
