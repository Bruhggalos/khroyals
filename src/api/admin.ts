/** admin: internal API implementation. Screens import the connect facade. */
import type { SchoolRole } from '../comms/types';
import { run, sb, rpc } from './client';
import type { AdminPerson, AdminRole, FamilyLink, ParentRelation, PeopleFilter, PermissionInfo } from './types';
import { toPerson } from './mappers';

export async function adminUpdateProfile(userId: string, role: SchoolRole | null, grade?: number | null) {
  await rpc('admin_update_profile', { p_user: userId, p_role: role, p_grade: grade ?? null });
}

/** Link a parent (say mother or father; a child has at most one of each) or a Family account; or unlink. */
export async function adminLinkGuardian(guardianId: string, studentId: string, link = true, relation: ParentRelation | null = null) {
  await rpc('admin_link_guardian', { p_guardian: guardianId, p_student: studentId, p_link: link, p_relation: relation });
}

/** Say whether an existing parent link is the mother or the father. */
export async function adminSetParentRelation(guardianId: string, studentId: string, relation: ParentRelation) {
  await rpc('admin_set_parent_relation', { p_guardian: guardianId, p_student: studentId, p_relation: relation });
}

export async function adminSetCarlineDuty(userId: string, on: boolean) {
  await rpc('admin_set_carline_duty', { p_user: userId, p_on: on });
}

/** Every parent ↔ student link, with names (people may be on other pages of the list). */
export async function adminFamilyLinks(): Promise<FamilyLink[]> {
  const [parents, family] = await Promise.all([
    run(sb().from('guardians').select(
      'guardian_id, student_id, guardian:profiles!guardians_guardian_id_fkey(first_name, last_name), student:profiles!guardians_student_id_fkey(first_name, last_name, grade)')),
    run(sb().from('family_pickups').select(
      'guardian_id:family_id, student_id, guardian:profiles!family_pickups_family_id_fkey(first_name, last_name), student:profiles!family_pickups_student_id_fkey(first_name, last_name, grade)')),
  ]);
  const toLink = (g: (typeof parents)[number], pickupOnly: boolean): FamilyLink => ({
    guardianId: g.guardian_id, studentId: g.student_id, pickupOnly,
    guardianName: `${g.guardian?.first_name ?? ''} ${g.guardian?.last_name ?? ''}`.trim(),
    studentName: `${g.student?.first_name ?? ''} ${g.student?.last_name ?? ''}`.trim(), studentGrade: g.student?.grade ?? null,
  });
  return [...parents.map((g) => toLink(g, false)), ...family.map((g) => toLink(g, true))];
}

export async function listAudit(limit = 100) {
  return run(sb().from('audit_log').select('*, groups(name)').order('at', { ascending: false }).limit(limit));
}

export async function permissionCatalog(): Promise<PermissionInfo[]> {
  return rpc('permission_catalog') as Promise<PermissionInfo[]>;
}

/** One page of people for the admin portal, with the total number of matches. */
export async function adminListPeople(opts: { search?: string; filter?: PeopleFilter; limit?: number; offset?: number } = {}) {
  const rows = await rpc('admin_list_people', {
    p_search: opts.search?.trim() || null, p_filter: opts.filter ?? 'all', p_limit: opts.limit ?? 20, p_offset: opts.offset ?? 0,
  });
  return {
    total: rows.length ? Number(rows[0].total) : 0,
    people: rows.map((p): AdminPerson => ({ ...toPerson(p), adminTier: p.admin_tier, granted: p.permissions ?? [] })),
  };
}

export async function adminRoles(): Promise<AdminRole[]> {
  return (await run(sb().from('admin_roles').select('*').order('is_system', { ascending: false }).order('name')))
    .map((r) => ({ id: r.id, name: r.name, description: r.description, permissions: r.permissions ?? [], isSystem: r.is_system }));
}

export async function adminSaveRole(role: { id?: string | null; name: string; description: string; permissions: string[] }) {
  await rpc('admin_save_role', { p_id: role.id ?? null, p_name: role.name, p_description: role.description, p_permissions: role.permissions });
}

export async function adminDeleteRole(id: string) { await rpc('admin_delete_role', { p_id: id }); }

/** Give someone a role (not director) and extra permissions. */
export async function adminSetAccess(userId: string, roleId: string | null, permissions: string[]) {
  await rpc('admin_set_access', { p_user: userId, p_tier: roleId, p_permissions: permissions });
}

/** Add or remove a director (there must always be at least one). */
/** people.delete: permanently delete someone's account, with their posts and comments. */
export async function adminDeleteUser(userId: string) {
  await rpc('admin_delete_user', { p_user: userId });
}

export async function adminSetDirector(userId: string, director: boolean) {
  await rpc('admin_set_director', { p_user: userId, p_director: director });
}

export async function transferDirector(userId: string) {
  await rpc('transfer_director', { p_user: userId });
}
