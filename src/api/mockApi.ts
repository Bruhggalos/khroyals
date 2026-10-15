/**
 * App data API. Every screen talks to this module only, so swapping in a live
 * backend later means replacing these function bodies with fetch() calls —
 * screens don't change.
 *
 * Site content (content/site) is the real khroyals.com content, imported by
 * `npm run import-site`. Royals Connect (mock-db/comms) is still demo data.
 */
import site from '../../content/site/site.json';
import home from '../../content/site/home.json';
import news from '../../content/site/news.json';
import calendar from '../../content/site/calendar.json';
import pageIndex from '../../content/site/pages/index.json';
import { pages } from '../../content/site/pages';

import usersDb from '../../mock-db/comms/users.json';
import groupsDb from '../../mock-db/comms/groups.json';
import membershipsDb from '../../mock-db/comms/memberships.json';
import postsDb from '../../mock-db/comms/posts.json';
import commentsDb from '../../mock-db/comms/comments.json';
import auditDb from '../../mock-db/comms/audit-log.json';

import type { Comment, Group, GroupSettings, Membership, Post, User } from '../comms/types';
import type { Article, CalendarEvent, NavItem, SitePage } from '../site/types';
import { can, canComment, canEditSettings, canModerate, type Context } from '../comms/permissions';

export const USE_MOCK = true;
export const API_BASE = 'https://api.khroyals.example/v1';
const LATENCY_MS = 250;
const delay = <T,>(v: T) => new Promise<T>((r) => setTimeout(() => r(structuredClone(v)), LATENCY_MS));

// ---------------- Site content ----------------
const aliases: Record<string, string> = pageIndex.aliases;
/** Resolve a site path segment ("plan-a-visit") to a page id, following redirects. */
export const resolvePageId = (slug: string): string | null => {
  const id = aliases[slug] ?? slug;
  return pages[id] ? id : null;
};

export const getSite = () => delay({ ...site, navigation: site.navigation as NavItem[] });
export const getHome = () => delay(home as unknown as SitePage);
export function getPage(id: string) {
  const pid = resolvePageId(id);
  return pid ? delay(pages[pid]) : Promise.reject(new Error('Page not found.'));
}
export const getNews = () => delay({ categories: news.categories, articles: news.articles as unknown as Article[] });
export const getArticle = (slug: string) =>
  delay((news.articles as unknown as Article[]).find((a) => a.slug === slug) ?? null);
export const getCalendar = () => delay({ ...calendar, events: calendar.events as CalendarEvent[] });

// ---------------- Comms (in-memory, mutable) ----------------
const db = {
  users: usersDb.users as User[],
  groups: groupsDb.groups as unknown as Group[],
  memberships: membershipsDb.memberships as Membership[],
  posts: postsDb.posts as unknown as Post[],
  comments: commentsDb.comments as Comment[],
  audit: auditDb.events as any[],
};
let currentUserId = 'u-eng';
export const setCurrentUser = (id: string) => { currentUserId = id; };
export const me = () => db.users.find((u) => u.id === currentUserId)!;

function ctx(groupId: string): Context {
  const group = db.groups.find((g) => g.id === groupId)!;
  const membership = db.memberships.find((m) => m.groupId === groupId && m.userId === currentUserId) ?? null;
  const last = db.posts.filter((p) => p.groupId === groupId && p.authorId === currentUserId)
    .map((p) => new Date(p.createdAt)).sort((a, b) => +b - +a)[0];
  return { user: me(), group, membership, lastPostAt: last ?? null };
}

export const listUsers = () => delay(db.users);
export const getUser = (id: string) => db.users.find((u) => u.id === id);

export function listMyGroups() {
  const mine = new Set(db.memberships.filter((m) => m.userId === currentUserId).map((m) => m.groupId));
  const admin = me().schoolRole === 'admin';
  return delay(db.groups.filter((g) => admin || mine.has(g.id)));
}

