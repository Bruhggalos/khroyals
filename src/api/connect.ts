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
export type Person = User & { email?: string | null; pending?: boolean };
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
let current: Person | null = null;

const toPerson = (p: any): Person => ({
  id: p.id, firstName: p.first_name ?? '', lastName: p.last_name ?? '', schoolRole: p.school_role as SchoolRole,
  avatar: p.avatar_url ?? `https://i.pravatar.cc/120?u=${p.id}`, grade: p.grade ?? undefined,
  email: p.email, pending: p.school_role == null,
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
  directory.clear();
  people.forEach((p: any) => directory.set(p.id, toPerson(p)));
  current = directory.get(uid) ?? toPerson({ id: uid });
  current.email = data.session?.user.email;
  return current;
}

export const me = (): Person | null => (live ? current : mock.me());
export const getUser = (id: string): Person | undefined => (live ? directory.get(id) : mock.getUser(id));
export const listUsers = async (): Promise<Person[]> => (live ? [...directory.values()] : mock.listUsers());

export async function signIn(email: string, password: string) {
  await run(sb().auth.signInWithPassword({ email: email.trim(), password }) as any);
  return session();
}
export async function signUp(email: string, password: string, firstName: string, lastName: string) {
  const data: any = await run(sb().auth.signUp({ email: email.trim(), password, options: { data: { first_name: firstName, last_name: lastName } } }) as any);
  return data.session ? session() : null; // null → confirm email first
}
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

// ---------------------------------------------------------------- admin

export async function adminListPeople(): Promise<Person[]> {
  return (await run(sb().rpc('admin_list_people'))).map(toPerson);
}
export async function adminUpdateProfile(userId: string, role: SchoolRole | null, grade?: number | null) {
  await run(sb().rpc('admin_update_profile', { p_user: userId, p_role: role, p_grade: grade ?? null }));
}
export async function adminLinkGuardian(guardianId: string, studentId: string, link = true) {
  await run(sb().rpc('admin_link_guardian', { p_guardian: guardianId, p_student: studentId, p_link: link }));
}
export async function adminGuardianLinks(): Promise<{ guardianId: string; studentId: string }[]> {
  return (await run(sb().from('guardians').select('*'))).map((g: any) => ({ guardianId: g.guardian_id, studentId: g.student_id }));
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
/**
 * Email a sign-in link (and a 6-digit code once the project uses its own email
 * service). The link reopens the app — or the web portal — and signs in.
 */
export async function sendEmailCode(email: string, firstName?: string, lastName?: string) {
  await run(sb().auth.signInWithOtp({
    email: email.trim(),
    options: {
      shouldCreateUser: true,
      emailRedirectTo: authRedirectUrl(),
      data: firstName ? { first_name: firstName, last_name: lastName ?? '' } : undefined,
    },
  }) as any);
}

/** Where sign-in links return to: this web page, or the app's khroyals://auth link. */
export function authRedirectUrl() {
  return Platform.OS === 'web' && typeof window !== 'undefined' ? `${window.location.origin}/auth` : Linking.createURL('auth');
}

/** Finish signing in from a sign-in link (tokens in the URL fragment or query). Returns true if it did. */
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
export async function verifyEmailCode(email: string, code: string) {
  await run(sb().auth.verifyOtp({ email: email.trim(), token: code.trim(), type: 'email' }) as any);
  return session();
}

export type Access = { tier: 'director' | 'administrator' | 'office' | null; granted: string[]; permissions: string[]; mfaRequired: boolean; mfaVerified: boolean };
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
export type AdminPerson = Person & { adminTier: Access['tier']; granted: string[] };

export async function permissionCatalog(): Promise<PermissionInfo[]> {
  return run(sb().rpc('permission_catalog')) as Promise<PermissionInfo[]>;
}
export async function adminListPeopleWithAccess(): Promise<AdminPerson[]> {
  return (await run(sb().rpc('admin_list_people'))).map((p: any) => ({ ...toPerson(p), adminTier: p.admin_tier, granted: p.permissions ?? [] }));
}
export async function adminSetAccess(userId: string, tier: Access['tier'], permissions: string[]) {
  await run(sb().rpc('admin_set_access', { p_user: userId, p_tier: tier, p_permissions: permissions }));
}
export async function transferDirector(userId: string) {
  await run(sb().rpc('transfer_director', { p_user: userId }));
}

// ---------------------------------------------------------------- notifications

export type Notice = { id: string; title: string; body: string; data: any; createdAt: string; status: string; sentCount: number; audience: string };
export async function listNotifications(limit = 50): Promise<Notice[]> {
  if (!live || !current) return [];
  return (await run(sb().from('notifications').select('*').order('created_at', { ascending: false }).limit(limit))).map((n: any) => ({
    id: n.id, title: n.title, body: n.body, data: n.data, createdAt: n.created_at, status: n.status, sentCount: n.sent_count, audience: n.audience,
  }));
}
export async function sendNotification(title: string, body: string, audience: 'everyone' | 'roles' | 'group', opts: { groupId?: string; roles?: SchoolRole[] } = {}) {
  await run(sb().rpc('send_notification', { p_title: title, p_body: body, p_audience: audience, p_group: opts.groupId ?? null, p_roles: opts.roles ?? null }));
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
