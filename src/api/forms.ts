/** forms: internal API implementation. Screens import the connect facade. */
import type { FormPayment, FormStatus, MyForm, NewForm, SentForm } from './types';
import { live, rpc } from './client';
import { current } from './session';

/** For a parent: the forms that went to their children, soonest due first. */
export async function myForms(): Promise<MyForm[]> {
  if (!live || !current) return [];
  return (await rpc('my_forms')) as unknown as MyForm[];
}

/** For a sender: the forms they sent (every form, with Send forms), newest first. */
export async function sentForms(): Promise<SentForm[]> {
  if (!live || !current) return [];
  return (await rpc('sent_forms')) as unknown as SentForm[];
}

/** For a form's sender: who it went to and who has signed; null if it isn't theirs. */
export async function formStatus(id: string): Promise<FormStatus | null> {
  if (!live || !current) return null;
  return (await rpc('form_status', { p_form: id })) as unknown as FormStatus | null;
}

/** Send a form; returns its id. The server checks who may send to whom. */
export async function sendForm(f: NewForm): Promise<string> {
  if (!live) throw new Error('Forms need the school server; this build is running on demo data.');
  const row = await rpc('form_send', {
    p_title: f.title, p_details: f.details, p_link: f.link, p_due_on: f.dueOn, p_audience: f.audience,
    p_section: f.sectionId ?? null, p_season: f.seasonId ?? null, p_grades: f.grades ?? null, p_questions: f.questions,
    p_fee_cents: f.feeCents ?? null,
  });
  return row.id;
}

/** A parent signs for one child: agree (with the answers) or decline, with their typed full name. */
export async function signForm(formId: string, studentId: string, agree: boolean, answers: Record<string, string>, signature: string) {
  await rpc('form_sign', { p_form: formId, p_student: studentId, p_agree: agree, p_answers: answers, p_signature: signature });
}

/** Remind the parents still to sign; returns how many were told. */
export async function remindForm(id: string): Promise<number> { return rpc('form_remind', { p_form: id }); }

export async function closeForm(id: string) { await rpc('form_close', { p_form: id }); }

/** The sender records (or corrects) a child's payment; the parents are told the first time. */
export async function recordPayment(formId: string, studentId: string, p: Omit<FormPayment, 'recordedBy'>) {
  await rpc('form_record_payment', {
    p_form: formId, p_student: studentId, p_amount_cents: p.amountCents, p_method: p.method,
    p_delivered_to: p.deliveredTo, p_received_on: p.receivedOn, p_note: p.note ?? '',
  });
}

/** Remove a payment recorded by mistake. */
export async function clearPayment(formId: string, studentId: string) { await rpc('form_clear_payment', { p_form: formId, p_student: studentId }); }
