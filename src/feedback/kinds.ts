/**
 * Feedback kinds, app areas, statuses and priorities, as the app shows them. The database
 * checks list the same keys (supabase/migrations/…_feedback.sql), so change both together.
 * No app imports, so tests run it.
 */

export type FeedbackKind = 'bug' | 'idea';
export type FeedbackStatus = 'new' | 'reviewing' | 'planned' | 'in_progress' | 'done' | 'declined';
export type FeedbackPriority = 'low' | 'medium' | 'high';

export const KINDS: { key: FeedbackKind; label: string; emoji: string; hint: string }[] = [
  { key: 'bug', label: 'Something’s wrong', emoji: '🐞', hint: 'What happened, and what did you expect? Steps to make it happen again help a lot.' },
  { key: 'idea', label: 'An idea', emoji: '💡', hint: 'What would you like the app to do, and how would it help you?' },
];

export const AREAS: { key: string; label: string }[] = [
  { key: 'planner', label: 'Planner' }, { key: 'connect', label: 'Connect & groups' }, { key: 'carline', label: 'Car line' },
  { key: 'calendar', label: 'Calendar' }, { key: 'activities', label: 'Activities' }, { key: 'volunteer', label: 'Volunteer' },
  { key: 'market', label: 'Marketplace' }, { key: 'forms', label: 'Forms' }, { key: 'students', label: 'Students & teachers' },
  { key: 'questions', label: 'Ask the School' }, { key: 'photos', label: 'Photos' }, { key: 'news', label: 'News' },
  { key: 'alerts', label: 'Alerts' }, { key: 'profile', label: 'My profile & sign-in' }, { key: 'admin', label: 'Admin portal' },
  { key: 'other', label: 'Something else' },
];

export const STATUSES: { key: FeedbackStatus; label: string; color: string }[] = [
  { key: 'new', label: 'New', color: '#B54708' },
  { key: 'reviewing', label: 'Being reviewed', color: '#0E7490' },
  { key: 'planned', label: 'Planned', color: '#7C3AED' },
  { key: 'in_progress', label: 'Being worked on', color: '#1D4ED8' },
  { key: 'done', label: 'Done', color: '#15803D' },
  { key: 'declined', label: 'Not planned', color: '#5B6577' },
];

export const PRIORITIES: { key: FeedbackPriority; label: string; color: string }[] = [
  { key: 'high', label: 'High', color: '#B42318' }, { key: 'medium', label: 'Medium', color: '#B54708' }, { key: 'low', label: 'Low', color: '#5B6577' },
];

export const kindInfo = (k: string) => KINDS.find((x) => x.key === k) ?? KINDS[0];
export const areaLabel = (k: string) => AREAS.find((x) => x.key === k)?.label ?? 'Something else';
export const statusInfo = (k: string) => STATUSES.find((x) => x.key === k) ?? STATUSES[0];
export const priorityInfo = (k: string | null) => PRIORITIES.find((x) => x.key === k) ?? null;

/** Still to deal with: not done or declined. */
export const isOpen = (s: string) => s !== 'done' && s !== 'declined';

/** Triage's filters: open ones (default), one status, or everything. */
export type Filter = 'open' | FeedbackStatus | 'all';
export const matches = (f: Filter, status: string) => (f === 'all' ? true : f === 'open' ? isOpen(status) : status === f);

/** Triage order: high priority first, then new before the rest, then newest. */
export function triageOrder<T extends { priority: string | null; status: string; createdAt: string }>(list: T[]): T[] {
  const p = (x: T) => (x.priority === 'high' ? 0 : x.priority === 'medium' ? 1 : x.priority === 'low' ? 2 : 1.5);
  return [...list].sort((a, b) => p(a) - p(b) || Number(b.status === 'new') - Number(a.status === 'new') || b.createdAt.localeCompare(a.createdAt));
}

/** "ios 27.0 · app 0.1.0": what the report was sent from. */
export const deviceLine = (os: string, osVersion: string | number | null | undefined, appVersion: string | null | undefined) =>
  [`${os}${osVersion ? ` ${osVersion}` : ''}`, appVersion ? `app ${appVersion}` : null].filter(Boolean).join(' · ');
