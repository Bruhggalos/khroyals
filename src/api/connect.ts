/**
 * Royals Connect API used by every Connect, calendar and admin screen.
 *
 * With Supabase configured (src/api/supabase.ts) everything is live: sign-in,
 * groups, posts, realtime updates, group calendars and the admin console, with
 * permissions enforced by the database. Without it, the same calls run against
 * the bundled demo data (src/api/mockApi.ts) and a "viewing as" switcher.
 */
import { Platform } from 'react-native';
import * as Linking from 'expo-linking';
import type { RealtimeChannel } from '@supabase/supabase-js';
import appJson from '../../app.json';
import * as mock from './mockApi';
import { supabase } from './supabase';
import type { Decision } from '../comms/permissions';
import type { Comment, Group, GroupRole, GroupSettings, Post, SchoolRole, User } from '../comms/types';

export const live = supabase !== null;

export type Abilities = {
  post: Decision; askQuestion: Decision; comment: Decision; react: Decision;
  createPolls: Decision; attachFiles: Decision; pin: Decision;
  moderate: boolean; editSettings: boolean; createEvents: boolean;
};
export type GroupView = { group: Group; myRole: GroupRole | null; posts: Post[]; abilities: Abilities };
export type Person = User & { email?: string | null; pending?: boolean; carlineDuty?: boolean; volunteerLead?: boolean };
export type GroupEvent = {
  id: string; groupId: string | null; groupName?: string; groupIcon?: string;
  title: string; description?: string | null; date: string; endDate: string | null;
  startTime?: string | null; endTime?: string | null; allDay: boolean; location?: string | null; category: string;
};
export type NewEvent = Omit<GroupEvent, 'id' | 'groupName' | 'groupIcon'>;
export type Member = { userId: string; role: GroupRole; source: string; mutedUntil: string | null; canPost: boolean };

// ---------------------------------------------------------------- helpers

const sb = () => supabase!;
async function run<T>(p: PromiseLike<{ data: T; error: { message: string } | null }>): Promise<NonNullable<T>> {
  const { data, error } = await p;
  if (error) throw new Error(error.message);
  return data as NonNullable<T>;
}

const directory = new Map<string, Person>();

// Profile photos: the bucket is private, so storage paths become signed URLs.
const avatarSigned = new Map<string, { url: string; until: number }>();
const avatarUrl = (path: string | null | undefined) => (!path ? '' : /^https?:/.test(path) ? path : avatarSigned.get(path)?.url ?? '');
async function signAvatars(paths: (string | null | undefined)[]) {
  const need = [...new Set(paths.filter((x): x is string =>
    !!x && !/^https?:/.test(x) && (avatarSigned.get(x)?.until ?? 0) < Date.now()))];
  if (!need.length) return;
  const { data } = await sb().storage.from('avatars').createSignedUrls(need, 24 * 3600);
  for (const d of data ?? []) if (d.path && d.signedUrl) avatarSigned.set(d.path, { url: d.signedUrl, until: Date.now() + 20 * 3600_000 });
}
let current: Person | null = null;

const toPerson = (p: any): Person => ({
  id: p.id, firstName: p.first_name ?? '', lastName: p.last_name ?? '', schoolRole: p.school_role as SchoolRole,
  avatar: avatarUrl(p.avatar_url), grade: p.grade ?? undefined,
  email: p.email, pending: p.school_role == null, carlineDuty: !!p.carline_duty, volunteerLead: !!p.volunteer_lead,
});

const toGroup = (g: any): Group => ({
  id: g.id, name: g.name, description: g.description, icon: g.icon, color: g.color, category: g.category,
  createdBy: g.created_by, createdAt: g.created_at, settings: g.settings, assignmentRules: [],
  parentGroupId: g.parent_group_id, tags: g.tags ?? [],
});

const toPost = (p: any): Post & { anonymous?: boolean } => {
  const reactions: Record<string, string[]> = {};
  for (const r of p.reactions ?? []) (reactions[r.emoji] ??= []).push(r.user_id);
  const options = [...(p.poll_options ?? [])].sort((a, b) => a.position - b.position);
  return {
    id: p.id, groupId: p.group_id, authorId: p.author_id, kind: p.kind, title: p.title ?? undefined, body: p.body,
    attachments: p.attachments ?? [], status: p.status, pinned: p.pinned, commentsLocked: p.comments_locked,
    score: p.score, reactions, createdAt: p.created_at, editedAt: p.edited_at,
    poll: options.length ? { question: p.title ?? '', options: options.map((o) => ({ id: o.id, label: o.label, votes: (o.poll_votes ?? []).map((v: any) => v.user_id) })) } : undefined,
    anonymous: p.author_id == null && p.kind === 'question',
  };
};

const toComment = (c: any): Comment => ({
  id: c.id, postId: c.post_id, parentCommentId: c.parent_comment_id, authorId: c.author_id, body: c.body,
  status: c.status, isAnswer: c.is_answer, score: c.score, createdAt: c.created_at,
});

const toEvent = (e: any): GroupEvent => ({
  id: e.id, groupId: e.group_id, groupName: e.groups?.name, groupIcon: e.groups?.icon, title: e.title,
  description: e.description, date: e.starts_on, endDate: e.ends_on, startTime: e.start_time?.slice(0, 5) ?? null,
  endTime: e.end_time?.slice(0, 5) ?? null, allDay: e.all_day, location: e.location, category: e.category,
});

// ---------------------------------------------------------------- session

