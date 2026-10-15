import type { GroupMode, GroupPermissions, GroupSettings } from './types';

/** Starting points. Teachers pick one, then tweak any individual setting. */
export const PERMISSION_PRESETS: Record<GroupMode, GroupPermissions> = {
  chat: {
    viewContent: 'members', post: 'members', comment: 'members', react: 'members',
    askQuestion: 'members', answerQuestion: 'members', attachFiles: 'members',
    createPolls: 'members', pin: 'moderators', seeMemberList: 'members',
    directMessageMembers: 'moderators', mentionEveryone: 'moderators',
  },
  forum: {
    viewContent: 'members', post: 'members', comment: 'members', react: 'members',
    askQuestion: 'members', answerQuestion: 'members', attachFiles: 'members',
    createPolls: 'moderators', pin: 'moderators', seeMemberList: 'members',
    directMessageMembers: 'nobody', mentionEveryone: 'moderators',
  },
  broadcast: {
    viewContent: 'subscribers', post: 'moderators', comment: 'nobody', react: 'subscribers',
    askQuestion: 'nobody', answerQuestion: 'moderators', attachFiles: 'moderators',
    createPolls: 'moderators', pin: 'moderators', seeMemberList: 'moderators',
    directMessageMembers: 'nobody', mentionEveryone: 'owners',
  },
  qa: {
    viewContent: 'members', post: 'moderators', comment: 'moderators', react: 'members',
    askQuestion: 'members', answerQuestion: 'moderators', attachFiles: 'moderators',
    createPolls: 'moderators', pin: 'moderators', seeMemberList: 'moderators',
    directMessageMembers: 'nobody', mentionEveryone: 'owners',
  },
};

export function defaultSettings(mode: GroupMode): GroupSettings {
  return {
    mode,
    visibility: mode === 'broadcast' ? 'school' : 'private',
    joinPolicy: mode === 'broadcast' ? 'open' : 'assigned',
    permissions: { ...PERMISSION_PRESETS[mode] },
    requirePostApproval: false,
    requireQuestionApproval: mode === 'qa',
    allowAnonymousQuestions: false,
    slowModeSeconds: 0,
    autoCloseCommentsAfterDays: null,
    locked: false,
    quietHours: null,
    contentFilter: 'standard',
    retainDeletedContent: true,
    membersCanLeave: mode === 'broadcast',
    notificationDefault: mode === 'chat' ? 'all' : mode === 'broadcast' ? 'all' : 'mentions',
  };
}

export const MODE_LABELS: Record<GroupMode, { title: string; blurb: string }> = {
  chat: { title: 'Group Chat', blurb: 'Live conversation, like GroupMe.' },
  forum: { title: 'Discussion Board', blurb: 'Threads with replies and votes, like Reddit.' },
  broadcast: { title: 'Announcements', blurb: 'Staff post, everyone subscribes. Read-only by default.' },
  qa: { title: 'Q&A', blurb: 'Members ask, staff answer. Questions can be screened first.' },
};
