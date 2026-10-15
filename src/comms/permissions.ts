import type {
  Audience, Group, GroupPermissions, GroupRole, Membership, Post, User,
} from './types';

/** Lower number = more privileged. */
const ROLE_RANK: Record<GroupRole, number> = { owner: 0, moderator: 1, member: 2, subscriber: 3 };
const AUDIENCE_MAX_RANK: Record<Audience, number> = {
  nobody: -1, owners: 0, moderators: 1, members: 2, subscribers: 3,
};

export type Action = keyof GroupPermissions;

export interface Decision {
  allowed: boolean;
  /** Post goes to the moderation queue instead of publishing. */
  needsApproval?: boolean;
  reason?: string;
}

export interface Context {
  user: User;
  group: Group;
  membership: Membership | null;
  now?: Date;
  /** Timestamp of this user's last post in the group, for slow mode. */
  lastPostAt?: Date | null;
}

const isStaff = (u: User) => u.schoolRole === 'admin' || u.schoolRole === 'teacher' || u.schoolRole === 'staff';

/** Effective role in the group. School admins act as owners everywhere. */
export function effectiveRole(ctx: Context): GroupRole | null {
  if (ctx.user.schoolRole === 'admin') return 'owner';
  if (ctx.membership) return ctx.membership.role;
  const v = ctx.group.settings.visibility;
  // Non-members of public/school groups can read as if subscribers.
  if (v === 'public' || v === 'school') return 'subscriber';
  return null;
}

export function audienceIncludes(audience: Audience, role: GroupRole | null): boolean {
  if (role === null) return false;
  return ROLE_RANK[role] <= AUDIENCE_MAX_RANK[audience];
}

function inQuietHours(ctx: Context, role: GroupRole): boolean {
  const q = ctx.group.settings.quietHours;
  if (!q || !q.appliesTo.includes(role)) return false;
  const now = ctx.now ?? new Date();
  const mins = now.getHours() * 60 + now.getMinutes();
  const [sh, sm] = q.start.split(':').map(Number);
  const [eh, em] = q.end.split(':').map(Number);
  const s = sh * 60 + sm, e = eh * 60 + em;
  return s <= e ? mins >= s && mins < e : mins >= s || mins < e; // handles overnight
}

const WRITE_ACTIONS: Action[] = [
  'post', 'comment', 'askQuestion', 'answerQuestion', 'attachFiles', 'createPolls', 'react',
];

/** The single source of truth for "can this person do X in this group?" */
export function can(ctx: Context, action: Action): Decision {
  const { group, membership } = ctx;
  const s = group.settings;
  const role = effectiveRole(ctx);

  if (role === null) return { allowed: false, reason: 'Not a member of this group.' };
  if (!audienceIncludes(s.permissions[action], role)) {
    return { allowed: false, reason: `Only ${s.permissions[action]} can do this here.` };
  }

  const isMod = ROLE_RANK[role] <= ROLE_RANK.moderator;
  const isWrite = WRITE_ACTIONS.includes(action);

  if (isWrite && !isMod) {
    if (s.locked) return { allowed: false, reason: s.lockReason || 'This group is locked.' };
    if (membership?.canPost === false && action !== 'react') {
      return { allowed: false, reason: 'Posting has been turned off for you in this group.' };
    }
    const now = ctx.now ?? new Date();
    if (membership?.mutedUntil && new Date(membership.mutedUntil) > now && action !== 'react') {
      return { allowed: false, reason: 'You are muted in this group.' };
    }
    if (action !== 'react' && inQuietHours(ctx, role)) {
      return { allowed: false, reason: `Quiet hours (${s.quietHours!.start}–${s.quietHours!.end}).` };
    }
    if (action === 'post' && s.slowModeSeconds > 0 && ctx.lastPostAt && !isStaff(ctx.user)) {
      const wait = s.slowModeSeconds * 1000 - (now.getTime() - ctx.lastPostAt.getTime());
      if (wait > 0) return { allowed: false, reason: `Slow mode: wait ${Math.ceil(wait / 1000)}s.` };
    }
    if (action === 'post' && s.requirePostApproval) return { allowed: true, needsApproval: true };
    if (action === 'askQuestion' && s.requireQuestionApproval) return { allowed: true, needsApproval: true };
  }
  return { allowed: true };
}

/** Per-post check: comments can be closed on one post or by age. */
export function canComment(ctx: Context, post: Post): Decision {
  const base = can(ctx, 'comment');
  if (!base.allowed) return base;
  const role = effectiveRole(ctx)!;
  if (ROLE_RANK[role] <= ROLE_RANK.moderator) return base;
  if (post.commentsLocked) return { allowed: false, reason: 'Comments are closed on this post.' };
  const days = ctx.group.settings.autoCloseCommentsAfterDays;
  if (days != null) {
    const age = ((ctx.now ?? new Date()).getTime() - new Date(post.createdAt).getTime()) / 86_400_000;
    if (age > days) return { allowed: false, reason: `Comments close after ${days} days.` };
  }
  return base;
}

/** Moderation powers are not configurable below moderator. */
export function canModerate(ctx: Context): boolean {
  const role = effectiveRole(ctx);
  return role !== null && ROLE_RANK[role] <= ROLE_RANK.moderator;
}

export function canEditSettings(ctx: Context): boolean {
  return effectiveRole(ctx) === 'owner';
}

/** Who may create groups at all (school policy, not per group). */
export function canCreateGroup(user: User): boolean {
  return isStaff(user);
}