/** Signed-in person (null = signed out). Loads the directory for author names. */
export async function session(): Promise<Person | null> {
  if (!live) return mock.me();
  const { data } = await sb().auth.getSession();
  const uid = data.session?.user.id;
  if (!uid) { current = null; return null; }
  const people = await run(sb().from('profiles').select('*'));
  await signAvatars(people.map((p: any) => p.avatar_url)).catch(() => {});
  directory.clear();
  people.forEach((p: any) => directory.set(p.id, toPerson(p)));
  current = directory.get(uid) ?? toPerson({ id: uid });
  current.email = data.session?.user.email;
  return current;
}

export const me = (): Person | null => (live ? current : mock.me());
export const getUser = (id: string): Person | undefined => (live ? directory.get(id) : mock.getUser(id));
export const listUsers = async (): Promise<Person[]> => (live ? [...directory.values()] : mock.listUsers());

export async function signOut() { if (live) await sb().auth.signOut(); current = null; }
export const onAuthChange = (cb: () => void) => {
  if (!live) return () => {};
  const { data } = sb().auth.onAuthStateChange(() => cb());
  return () => data.subscription.unsubscribe();
};
/** Demo-data mode only: view the app as another person. */
export const setMockUser = mock.setCurrentUser;

// ---------------------------------------------------------------- groups

export async function listMyGroups(): Promise<Group[]> {
  if (!live) return mock.listMyGroups();
  return (await run(sb().rpc('my_groups'))).map(toGroup);
}

/** Groups the person can discover but hasn't joined (open/school-visible). */
export async function listDiscoverableGroups(): Promise<Group[]> {
  if (!live) return [];
  const mine = new Set((await listMyGroups()).map((g) => g.id));
  return (await run(sb().from('groups').select('*').order('name'))).map(toGroup).filter((g) => !mine.has(g.id));
}

export async function getGroup(id: string): Promise<GroupView> {
  if (!live) {
    const d = await mock.getGroup(id);
    return { group: d.group, myRole: d.myRole, posts: d.posts, abilities: d.abilities as Abilities };
  }
  const [g, abilities, posts] = await Promise.all([
    run(sb().from('groups').select('*').eq('id', id).single()),
    run(sb().rpc('group_abilities', { p_group: id })),
    run(sb().from('posts').select('*, reactions(emoji, user_id), poll_options(id, label, position, poll_votes(user_id))')
      .eq('group_id', id).neq('status', 'removed').order('pinned', { ascending: false }).order('created_at', { ascending: false }).limit(100)),
  ]);
  const { role, ...rest } = abilities as any;
  return { group: toGroup(g), myRole: role, posts: (posts as any[]).map(toPost), abilities: rest };
}

export async function getComments(postId: string): Promise<Comment[]> {
  if (!live) return mock.getComments(postId);
  return (await run(sb().from('comments').select('*').eq('post_id', postId).neq('status', 'removed').order('created_at'))).map(toComment);
}

export async function createPost(groupId: string, input: { kind: Post['kind']; body: string; title?: string; anonymous?: boolean; pollOptions?: string[] }) {
  if (!live) return mock.createPost(groupId, input);
  return toPost(await run(sb().rpc('create_post', {
    p_group: groupId, p_kind: input.kind, p_body: input.body, p_title: input.title ?? null,
    p_anonymous: !!input.anonymous, p_poll_options: input.pollOptions?.length ? input.pollOptions : null,
  })));
}

export async function addComment(postId: string, body: string) {
  if (!live) return mock.addComment(postId, body);
  return toComment(await run(sb().rpc('add_comment', { p_post: postId, p_body: body })));
}

export async function moderatePost(postId: string, action: 'approve' | 'reject' | 'remove' | 'pin' | 'lockComments') {
  if (!live) return mock.moderatePost(postId, action);
  await run(sb().rpc('moderate_post', { p_post: postId, p_action: action }));
}

export async function toggleReaction(postId: string, emoji: string) {
  if (!live) return;
  await run(sb().rpc('toggle_reaction', { p_post: postId, p_emoji: emoji }));
}

export async function votePoll(optionId: string) {
  if (!live) return;
  await run(sb().rpc('vote_poll', { p_option: optionId }));
}

export async function updateGroupSettings(groupId: string, patch: Partial<GroupSettings>) {
  if (!live) return mock.updateGroupSettings(groupId, patch);
  await run(sb().rpc('update_group_settings', { p_group: groupId, p_patch: patch }));
}

export async function createGroup(g: Omit<Group, 'id' | 'createdAt' | 'createdBy'>): Promise<{ id: string }> {
  if (!live) return mock.createGroup(g);
  return run(sb().rpc('create_group', {
    p_name: g.name, p_description: g.description, p_icon: g.icon, p_color: g.color, p_category: g.category,
    p_settings: g.settings, p_rules: g.assignmentRules, p_parent: g.parentGroupId ?? null,
  }));
}

export async function joinGroup(groupId: string) { await run(sb().rpc('join_group', { p_group: groupId })); }
export async function leaveGroup(groupId: string) { await run(sb().rpc('leave_group', { p_group: groupId })); }

export async function listMembers(groupId: string): Promise<Member[]> {
  if (!live) return [];
  return (await run(sb().from('memberships').select('*').eq('group_id', groupId))).map((m: any) => ({
    userId: m.user_id, role: m.role, source: m.source, mutedUntil: m.muted_until, canPost: m.can_post,
  }));
}

export async function setMembership(groupId: string, userId: string, change: { role?: GroupRole; mutedUntil?: string | null; canPost?: boolean; remove?: boolean }) {
  await run(sb().rpc('set_membership', {
    p_group: groupId, p_user: userId, p_role: change.role ?? null,
    p_muted_until: change.mutedUntil === null ? '-infinity' : change.mutedUntil ?? null,
    p_can_post: change.canPost ?? null, p_remove: !!change.remove,
  }));
}

