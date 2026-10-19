/**
 * Royals Connect — communication data model.
 *
 * One flexible "Group" primitive covers every style the school needs:
 *   chat       → GroupMe-style live conversation
 *   forum      → Reddit-style threads with comments and votes
 *   broadcast  → blog/announcement channel people subscribe to (read-only for most)
 *   qa         → members ask questions, staff answer; questions can be held for approval
 *
 * A preset only fills in defaults. Every permission is individually overridable,
 * so a teacher can build e.g. "broadcast, but parents may comment" or
 * "forum, but only students in Period 3 may post".
 */

/** `family`: grandparents and other relatives the office links to children for car line pickup (no groups). */
export type SchoolRole = 'admin' | 'teacher' | 'staff' | 'parent' | 'student' | 'family';

/** Role a person holds inside one group. Ordered from most to least privileged. */
export type GroupRole = 'owner' | 'moderator' | 'member' | 'subscriber';

/** Who may perform an action. Each level includes everyone above it. */
export type Audience = 'nobody' | 'owners' | 'moderators' | 'members' | 'subscribers';

export type GroupMode = 'chat' | 'forum' | 'broadcast' | 'qa';

export type Visibility =
  | 'public'   // anyone, even signed-out app users, can see it exists and read
  | 'school'   // any signed-in school account can find and read
  | 'private'  // discoverable, content visible to members only
  | 'hidden';  // not discoverable; assignment or invite only

export type JoinPolicy =
  | 'assigned' // only staff / auto-assignment rules add people
  | 'open'     // anyone who can see it may join
  | 'request'  // join request approved by a moderator
  | 'invite';  // invite link or code

export interface GroupPermissions {
  viewContent: Audience;      // who can read posts
  post: Audience;             // start a top-level post / message / announcement
  comment: Audience;          // reply under a post
  react: Audience;            // likes / emoji / up-down votes
  askQuestion: Audience;      // submit a question (Q&A + any mode with Q&A enabled)
  answerQuestion: Audience;
  attachFiles: Audience;
  createPolls: Audience;
  pin: Audience;
  seeMemberList: Audience;
  directMessageMembers: Audience; // start a DM with someone found via this group
  mentionEveryone: Audience;      // @everyone
}

export interface GroupSettings {
  mode: GroupMode;
  visibility: Visibility;
  joinPolicy: JoinPolicy;
  permissions: GroupPermissions;

  /** Posts from members land in a moderation queue until approved. */
  requirePostApproval: boolean;
  /** Questions are held until a moderator approves them (common for parent Q&A). */
  requireQuestionApproval: boolean;
  allowAnonymousQuestions: boolean;
  /** Seconds a member must wait between posts. 0 = off. Staff are exempt. */
  slowModeSeconds: number;
  /** Comments closed on posts older than N days. null = never. */
  autoCloseCommentsAfterDays: number | null;
  /** Instant lockdown: everything becomes read-only for non-moderators. */
  locked: boolean;
  lockReason?: string;
  /** Scheduled quiet hours, e.g. no student posting after 9pm. */
  quietHours?: { start: string; end: string; appliesTo: GroupRole[] } | null;
  /** Word-filter level applied before a post is published. */
  contentFilter: 'off' | 'standard' | 'strict';
  /** Keep a full audit log + retain deleted posts for admin review (records compliance). */
  retainDeletedContent: boolean;
  /** Members may leave on their own (false for required class/staff groups). */
  membersCanLeave: boolean;
  /** Subscribers can choose push / email / digest. */
  notificationDefault: 'all' | 'mentions' | 'digest' | 'none';
}

/** Automatically assign people to a group from roster data. */
export interface AssignmentRule {
  id: string;
  schoolRoles?: SchoolRole[];
  grades?: number[];
  sectionIds?: string[];  // class periods / courses
  teamIds?: string[];     // athletics
  clubIds?: string[];
  /** Parents of matching students are also added at this role. */
  includeGuardiansAs?: GroupRole | null;
  assignAs: GroupRole;
}

export interface Group {
  id: string;
  name: string;
  description: string;
  icon: string;          // emoji or asset key
  color: string;
  category: 'school-wide' | 'class' | 'grade' | 'athletics' | 'club' | 'staff' | 'parents' | 'district';
  createdBy: string;
  createdAt: string;
  settings: GroupSettings;
  assignmentRules: AssignmentRule[];
  /** Optional parent group for nested channels (e.g. Band → Band: Parents). */
  parentGroupId?: string | null;
  tags: string[];
}

export interface Membership {
  groupId: string;
  userId: string;
  role: GroupRole;
  source: 'manual' | 'rule' | 'invite' | 'request' | 'self';
  ruleId?: string;
  mutedUntil?: string | null;
  /** Per-member override, e.g. silence one student without removing them. */
  canPost?: boolean;
  notification?: GroupSettings['notificationDefault'];
  joinedAt: string;
}

export type PostKind = 'message' | 'thread' | 'announcement' | 'question' | 'poll';
export type PostStatus = 'published' | 'pending' | 'rejected' | 'removed' | 'scheduled';

export interface Post {
  id: string;
  groupId: string;
  authorId: string | null; // null when anonymous
  kind: PostKind;
  title?: string;
  body: string;
  attachments: { type: 'image' | 'file' | 'link'; url: string; name?: string }[];
  poll?: { question: string; options: { id: string; label: string; votes: string[] }[]; closesAt?: string };
  status: PostStatus;
  pinned: boolean;
  commentsLocked: boolean;
  acceptedAnswerId?: string | null;
  score: number;                 // forum votes
  reactions: Record<string, string[]>; // emoji -> userIds
  scheduledFor?: string | null;
  createdAt: string;
  editedAt?: string | null;
}

export interface Comment {
  id: string;
  postId: string;
  parentCommentId: string | null; // nesting for forum mode
  authorId: string;
  body: string;
  status: PostStatus;
  isAnswer: boolean;
  score: number;
  createdAt: string;
}

export interface User {
  id: string;
  firstName: string;
  lastName: string;
  schoolRole: SchoolRole;
  avatar: string;
  grade?: number;
  sectionIds?: string[];
  teamIds?: string[];
  clubIds?: string[];
  guardianOf?: string[]; // student userIds
  staffId?: string;      // link to site staff directory
}

export interface AuditEvent {
  id: string;
  groupId: string;
  actorId: string;
  action:
    | 'settings.updated' | 'group.locked' | 'group.unlocked'
    | 'member.added' | 'member.removed' | 'member.role_changed' | 'member.muted'
    | 'post.approved' | 'post.rejected' | 'post.removed' | 'post.pinned';
  targetId?: string;
  detail?: Record<string, unknown>;
  at: string;
}
