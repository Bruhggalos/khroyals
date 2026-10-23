import { subscribeChanges } from './realtime';
/** volunteer: internal API implementation. Screens import the connect facade. */
import type { Opportunity, Signup, VolunteerMessage } from './types';
import { live, rpc, run, sb } from './client';
import { current } from './session';
import { toMessage, toOpportunity, toSignup } from './mappers';

/** Opportunities this person can see (open ones, plus deleted ones they were part of) and everyone's sign-ups. */
export async function listVolunteer(): Promise<{ opportunities: Opportunity[]; signups: Signup[] }> {
  if (!live || !current) return { opportunities: [], signups: [] };
  const [o, s] = await Promise.all([
    run(sb().from('volunteer_opportunities').select('*').order('starts_on').order('start_time')),
    run(sb().from('volunteer_signups').select('*').order('created_at')),
  ]);
  return { opportunities: o.map(toOpportunity), signups: s.map(toSignup) };
}

export async function getOpportunity(id: string): Promise<{ opportunity: Opportunity | null; signups: Signup[]; messages: VolunteerMessage[] }> {
  const [o, s, m] = await Promise.all([
    run(sb().from('volunteer_opportunities').select('*').eq('id', id).maybeSingle()),
    run(sb().from('volunteer_signups').select('*').eq('opportunity_id', id).order('created_at')),
    run(sb().from('volunteer_messages').select('*').eq('opportunity_id', id).order('created_at')),
  ]);
  return { opportunity: o ? toOpportunity(o) : null, signups: s.map(toSignup), messages: m.map(toMessage) };
}

export async function volunteerPost(o: {
  title: string; description: string; startsOn: string; endsOn: string | null; startTime: string | null;
  endTime: string | null; location: string | null; spots: number | null;
  /** An item request: what's needed and how many (no spots). */
  items?: { item: string; quantity: number };
}): Promise<Opportunity> {
  return toOpportunity(await rpc('volunteer_post', {
    p_title: o.title, p_description: o.description, p_starts_on: o.startsOn, p_ends_on: o.endsOn,
    p_start_time: o.startTime, p_end_time: o.endTime, p_location: o.location, p_spots: o.items ? null : o.spots,
    p_kind: o.items ? 'items' : 'help', p_item: o.items?.item ?? null, p_quantity: o.items?.quantity ?? null,
  }));
}

export async function volunteerSayYes(id: string) { await rpc('volunteer_say_yes', { p_opportunity: id }); }

/** Pledge (or change) how many of a request's items you'll bring; volunteerWithdraw takes it back. */
export async function volunteerPledge(id: string, quantity: number) { await rpc('volunteer_pledge', { p_opportunity: id, p_quantity: quantity }); }

export async function volunteerWithdraw(id: string) { await rpc('volunteer_withdraw', { p_opportunity: id }); }

/** The leader deletes it; the reason goes to every volunteer. */
export async function volunteerDelete(id: string, reason: string) { await rpc('volunteer_delete', { p_opportunity: id, p_reason: reason }); }

export async function volunteerSend(id: string, body: string) { await rpc('volunteer_send', { p_opportunity: id, p_body: body }); }

export async function adminSetVolunteerLead(userId: string, on: boolean) {
  await rpc('admin_set_volunteer_lead', { p_user: userId, p_on: on });
}

/** Live changes to opportunities, sign-ups and chats (row-level security limits them to what this person may see). */
export function subscribeVolunteer(onChange: () => void): () => void {
  return subscribeChanges('subscribeVolunteer', [{ event: '*', table: 'volunteer_opportunities' }, { event: '*', table: 'volunteer_signups' }, { event: '*', table: 'volunteer_messages' }], onChange);
}