/** Live updates for one group: calls back whenever posts, replies or reactions change. */
export function subscribeGroup(groupId: string, onChange: () => void): () => void {
  if (!live) return () => {};
  const ch: RealtimeChannel = sb().channel(`group:${groupId}`)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'posts', filter: `group_id=eq.${groupId}` }, onChange)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'comments' }, onChange)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'reactions' }, onChange)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'poll_votes' }, onChange)
    .subscribe();
  return () => { sb().removeChannel(ch); };
}

// ---------------------------------------------------------------- calendar

/** School calendar plus the calendars of every group the person can see. */
export async function listEvents(): Promise<GroupEvent[]> {
  return (await run(sb().from('events').select('*, groups(name, icon)').order('starts_on'))).map(toEvent);
}

export async function createEvent(e: NewEvent) {
  await run(sb().from('events').insert({
    group_id: e.groupId, title: e.title, description: e.description ?? null, starts_on: e.date, ends_on: e.endDate,
    start_time: e.startTime || null, end_time: e.endTime || null, all_day: !e.startTime, location: e.location || null,
    category: e.category, created_by: current?.id,
  }));
}

export async function deleteEvent(id: string) { await run(sb().from('events').delete().eq('id', id)); }

// ---------------------------------------------------------------- car line

export type Pickup = {
  id: string; studentId: string; guardianId: string | null; status: 'waiting' | 'picked_up' | 'cancelled';
  arrivedAt: string; pickedUpAt: string | null; pickedUpBy: string | null;
  /** 'arrival' = checked in automatically when the parent's phone reached the car line. */
  via: 'app' | 'arrival';
};
const toPickup = (r: any): Pickup => ({
  id: r.id, studentId: r.student_id, guardianId: r.guardian_id, status: r.status,
  arrivedAt: r.arrived_at, pickedUpAt: r.picked_up_at, pickedUpBy: r.picked_up_by, via: r.via ?? 'app',
});
export type CarlineConfig = { latitude: number; longitude: number; radius: number; start: string; end: string };
export type Arrival =
  | { state: 'open'; checkedIn: string[]; names: string[] }
  | { state: 'early'; opensAt: string }
  | { state: 'closed' };

/** Staff the office has put on car line duty (the database checks the same rule). */
export const onCarlineDuty = (p: Person | null) => !!p?.carlineDuty && ['admin', 'teacher', 'staff'].includes(p.schoolRole);

/** Students linked to the signed-in parent, from the directory loaded by session(). */
export async function myChildren(): Promise<Person[]> {
  if (!live || !current) return [];
  const links = await run(sb().from('guardians').select('student_id').eq('guardian_id', current.id));
  return (links as any[]).map((l) => directory.get(l.student_id)).filter(Boolean) as Person[];
}
/** Today's car line: your children's check-ins, or everyone's for staff on duty. */
export async function carlineToday(): Promise<Pickup[]> {
  if (!live || !current) return [];
  return (await run(sb().rpc('carline_today'))).map(toPickup);
}
export async function carlineCheckIn(studentIds: string[]) {
  await run(sb().rpc('carline_check_in', { p_students: studentIds }));
}
export async function carlineCancel(pickupId: string) { await run(sb().rpc('carline_cancel', { p_pickup: pickupId })); }
export async function carlineConfirm(pickupId: string) { await run(sb().rpc('carline_confirm', { p_pickup: pickupId })); }
export async function carlineReopen(pickupId: string) { await run(sb().rpc('carline_reopen', { p_pickup: pickupId })); }
/** Where and when automatic check-in runs. */
export async function carlineConfig(): Promise<CarlineConfig> { return run(sb().rpc('carline_config')) as Promise<CarlineConfig>; }
/** The phone reached the car line: the server checks in the children if the line is open. */
export async function carlineArrived(): Promise<Arrival> { return run(sb().rpc('carline_arrived')) as Promise<Arrival>; }

/** Live car line changes (row-level security limits them to what this person may see). */
export function subscribeCarline(onChange: () => void): () => void {
  if (!live) return () => {};
  const ch: RealtimeChannel = sb().channel('carline')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'carline_pickups' }, onChange)
    .subscribe();
  return () => { sb().removeChannel(ch); };
}

// ---------------------------------------------------------------- marketplace

export type Condition = 'new' | 'like_new' | 'good' | 'fair';
export type Listing = {
  id: string; sellerId: string; title: string; description: string; priceCents: number; quantity: number;
  condition: Condition; photoPath: string | null; status: 'open' | 'pending' | 'sold' | 'removed';
  buyerId: string | null; saleCents: number | null; createdAt: string;
};
/** One buyer's place in line: a Dibs, or an Offer and the seller's counter. */
export type MarketLine = {
  id: string; listingId: string; buyerId: string; kind: 'dibs' | 'offer'; offerCents: number | null;
  counterCents: number | null; message: string | null; agreedCents: number | null; createdAt: string;
  status: 'agreed' | 'offered' | 'countered' | 'declined' | 'withdrawn' | 'selected';
};
export type MarketTerms = { version: number; text: string; accepted: boolean; eligible: boolean };
const toListing = (r: any): Listing => ({
  id: r.id, sellerId: r.seller_id, title: r.title, description: r.description, priceCents: r.price_cents,
  quantity: r.quantity, condition: r.condition, photoPath: r.photo_path, status: r.status, buyerId: r.buyer_id,
  saleCents: r.sale_cents, createdAt: r.created_at,
});
const toLine = (r: any): MarketLine => ({
  id: r.id, listingId: r.listing_id, buyerId: r.buyer_id, kind: r.kind, offerCents: r.offer_cents,
  counterCents: r.counter_cents, message: r.message, agreedCents: r.agreed_cents, createdAt: r.created_at, status: r.status,
});
const rpc = (fn: string, args: Record<string, unknown> = {}) => run(sb().rpc(fn, args));

