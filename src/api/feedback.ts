/** feedback: internal API implementation. Screens import the connect facade. */
import type { Feedback, FeedbackWorkshop } from './types';
import { live, rpc, run, sb } from './client';
import { current } from './session';
import { enumValue } from './validation';
import { PRIORITIES, STATUSES, type FeedbackKind, type FeedbackPriority, type FeedbackStatus } from '../feedback/kinds';

const noServer = () => { throw new Error('Feedback needs the school server; this build is running on demo data.'); };

/** The signed-in person's feedback, or (triage) everyone's, newest first. */
export async function listFeedback(): Promise<Feedback[]> {
  if (!live || !current) return [];
  return (await rpc('feedback_list')).map((r) => ({
    id: r.id, authorId: r.author_id, authorName: r.author_name ?? '', authorRole: r.author_role ?? null,
    kind: r.kind === 'idea' ? 'idea' : 'bug', area: r.area, title: r.title, details: r.details ?? '', device: r.device ?? '',
    status: enumValue(r.status, STATUSES.map((x) => x.key)),
    priority: r.priority ? enumValue(r.priority, PRIORITIES.map((x) => x.key)) : null,
    reply: r.reply ?? '', workshopId: r.workshop_id ?? null, workshopTitle: r.workshop_title ?? null, createdAt: r.created_at, updatedAt: r.updated_at,
  }));
}

export async function sendFeedback(f: { kind: FeedbackKind; area: string; title: string; details: string; device: string }) {
  if (!live) noServer();
  await rpc('feedback_send', { p_kind: f.kind, p_area: f.area, p_title: f.title, p_details: f.details, p_device: f.device });
}

/** Triage: status, priority, the reply the sender sees, and the workshop (null clears). */
export async function triageFeedback(id: string, t: { status: FeedbackStatus; priority: FeedbackPriority | null; reply: string; workshopId: string | null }) {
  if (!live) noServer();
  await rpc('feedback_triage', { p_id: id, p_status: t.status, p_priority: t.priority, p_reply: t.reply, p_workshop: t.workshopId });
}

/** Triage: every workshop, soonest first (undated last). */
export async function listWorkshops(): Promise<FeedbackWorkshop[]> {
  if (!live || !current) return [];
  const rows = await run(sb().from('feedback_workshops').select('*').order('held_on', { nullsFirst: false }).order('created_at'));
  return rows.map((r) => ({ id: r.id, title: r.title, description: r.description, heldOn: r.held_on, createdAt: r.created_at }));
}

export async function saveWorkshop(w: { id?: string | null; title: string; description: string; heldOn: string | null }): Promise<{ id: string }> {
  if (!live) noServer();
  return rpc('feedback_workshop_save', { p_id: w.id ?? null, p_title: w.title, p_description: w.description, p_held_on: w.heldOn }) as Promise<{ id: string }>;
}

export async function deleteWorkshop(id: string) { if (!live) noServer(); await rpc('feedback_workshop_delete', { p_id: id }); }
