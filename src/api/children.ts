import { replacePhoto, removeStoredPhoto } from './storage';
/** children: internal API implementation. Screens import the connect facade. */
import { childrenSchema } from './schemas';
import type { Child, FamilyRequest, ParentRelation } from './types';
import { live, run, sb, rpc } from './client';
import { current } from './session';
import { avatarUrl, signAvatars } from './storage';
import { toRequest } from './mappers';

/** The signed-in person's children with their details (photo URLs signed for display). */
export async function myChildProfiles(): Promise<Child[]> {
  if (!live || !current) return [];
  const rows = childrenSchema.parse(await rpc('my_children'));
  await signAvatars(rows.map((c) => c.photoPath)).catch(() => {});
  return rows.map((c) => ({ ...c, photo: avatarUrl(c.photoPath) }));
}

export async function updateChildDetails(studentId: string, d: { birthday: string | null; bio: string; allergies: string; medicalNotes: string }) {
  await rpc('update_child_details', {
    p_student: studentId, p_birthday: d.birthday || null, p_bio: d.bio, p_allergies: d.allergies, p_medical_notes: d.medicalNotes,
  });
}

/** Upload a JPEG (base64) as a child's photo (parents and the office). */
export async function uploadChildPhoto(studentId: string, base64: string, oldPath?: string | null) {
  const path = `children/${studentId}/${Date.now()}.jpg`;
  await replacePhoto(path, base64, () => rpc('set_child_photo', { p_student: studentId, p_path: path }), oldPath);
}

export async function removeChildPhoto(studentId: string, oldPath?: string | null) {
  await rpc('set_child_photo', { p_student: studentId, p_path: null });
  await removeStoredPhoto('avatars', oldPath).catch(() => {});
}

export async function requestChild(c: { firstName: string; lastName: string; grade: number; birthday?: string | null; note?: string; relation: ParentRelation }) {
  await rpc('request_child', {
    p_first: c.firstName, p_last: c.lastName, p_grade: c.grade, p_birthday: c.birthday || null, p_note: c.note ?? null,
    p_relation: c.relation,
  });
}

export async function requestChildEdit(studentId: string, c: { firstName: string; lastName: string; grade: number; note?: string }) {
  await rpc('request_child_edit', { p_student: studentId, p_first: c.firstName, p_last: c.lastName, p_grade: c.grade, p_note: c.note ?? null });
}

export async function cancelFamilyRequest(id: string) { await rpc('cancel_family_request', { p_request: id }); }

/** This person's requests that the office hasn't answered yet. */
export async function myFamilyRequests(): Promise<FamilyRequest[]> {
  if (!live || !current) return [];
  return (await run(sb().from('family_requests').select('*').eq('requested_by', current.id).eq('status', 'pending')
    .order('created_at'))).map(toRequest);
}

export type StudentLogin = { email: string; invitedAt: string | null; hasLogin: boolean; signedInAt: string | null };

/** The child's own login, if they have one (or one is being set up). Parents and the office. */
export async function studentLoginStatus(studentId: string): Promise<StudentLogin | null> {
  return (await rpc('student_login_status', { p_student: studentId })) as StudentLogin | null;
}

/** Give a child their own login with this email (the student-login Edge Function makes it and emails them). */
export async function giveStudentLogin(studentId: string, email: string): Promise<void> {
  const { error } = await sb().functions.invoke('student-login', { body: { studentId, email } });
  if (error) {
    const body = await (error as { context?: Response }).context?.json?.().catch(() => null);
    throw new Error(body?.error ?? error.message);
  }
}

export async function removeStudentLogin(studentId: string) { await rpc('student_login_remove', { p_student: studentId }); }