export async function marketTerms(): Promise<MarketTerms> { return rpc('market_terms') as Promise<MarketTerms>; }
export async function acceptMarketTerms(version: number) { await rpc('market_accept_terms', { p_version: version }); }

/** Posts this person can see (open ones, plus their own and ones they're buying), newest first, and the lines they can see. */
export async function listMarket(): Promise<{ listings: Listing[]; lines: MarketLine[] }> {
  if (!live || !current) return { listings: [], lines: [] };
  const [l, r] = await Promise.all([
    run(sb().from('market_listings').select('*').neq('status', 'removed').order('created_at', { ascending: false })),
    run(sb().from('market_responses').select('*').order('created_at')),
  ]);
  return { listings: (l as any[]).map(toListing), lines: (r as any[]).map(toLine) };
}
export async function getListing(id: string): Promise<{ listing: Listing | null; lines: MarketLine[] }> {
  const [l, r] = await Promise.all([
    run(sb().from('market_listings').select('*').eq('id', id).maybeSingle()),
    run(sb().from('market_responses').select('*').eq('listing_id', id).order('created_at')),
  ]);
  return { listing: l ? toListing(l) : null, lines: (r as any[]).map(toLine) };
}

const photoUrls = new Map<string, { url: string; until: number }>();
/** Signed URLs for marketplace photos (the bucket is private), cached for most of their hour. */
export async function marketPhotoUrls(paths: string[]): Promise<Record<string, string>> {
  const need = [...new Set(paths)].filter((p) => (photoUrls.get(p)?.until ?? 0) < Date.now());
  if (need.length) {
    const { data } = await sb().storage.from('marketplace').createSignedUrls(need, 3600);
    for (const d of data ?? []) if (d.path && d.signedUrl) photoUrls.set(d.path, { url: d.signedUrl, until: Date.now() + 50 * 60_000 });
  }
  return Object.fromEntries(paths.flatMap((p) => (photoUrls.has(p) ? [[p, photoUrls.get(p)!.url]] : [])));
}
/** Upload a JPEG (base64) into the seller's own folder; returns its path for marketPost. */
export async function uploadMarketPhoto(base64: string): Promise<string> {
  const path = `${current!.id}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.jpg`;
  const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
  await run(sb().storage.from('marketplace').upload(path, bytes.buffer, { contentType: 'image/jpeg' }) as any);
  return path;
}

export async function marketPost(p: {
  title: string; description: string; priceCents: number; quantity: number; condition: Condition; photoPath: string | null;
}): Promise<Listing> {
  return toListing(await rpc('market_post', {
    p_title: p.title, p_description: p.description, p_price_cents: p.priceCents, p_quantity: p.quantity,
    p_condition: p.condition, p_photo_path: p.photoPath,
  }));
}
export async function marketRemove(id: string, reason?: string) { await rpc('market_remove', { p_listing: id, p_reason: reason ?? null }); }
export async function marketDibs(id: string) { await rpc('market_dibs', { p_listing: id }); }
export async function marketOffer(id: string, cents: number, message: string) {
  await rpc('market_offer', { p_listing: id, p_cents: cents, p_message: message });
}
/** Seller: accept an offer, or counter it with another price. */
export async function marketAnswerOffer(lineId: string, accept: boolean, counterCents?: number) {
  await rpc('market_answer_offer', { p_response: lineId, p_accept: accept, p_counter_cents: counterCents ?? null });
}
/** Buyer: accept or decline the seller's counter. */
export async function marketAnswerCounter(lineId: string, accept: boolean) {
  await rpc('market_answer_counter', { p_response: lineId, p_accept: accept });
}
export async function marketWithdraw(lineId: string) { await rpc('market_withdraw', { p_response: lineId }); }
/** Seller: confirm this buyer; the sale is pending until the handoff. */
export async function marketSelect(lineId: string) { await rpc('market_select', { p_response: lineId }); }
export async function marketComplete(id: string) { await rpc('market_complete', { p_listing: id }); }
export async function marketCancelSale(id: string) { await rpc('market_cancel_sale', { p_listing: id }); }

/** Live marketplace changes (row-level security limits them to what this person may see). */
export function subscribeMarket(onChange: () => void): () => void {
  if (!live) return () => {};
  const ch: RealtimeChannel = sb().channel(`market-${Math.random().toString(36).slice(2)}`)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'market_listings' }, onChange)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'market_responses' }, onChange)
    .subscribe();
  return () => { sb().removeChannel(ch); };
}

// ---------------------------------------------------------------- volunteers

export type Opportunity = {
  id: string; leadId: string; title: string; description: string; startsOn: string; endsOn: string | null;
  startTime: string | null; endTime: string | null; location: string | null; spots: number | null;
  status: 'open' | 'deleted'; deleteReason: string | null; createdAt: string;
};
export type Signup = { opportunityId: string; userId: string; createdAt: string };
export type VolunteerMessage = { id: string; opportunityId: string; authorId: string | null; body: string; createdAt: string };
const toOpportunity = (r: any): Opportunity => ({
  id: r.id, leadId: r.lead_id, title: r.title, description: r.description, startsOn: r.starts_on, endsOn: r.ends_on,
  startTime: r.start_time?.slice(0, 5) ?? null, endTime: r.end_time?.slice(0, 5) ?? null, location: r.location,
  spots: r.spots, status: r.status, deleteReason: r.delete_reason, createdAt: r.created_at,
});
const toSignup = (r: any): Signup => ({ opportunityId: r.opportunity_id, userId: r.user_id, createdAt: r.created_at });
const toMessage = (r: any): VolunteerMessage => ({ id: r.id, opportunityId: r.opportunity_id, authorId: r.author_id, body: r.body, createdAt: r.created_at });

