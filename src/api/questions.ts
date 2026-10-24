import { subscribeChanges } from './realtime';
/** questions: internal API implementation. Screens import the connect facade. */
import type { QuestionMessage, QuestionTopic, SchoolQuestion } from './types';
import { live, rpc, run, sb } from './client';
import { current } from './session';
import { toQuestion, toQuestionMessage } from './mappers';

/** Questions this person can see: their own, ones assigned to them, and every question for (verified) routers. */
export async function listQuestions(): Promise<SchoolQuestion[]> {
  if (!live || !current) return [];
  return ((await run(sb().from('school_questions').select('*').order('updated_at', { ascending: false })))).map(toQuestion);
}

export async function getQuestion(id: string): Promise<{ question: SchoolQuestion | null; messages: QuestionMessage[] }> {
  const [q, m] = await Promise.all([
    run(sb().from('school_questions').select('*').eq('id', id).maybeSingle()),
    run(sb().from('school_question_messages').select('*').eq('question_id', id).order('created_at')),
  ]);
  return { question: q ? toQuestion(q) : null, messages: m.map(toQuestionMessage) };
}

export async function askSchool(topic: QuestionTopic, subject: string, body: string): Promise<SchoolQuestion> {
  return toQuestion(await rpc('ask_school', { p_topic: topic, p_subject: subject, p_body: body }));
}

export async function questionReply(id: string, body: string) { await rpc('question_reply', { p_question: id, p_body: body }); }

/** Routers: give a question to a faculty or staff member (null to unassign). */
export async function questionAssign(id: string, assigneeId: string | null) {
  await rpc('question_assign', { p_question: id, p_assignee: assigneeId });
}

export async function questionClose(id: string) { await rpc('question_close', { p_question: id }); }

export function subscribeQuestions(onChange: () => void): () => void {
  return subscribeChanges('subscribeQuestions', [{ event: '*', table: 'school_questions' }, { event: '*', table: 'school_question_messages' }], onChange);
}
