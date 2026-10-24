import { subscribeChanges } from './realtime';
import { teacherThreadSchema, teacherSendSchema } from './schemas';
/** teachers: internal API implementation. Screens import the connect facade. */
import type { ClassStudent, TeacherContact, TeacherConversation, TeacherThread } from './types';
import { live, rpc, sb } from './client';
import { current } from './session';

export async function myTeachers(): Promise<TeacherContact[]> {
  if (!live || !current) return [];
  return ((await rpc('my_teachers'))).map((r) => ({
    teacherId: r.teacher_id, teacherName: r.teacher_name, classes: r.classes, threadId: r.thread_id,
    lastMessageAt: r.last_message_at, lastBody: r.last_body, unread: !!r.unread,
  }));
}

export async function teacherConversations(studentId?: string): Promise<TeacherConversation[]> {
  if (!live || !current) return [];
  return ((await rpc('teacher_conversations', { p_student: studentId ?? null }))).map((r) => ({
    id: r.id, studentId: r.student_id, studentName: r.student_name, teacherId: r.teacher_id, teacherName: r.teacher_name,
    lastMessageAt: r.last_message_at, lastBody: r.last_body, unread: !!r.unread,
  }));
}

/** For a teacher: the students in the class sections they lead. */
export async function myClassStudents(): Promise<ClassStudent[]> {
  if (!live || !current) return [];
  return ((await rpc('my_class_students'))).map((r) => ({ studentId: r.student_id, studentName: r.student_name, grade: r.grade, classes: r.classes }));
}

export async function teacherThread(id: string): Promise<TeacherThread | null> {
  return teacherThreadSchema.parse(await rpc('teacher_thread', { p_thread: id }));
}

/** The conversation between this student and teacher, if it has started. */
export async function teacherThreadFor(studentId: string, teacherId: string): Promise<string | null> {
  return ((await rpc('teacher_thread_for', { p_student: studentId, p_teacher: teacherId })) as string | null) ?? null;
}

/** Write to the other side (it starts the conversation the first time); returns the conversation's id. */
export async function teacherSend(studentId: string, teacherId: string, body: string): Promise<string> {
  return teacherSendSchema.parse(await rpc('teacher_send', { p_student: studentId, p_teacher: teacherId, p_body: body })).thread_id;
}

export async function teacherThreadRead(id: string) { await rpc('teacher_thread_read', { p_thread: id }); }

export function subscribeTeacherMessages(onChange: () => void): () => void {
  return subscribeChanges('subscribeTeacherMessages', [{ event: '*', table: 'teacher_threads' }, { event: 'INSERT', table: 'teacher_messages' }], onChange);
}