/** Parents and staff volunteer; the office picks Volunteer Leaders (the database checks the same). */
export const canVolunteer = (p: Person | null) => !!p && !p.pending && ['parent', 'teacher', 'staff', 'admin'].includes(p.schoolRole);
export const isVolunteerLead = (p: Person | null) => canVolunteer(p) && !!p?.volunteerLead;

/** Opportunities this person can see (open ones, plus deleted ones they were part of) and everyone's sign-ups. */
export async function listVolunteer(): Promise<{ opportunities: Opportunity[]; signups: Signup[] }> {
  if (!live || !current) return { opportunities: [], signups: [] };
  const [o, s] = await Promise.all([
    run(sb().from('volunteer_opportunities').select('*').order('starts_on').order('start_time')),
    run(sb().from('volunteer_signups').select('*').order('created_at')),
  ]);
  return { opportunities: (o as any[]).map(toOpportunity), signups: (s as any[]).map(toSignup) };
}
export async function getOpportunity(id: string): Promise<{ opportunity: Opportunity | null; signups: Signup[]; messages: VolunteerMessage[] }> {
  const [o, s, m] = await Promise.all([
    run(sb().from('volunteer_opportunities').select('*').eq('id', id).maybeSingle()),
    run(sb().from('volunteer_signups').select('*').eq('opportunity_id', id).order('created_at')),
    run(sb().from('volunteer_messages').select('*').eq('opportunity_id', id).order('created_at')),
  ]);
  return { opportunity: o ? toOpportunity(o) : null, signups: (s as any[]).map(toSignup), messages: (m as any[]).map(toMessage) };
}
export async function volunteerPost(o: {
  title: string; description: string; startsOn: string; endsOn: string | null; startTime: string | null;
  endTime: string | null; location: string | null; spots: number | null;
}): Promise<Opportunity> {
  return toOpportunity(await rpc('volunteer_post', {
    p_title: o.title, p_description: o.description, p_starts_on: o.startsOn, p_ends_on: o.endsOn,
    p_start_time: o.startTime, p_end_time: o.endTime, p_location: o.location, p_spots: o.spots,
  }));
}
export async function volunteerSayYes(id: string) { await rpc('volunteer_say_yes', { p_opportunity: id }); }
export async function volunteerWithdraw(id: string) { await rpc('volunteer_withdraw', { p_opportunity: id }); }
/** The leader deletes it; the reason goes to every volunteer. */
export async function volunteerDelete(id: string, reason: string) { await rpc('volunteer_delete', { p_opportunity: id, p_reason: reason }); }
export async function volunteerSend(id: string, body: string) { await rpc('volunteer_send', { p_opportunity: id, p_body: body }); }
export async function adminSetVolunteerLead(userId: string, on: boolean) {
  await rpc('admin_set_volunteer_lead', { p_user: userId, p_on: on });
}

/** Live changes to opportunities, sign-ups and chats (row-level security limits them to what this person may see). */
export function subscribeVolunteer(onChange: () => void): () => void {
  if (!live) return () => {};
  const ch: RealtimeChannel = sb().channel(`volunteer-${Math.random().toString(36).slice(2)}`)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'volunteer_opportunities' }, onChange)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'volunteer_signups' }, onChange)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'volunteer_messages' }, onChange)
    .subscribe();
  return () => { sb().removeChannel(ch); };
}

// ---------------------------------------------------------------- admin

export async function adminUpdateProfile(userId: string, role: SchoolRole | null, grade?: number | null) {
  await run(sb().rpc('admin_update_profile', { p_user: userId, p_role: role, p_grade: grade ?? null }));
}
export async function adminLinkGuardian(guardianId: string, studentId: string, link = true) {
  await run(sb().rpc('admin_link_guardian', { p_guardian: guardianId, p_student: studentId, p_link: link }));
}
export async function adminSetCarlineDuty(userId: string, on: boolean) {
  await run(sb().rpc('admin_set_carline_duty', { p_user: userId, p_on: on }));
}
export type FamilyLink = { guardianId: string; studentId: string; guardianName: string; studentName: string; studentGrade: number | null };
/** Every parent ↔ student link, with names (people may be on other pages of the list). */
export async function adminFamilyLinks(): Promise<FamilyLink[]> {
  const rows: any[] = await run(sb().from('guardians').select(
    'guardian_id, student_id, guardian:profiles!guardians_guardian_id_fkey(first_name, last_name), student:profiles!guardians_student_id_fkey(first_name, last_name, grade)'));
  return rows.map((g) => ({
    guardianId: g.guardian_id, studentId: g.student_id,
    guardianName: `${g.guardian?.first_name ?? ''} ${g.guardian?.last_name ?? ''}`.trim(),
    studentName: `${g.student?.first_name ?? ''} ${g.student?.last_name ?? ''}`.trim(), studentGrade: g.student?.grade ?? null,
  }));
}
export async function listAudit(limit = 100) {
  return run(sb().from('audit_log').select('*, groups(name)').order('at', { ascending: false }).limit(limit)) as Promise<any[]>;
}

/** Calendars the person may add events to: the school calendar (admins) and groups they moderate. */
export async function editableCalendars(): Promise<{ groupId: string | null; name: string }[]> {
  const p = current;
  if (!live || !p) return [];
  const groups = await listMyGroups();
  if (p.schoolRole === 'admin') return [{ groupId: null, name: 'School calendar' }, ...groups.map((g) => ({ groupId: g.id, name: g.name }))];
  const mine = await run(sb().from('memberships').select('group_id, role').eq('user_id', p.id).in('role', ['owner', 'moderator']));
  const ids = new Set((mine as any[]).map((m) => m.group_id));
  return groups.filter((g) => ids.has(g.id)).map((g) => ({ groupId: g.id, name: g.name }));
}

