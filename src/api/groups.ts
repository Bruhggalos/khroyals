import { subscribeChanges } from './realtime';
/** groups: internal API implementation. Screens import the connect facade. */
import { jsonValue } from './validation';
import { abilitiesSchema, groupRole } from './schemas';
import type { Comment, Group, GroupRole, GroupSettings, Post } from '../comms/types';
import * as mock from './mockApi';
import { live, run, sb, rpc } from './client';
import { toComment, toGroup, toPost } from './mappers';
import type { Abilities, GroupView, Member } from './types';

export async function listMyGroups(): Promise<Group[]> {
  if (!live) return mock.listMyGroups();
  return (await rpc('my_groups')).map(toGroup);
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
    rpc('group_abilities', { p_group: id }),
    run(sb().from('posts').select('*, reactions(emoji, user_id), poll_options(id, label, position, poll_votes(user_id))')
      .eq('group_id', id).neq('status', 'removed').order('pinned', { ascending: false }).order('created_at', { ascending: false }).limit(100)),
  ]);
  const { role, ...rest } = abilitiesSchema.parse(abilities);
  return { group: toGroup(g), myRole: role, posts: posts.map(toPost), abilities: rest };
}

export async function getComments(postId: string): Promise<Comment[]> {
  if (!live) return mock.getComments(postId);
  return (await run(sb().from('comments').select('*').eq('post_id', postId).neq('status', 'removed').order('created_at'))).map(toComment);
}

export async function createPost(groupId: string, input: { kind: Post['kind']; body: string; title?: string; anonymous?: boolean; pollOptions?: string[] }) {
  if (!live) return mock.createPost(groupId, input);
  return toPost(await rpc('create_post', {
    p_group: groupId, p_kind: input.kind, p_body: input.body, p_title: input.title ?? null,
    p_anonymous: !!input.anonymous, p_poll_options: input.pollOptions?.length ? input.pollOptions : null,
  }));
}

export async function addComment(postId: string, body: string) {
  if (!live) return mock.addComment(postId, body);
  return toComment(await rpc('add_comment', { p_post: postId, p_body: body }));
}

export async function moderatePost(postId: string, action: 'approve' | 'reject' | 'remove' | 'pin' | 'lockComments') {
  if (!live) return mock.moderatePost(postId, action);
  await rpc('moderate_post', { p_post: postId, p_action: action });
}

export async function toggleReaction(postId: string, emoji: string) {
  if (!live) return;
  await rpc('toggle_reaction', { p_post: postId, p_emoji: emoji });
}

export async function votePoll(optionId: string) {
  if (!live) return;
  await rpc('vote_poll', { p_option: optionId });
}

export async function updateGroupSettings(groupId: string, patch: Partial<GroupSettings>) {
  if (!live) return mock.updateGroupSettings(groupId, patch);
  await rpc('update_group_settings', { p_group: groupId, p_patch: jsonValue(patch) });
}

export async function createGroup(g: Omit<Group, 'id' | 'createdAt' | 'createdBy'>): Promise<{ id: string }> {
  if (!live) return mock.createGroup(g);
  return rpc('create_group', {
    p_name: g.name, p_description: g.description, p_icon: g.icon, p_color: g.color, p_category: g.category,
    p_settings: jsonValue(g.settings), p_rules: jsonValue(g.assignmentRules), p_parent: g.parentGroupId ?? null,
  });
}

export async function joinGroup(groupId: string) { await rpc('join_group', { p_group: groupId }); }

export async function leaveGroup(groupId: string) { await rpc('leave_group', { p_group: groupId }); }

export async function listMembers(groupId: string): Promise<Member[]> {
  if (!live) return [];
  return (await run(sb().from('memberships').select('*').eq('group_id', groupId))).map((m) => ({
    userId: m.user_id, role: groupRole.parse(m.role), source: m.source, mutedUntil: m.muted_until, canPost: m.can_post,
  }));
}

export async function setMembership(groupId: string, userId: string, change: { role?: GroupRole; mutedUntil?: string | null; canPost?: boolean; remove?: boolean }) {
  await rpc('set_membership', {
    p_group: groupId, p_user: userId, p_role: change.role ?? null,
    p_muted_until: change.mutedUntil === null ? '-infinity' : change.mutedUntil ?? null,
    p_can_post: change.canPost ?? null, p_remove: !!change.remove,
  });
}

/** Live updates for one group: calls back whenever posts, replies or reactions change. */
export function subscribeGroup(groupId: string, onChange: () => void): () => void {
  return subscribeChanges('subscribeGroup', [{ event: '*', table: 'posts', filter: `group_id=eq.${groupId}` }, { event: '*', table: 'comments' }, { event: '*', table: 'reactions' }, { event: '*', table: 'poll_votes' }], onChange);
}