export function getGroup(groupId: string) {
  const c = ctx(groupId);
  const mod = canModerate(c);
  const posts = db.posts
    .filter((p) => p.groupId === groupId && (p.status === 'published' || (mod && p.status !== 'removed') || p.authorId === currentUserId))
    .sort((a, b) => Number(b.pinned) - Number(a.pinned) || +new Date(b.createdAt) - +new Date(a.createdAt));
  return delay({
    group: c.group,
    myRole: c.membership?.role ?? (me().schoolRole === 'admin' ? 'owner' : null),
    posts,
    members: db.memberships.filter((m) => m.groupId === groupId),
    abilities: {
      post: can(c, 'post'), askQuestion: can(c, 'askQuestion'), react: can(c, 'react'), comment: can(c, 'comment'),
      createPolls: can(c, 'createPolls'), attachFiles: can(c, 'attachFiles'), pin: can(c, 'pin'),
      moderate: mod, editSettings: canEditSettings(c), createEvents: false,
    },
  });
}

export const getComments = (postId: string) => delay(db.comments.filter((c) => c.postId === postId));

export function createPost(groupId: string, input: Pick<Post, 'kind' | 'body' | 'title'> & { anonymous?: boolean }) {
  const c = ctx(groupId);
  const d = input.kind === 'question' ? can(c, 'askQuestion') : can(c, 'post');
  if (!d.allowed) return Promise.reject(new Error(d.reason));
  const post: Post = {
    id: `p-${Date.now()}`, groupId, authorId: input.anonymous && c.group.settings.allowAnonymousQuestions ? null : currentUserId,
    kind: input.kind, title: input.title, body: input.body, attachments: [], status: d.needsApproval ? 'pending' : 'published',
    pinned: false, commentsLocked: false, score: 0, reactions: {}, createdAt: new Date().toISOString(),
  };
  db.posts.push(post);
  return delay(post);
}

export function addComment(postId: string, body: string) {
  const post = db.posts.find((p) => p.id === postId)!;
  const d = canComment(ctx(post.groupId), post);
  if (!d.allowed) return Promise.reject(new Error(d.reason));
  const c: Comment = { id: `c-${Date.now()}`, postId, parentCommentId: null, authorId: currentUserId, body, status: 'published', isAnswer: false, score: 0, createdAt: new Date().toISOString() };
  db.comments.push(c);
  return delay(c);
}

export function moderatePost(postId: string, action: 'approve' | 'reject' | 'remove' | 'pin' | 'lockComments') {
  const post = db.posts.find((p) => p.id === postId)!;
  if (!canModerate(ctx(post.groupId))) return Promise.reject(new Error('Not a moderator.'));
  if (action === 'approve') post.status = 'published';
  if (action === 'reject') post.status = 'rejected';
  if (action === 'remove') post.status = 'removed';
  if (action === 'pin') post.pinned = !post.pinned;
  if (action === 'lockComments') post.commentsLocked = !post.commentsLocked;
  db.audit.push({ id: `a-${Date.now()}`, groupId: post.groupId, actorId: currentUserId, action: `post.${action}`, targetId: postId, at: new Date().toISOString() });
  return delay(post);
}

export function updateGroupSettings(groupId: string, patch: Partial<GroupSettings>) {
  const c = ctx(groupId);
  if (!canEditSettings(c)) return Promise.reject(new Error('Only owners can change settings.'));
  c.group.settings = { ...c.group.settings, ...patch, permissions: { ...c.group.settings.permissions, ...(patch.permissions ?? {}) } };
  db.audit.push({ id: `a-${Date.now()}`, groupId, actorId: currentUserId, action: patch.locked !== undefined ? (patch.locked ? 'group.locked' : 'group.unlocked') : 'settings.updated', detail: patch, at: new Date().toISOString() });
  return delay(c.group);
}

export function createGroup(g: Omit<Group, 'id' | 'createdAt' | 'createdBy'>) {
  const group: Group = { ...g, id: `g-${Date.now()}`, createdAt: new Date().toISOString(), createdBy: currentUserId };
  db.groups.push(group);
  db.memberships.push({ groupId: group.id, userId: currentUserId, role: 'owner', source: 'manual', joinedAt: group.createdAt });
  return delay(group);
}