// ---------------------------------------------------------------- email codes + authenticator app (MFA)

/** Email a 6-digit sign-in code (creates the account on first use; admins approve new people). */
export class NoAccountError extends Error {}

/**
 * Email a one-time sign-in code. Signing in (`create` false) refuses unknown
 * emails with NoAccountError so the app can offer sign-up instead; signing up
 * (`create` true) creates the account (awaiting admin approval) and emails the
 * code to confirm the address.
 */
export async function sendEmailCode(email: string, opts: { create: boolean; firstName?: string; lastName?: string }) {
  const { error } = await sb().auth.signInWithOtp({
    email: email.trim().toLowerCase(),
    options: {
      shouldCreateUser: opts.create,
      emailRedirectTo: authRedirectUrl(),
      data: opts.create ? { first_name: opts.firstName?.trim() ?? '', last_name: opts.lastName?.trim() ?? '' } : undefined,
    },
  });
  if (!error) return;
  if (!opts.create && /signups? not allowed|user not found/i.test(error.message)) throw new NoAccountError('No account uses this email yet.');
  if (/rate limit|too many/i.test(error.message)) throw new Error('Too many codes were sent recently. Wait a few minutes and try again.');
  throw new Error(error.message);
}

/** Where sign-in links return to: this web page, or the app's khroyals://auth link. */
export function authRedirectUrl() {
  const base = ((appJson as any).expo?.experiments?.baseUrl ?? '').replace(/\/$/, '');
  return Platform.OS === 'web' && typeof window !== 'undefined' ? `${window.location.origin}${base}/auth` : Linking.createURL('auth');
}

/**
 * Finish signing in from an emailed link (tokens in the URL fragment or query),
 * for emails that carry a button rather than a code. Returns whether it did.
 */
export async function completeSignInFromUrl(url: string | null): Promise<boolean> {
  if (!live || !url || !/access_token|refresh_token|[?&]code=|error_description/.test(url)) return false;
  const params = new URLSearchParams((url.split('#')[1] ?? '') + '&' + (url.split('?')[1]?.split('#')[0] ?? ''));
  const err = params.get('error_description');
  if (err) throw new Error(err.replace(/\+/g, ' '));
  const access = params.get('access_token'), refresh = params.get('refresh_token'), code = params.get('code');
  if (access && refresh) await run(sb().auth.setSession({ access_token: access, refresh_token: refresh }) as any);
  else if (code) await run(sb().auth.exchangeCodeForSession(code) as any);
  else return false;
  await session();
  return true;
}
/** Check the emailed one-time code and sign in. */
export async function verifyEmailCode(email: string, code: string) {
  const { error } = await sb().auth.verifyOtp({ email: email.trim().toLowerCase(), token: code.replace(/\D/g, ''), type: 'email' });
  if (error) throw new Error(/expired|invalid/i.test(error.message) ? 'That code is wrong or has expired. Check the latest email, or send a new code.' : error.message);
  return session();
}

export type Access = { tier: string | null; roleName: string | null; isDirector: boolean; granted: string[]; permissions: string[]; mfaRequired: boolean; mfaVerified: boolean };
export async function myAccess(): Promise<Access | null> {
  if (!live || !current) return null;
  return run(sb().rpc('my_access')) as Promise<Access>;
}

/** Where the session stands: 'none' (no app enrolled), 'needs-code', or 'verified'. */
export async function mfaStatus(): Promise<{ state: 'none' | 'needs-code' | 'verified'; factorId?: string }> {
  const factors: any = await run(sb().auth.mfa.listFactors() as any);
  const totp = (factors.totp ?? []).find((f: any) => f.status === 'verified');
  if (!totp) return { state: 'none' };
  const aal: any = await run(sb().auth.mfa.getAuthenticatorAssuranceLevel() as any);
  return { state: aal.currentLevel === 'aal2' ? 'verified' : 'needs-code', factorId: totp.id };
}

/** Start linking an authenticator app: returns the secret, an otpauth:// link and a QR (SVG data URI). */
export async function mfaEnroll() {
  const factors: any = await run(sb().auth.mfa.listFactors() as any);
  for (const f of factors.all ?? []) if (f.status !== 'verified') await sb().auth.mfa.unenroll({ factorId: f.id });
  const r: any = await run(sb().auth.mfa.enroll({ factorType: 'totp', friendlyName: 'Royals Connect' }) as any);
  return { factorId: r.id as string, secret: r.totp.secret as string, uri: r.totp.uri as string, qr: r.totp.qr_code as string };
}

/** Verify a 6-digit authenticator code (finishes enrollment, or upgrades this session to aal2). */
export async function mfaVerify(factorId: string, code: string) {
  await run(sb().auth.mfa.challengeAndVerify({ factorId, code: code.trim() }) as any);
  return session();
}

// ---------------------------------------------------------------- admin tiers & permissions

export type PermissionInfo = { key: string; label: string; description: string };
export type AdminPerson = Person & { adminTier: string | null; granted: string[] };
export type AdminRole = { id: string; name: string; description: string; permissions: string[]; isSystem: boolean };
export type PeopleFilter = 'all' | 'pending' | 'staff' | 'parents' | 'students' | 'admins';

export async function permissionCatalog(): Promise<PermissionInfo[]> {
  return run(sb().rpc('permission_catalog')) as Promise<PermissionInfo[]>;
}

