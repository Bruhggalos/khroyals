/** stats: internal API implementation. Screens import the connect facade. */
import { live, run, sb, rpc } from './client';
import { current } from './session';
import type { GroupPostStat, PostStats } from './types';

export const seen = new Set<string>();

export let flushTimer: ReturnType<typeof setTimeout> | null = null;

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

export async function postStats(postId: string): Promise<PostStats> {
  return rpc('post_stats', { p_post: postId }) as Promise<PostStats>;
}

export async function groupPostStats(groupId: string): Promise<GroupPostStat[]> {
  const rows = await rpc('group_post_stats', { p_group: groupId, p_limit: 100 });
  return rows.map((r) => ({
    postId: r.post_id, title: r.title, kind: r.kind, createdAt: r.created_at, author: r.author,
    viewers: Number(r.viewers), audience: Number(r.audience), reactions: Number(r.reactions), replies: Number(r.replies),
  }));
}

/** Which of these posts the person follows for replies. */
export async function myFollows(postIds: string[]): Promise<Set<string>> {
  if (!live || !current || !postIds.length) return new Set();
  const rows = await run(sb().from('post_follows').select('post_id, following').eq('user_id', current.id).in('post_id', postIds));
  return new Set(rows.filter((r) => r.following).map((r) => r.post_id));
}

export async function setPostFollow(postId: string, follow: boolean) {
  await rpc('set_post_follow', { p_post: postId, p_follow: follow });
}
