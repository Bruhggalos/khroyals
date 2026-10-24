/** classes: internal API implementation. Screens import the connect facade. */
import type { AdminSection, SectionStudent } from './types';
import { rpc } from './client';

export async function adminListSections(): Promise<AdminSection[]> {
  return ((await rpc('admin_list_sections'))).map((r) => ({
    id: r.id, name: r.name, leadId: r.lead_id, leadName: r.lead_name, students: Number(r.students),
  }));
}

export async function adminSectionStudents(id: string): Promise<SectionStudent[]> {
  return ((await rpc('admin_section_students', { p_roster: id }))).map((r) => ({
    id: r.id, firstName: r.first_name, lastName: r.last_name, grade: r.grade, hasLogin: !!r.has_login,
  }));
}

/** Add or rename a class section and set its teacher (`id` is kept; new ones get one from the name). */
export async function adminSaveSection(s: { id?: string; name: string; leadId: string | null }): Promise<string> {
  const id = s.id ?? `sec-${s.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 30)}-${Math.random().toString(36).slice(2, 6)}`;
  await rpc('admin_set_roster', { p_roster: id, p_kind: 'section', p_name: s.name, p_lead: s.leadId });
  return id;
}

export async function adminSectionMember(id: string, userId: string, add: boolean) {
  await rpc('admin_roster_member', { p_roster: id, p_user: userId, p_add: add });
}

export async function adminDeleteSection(id: string) { await rpc('admin_delete_roster', { p_roster: id }); }