/** One page of people for the admin portal, with the total number of matches. */
export async function adminListPeople(opts: { search?: string; filter?: PeopleFilter; limit?: number; offset?: number } = {}) {
  const rows: any[] = await run(sb().rpc('admin_list_people', {
    p_search: opts.search?.trim() || null, p_filter: opts.filter ?? 'all', p_limit: opts.limit ?? 20, p_offset: opts.offset ?? 0,
  }));
  return {
    total: rows.length ? Number(rows[0].total) : 0,
    people: rows.map((p): AdminPerson => ({ ...toPerson(p), adminTier: p.admin_tier, granted: p.permissions ?? [] })),
  };
}

export async function adminRoles(): Promise<AdminRole[]> {
  return (await run(sb().from('admin_roles').select('*').order('is_system', { ascending: false }).order('name')))
    .map((r: any) => ({ id: r.id, name: r.name, description: r.description, permissions: r.permissions ?? [], isSystem: r.is_system }));
}
export async function adminSaveRole(role: { id?: string | null; name: string; description: string; permissions: string[] }) {
  await run(sb().rpc('admin_save_role', { p_id: role.id ?? null, p_name: role.name, p_description: role.description, p_permissions: role.permissions }));
}
export async function adminDeleteRole(id: string) { await run(sb().rpc('admin_delete_role', { p_id: id })); }
/** Give someone a role (not director) and extra permissions. */
export async function adminSetAccess(userId: string, roleId: string | null, permissions: string[]) {
  await run(sb().rpc('admin_set_access', { p_user: userId, p_tier: roleId, p_permissions: permissions }));
}
/** Add or remove a director (there must always be at least one). */
export async function adminSetDirector(userId: string, director: boolean) {
  await run(sb().rpc('admin_set_director', { p_user: userId, p_director: director }));
}
export async function transferDirector(userId: string) {
  await run(sb().rpc('transfer_director', { p_user: userId }));
}

// ---------------------------------------------------------------- notifications

export type Notice = { id: string; title: string; body: string; data: any; createdAt: string; status: string; sentCount: number; audience: string };
const toNotice = (n: any): Notice => ({
  id: n.id, title: n.title, body: n.body, data: n.data, createdAt: n.created_at, status: n.status, sentCount: n.sent_count, audience: n.audience,
});
/** Every notification this person may see (admin portal history). */
export async function listNotifications(limit = 50): Promise<Notice[]> {
  if (!live || !current) return [];
  // School-wide and group notifications (personal ones like reply alerts stay out of the portal history).
  return (await run(sb().from('notifications').select('*').neq('audience', 'user')
    .order('created_at', { ascending: false }).limit(limit))).map(toNotice);
}
/** The signed-in person's inbox: only notifications sent to them, newest first. */
export async function myNotifications(limit = 50): Promise<Notice[]> {
  if (!live || !current) return [];
  return (await run(sb().rpc('my_notifications', { p_limit: limit }))).map(toNotice);
}
export async function sendNotification(title: string, body: string, audience: 'everyone' | 'roles' | 'group', opts: { groupId?: string; roles?: SchoolRole[]; urgent?: boolean } = {}) {
  await run(sb().rpc('send_notification', {
    p_title: title, p_body: body, p_audience: audience, p_group: opts.groupId ?? null, p_roles: opts.roles ?? null, p_urgent: !!opts.urgent,
  }));
}
export async function setNotificationPref(groupId: string, pref: 'all' | 'mentions' | 'none') {
  await run(sb().rpc('set_notification_pref', { p_group: groupId, p_pref: pref }));
}
export async function registerPushToken(token: string, platform: string) {
  await run(sb().rpc('register_push_token', { p_token: token, p_platform: platform }));
}
export async function unregisterPushToken(token: string) {
  await run(sb().rpc('unregister_push_token', { p_token: token }));
}

// ---------------------------------------------------------------- my profile

export type MySettings = {
  pushSchool: boolean; pushGroups: boolean; pushReplies: boolean; pushMarketplace: boolean; pushVolunteer: boolean;
  quietStart: string | null; quietEnd: string | null;
};
export type GroupPref = { groupId: string; name: string; icon: string; pref: 'all' | 'mentions' | 'none' };

export async function updateMyName(first: string, last: string) {
  await run(sb().rpc('update_my_profile', { p_first: first, p_last: last }));
  await session();
}
/** Upload a JPEG (base64) as your profile photo, replacing the old one. */
export async function uploadMyAvatar(base64: string) {
  const old = current?.id ? (await run(sb().from('profiles').select('avatar_url').eq('id', current.id).single()) as any).avatar_url : null;
  const path = `${current!.id}/${Date.now()}.jpg`;
  const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
  await run(sb().storage.from('avatars').upload(path, bytes.buffer, { contentType: 'image/jpeg' }) as any);
  await run(sb().rpc('set_my_avatar', { p_path: path }));
  if (old && !/^https?:/.test(old)) await sb().storage.from('avatars').remove([old]);
  await session();
}
export async function removeMyAvatar() {
  const old = (await run(sb().from('profiles').select('avatar_url').eq('id', current!.id).single()) as any).avatar_url;
  await run(sb().rpc('set_my_avatar', { p_path: null }));
  if (old && !/^https?:/.test(old)) await sb().storage.from('avatars').remove([old]);
  await session();
}
/** Staff with people.roles: take down someone's photo. */
export async function adminClearAvatar(userId: string) {
  await run(sb().rpc('admin_clear_avatar', { p_user: userId }));
  await session();
}

const DEFAULT_SETTINGS: MySettings = {
  pushSchool: true, pushGroups: true, pushReplies: true, pushMarketplace: true, pushVolunteer: true, quietStart: null, quietEnd: null,
};
const toSettings = (r: any): MySettings => (r ? {
  pushSchool: r.push_school ?? true, pushGroups: r.push_groups, pushReplies: r.push_replies ?? true,
  pushMarketplace: r.push_marketplace, pushVolunteer: r.push_volunteer,
  quietStart: r.quiet_start?.slice(0, 5) ?? null, quietEnd: r.quiet_end?.slice(0, 5) ?? null,
} : DEFAULT_SETTINGS);
export async function mySettings(): Promise<MySettings> {
  if (!live) return DEFAULT_SETTINGS;
  return toSettings(await run(sb().from('user_settings').select('*').maybeSingle()));
}
export async function updateMySettings(st: MySettings): Promise<MySettings> {
  return toSettings(await run(sb().rpc('update_my_settings', {
    p_push_groups: st.pushGroups, p_push_marketplace: st.pushMarketplace, p_push_volunteer: st.pushVolunteer,
    p_quiet_start: st.quietStart, p_quiet_end: st.quietEnd, p_push_school: st.pushSchool, p_push_replies: st.pushReplies,
  })));
}
/** Your notification level in each of your groups (the group's default when you haven't chosen). */
export async function myGroupPrefs(): Promise<GroupPref[]> {
  if (!live || !current) return [];
  const rows: any[] = await run(sb().from('memberships').select('group_id, notification, groups(name, icon, settings)').eq('user_id', current.id));
  return rows.filter((r) => r.groups).map((r) => ({
    groupId: r.group_id, name: r.groups.name, icon: r.groups.icon,
    pref: (r.notification ?? r.groups.settings?.notificationDefault ?? 'all') === 'digest' ? 'mentions' : (r.notification ?? r.groups.settings?.notificationDefault ?? 'all'),
  })).sort((a, b) => a.name.localeCompare(b.name));
}

// ---------------------------------------------------------------- car screen (Android Auto)

/** A car pass for this phone: lets the car screen show and check in only this parent's children. */
export async function createCarPass(): Promise<string> {
  return run(sb().rpc('create_car_pass')) as Promise<string>;
}
export async function revokeCarPass(token: string) {
  await run(sb().rpc('revoke_car_pass', { p_token: token }));
}

// ---------------------------------------------------------------- stats & following

const seen = new Set<string>();
let flushTimer: ReturnType<typeof setTimeout> | null = null;
/** Note that these posts were on screen; sent in small batches. */
export function recordPostViews(postIds: string[]) {
  if (!live || !current) return;
  postIds.forEach((id) => seen.add(id));
  if (flushTimer) return;
  flushTimer = setTimeout(() => {
    const ids = [...seen];
    seen.clear(); flushTimer = null;
    sb().rpc('record_post_views', { p_posts: ids }).then(() => {}, () => {});
  }, 1500);
}

export type PostStats = {
  postId: string; groupId: string; title: string; createdAt: string;
  audience: number; viewers: number; views: number; reactions: Record<string, number>;
  replies: number; repliers: number; pollVotes: number; score: number; followers: number;
  notificationOpens: number; pushDevices: number;
  byDay: { day: string; viewers: number }[];
  seenBy: { name: string; role: string; at: string }[];
};
export async function postStats(postId: string): Promise<PostStats> {
  return run(sb().rpc('post_stats', { p_post: postId })) as Promise<PostStats>;
}
export type GroupPostStat = { postId: string; title: string; kind: string; createdAt: string; author: string; viewers: number; audience: number; reactions: number; replies: number };
export async function groupPostStats(groupId: string): Promise<GroupPostStat[]> {
  const rows: any[] = await run(sb().rpc('group_post_stats', { p_group: groupId, p_limit: 100 }));
  return rows.map((r) => ({
    postId: r.post_id, title: r.title, kind: r.kind, createdAt: r.created_at, author: r.author,
    viewers: Number(r.viewers), audience: Number(r.audience), reactions: Number(r.reactions), replies: Number(r.replies),
  }));
}

/** Which of these posts the person follows for replies. */
export async function myFollows(postIds: string[]): Promise<Set<string>> {
  if (!live || !current || !postIds.length) return new Set();
  const rows: any[] = await run(sb().from('post_follows').select('post_id, following').eq('user_id', current.id).in('post_id', postIds));
  return new Set(rows.filter((r) => r.following).map((r) => r.post_id));
}
export async function setPostFollow(postId: string, follow: boolean) {
  await run(sb().rpc('set_post_follow', { p_post: postId, p_follow: follow }));
}

export async function markNotificationsOpened(ids: string[]) {
  if (!live || !current || !ids.length) return;
  await sb().rpc('mark_notifications_opened', { p_ids: ids });
}
/** Notification ids this person has already opened. */
export async function openedNotifications(ids: string[]): Promise<Set<string>> {
  if (!live || !current || !ids.length) return new Set();
  const rows: any[] = await run(sb().from('notification_opens').select('notification_id').in('notification_id', ids));
  return new Set(rows.map((r) => r.notification_id));
}
/** For senders: how many people opened each notification. */
export async function notificationOpenCounts(ids: string[]): Promise<Record<string, number>> {
  if (!live || !ids.length) return {};
  const rows: any[] = await run(sb().rpc('notification_open_counts', { p_ids: ids }));
  return Object.fromEntries(rows.map((r) => [r.id, Number(r.opened)]));
}

/** Delete notifications from your own inbox (others and the sender's history keep them). */
export async function dismissNotifications(ids: string[]) {
  if (!ids.length) return;
  await run(sb().rpc('dismiss_notifications', { p_ids: ids }));
}
export async function clearMyNotifications(): Promise<number> {
  return run(sb().rpc('clear_my_notifications')) as Promise<number>;
}
