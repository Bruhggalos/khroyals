/** notifications: internal API implementation. Screens import the connect facade. */
import type { SchoolRole } from '../comms/types';
import type { Notice } from './types';
import { live, run, sb, rpc } from './client';
import { current } from './session';
import { toNotice } from './mappers';

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
  return (await rpc('my_notifications', { p_limit: limit })).map(toNotice);
}

export async function sendNotification(title: string, body: string, audience: 'everyone' | 'roles' | 'group', opts: { groupId?: string; roles?: SchoolRole[]; urgent?: boolean } = {}) {
  await rpc('send_notification', {
    p_title: title, p_body: body, p_audience: audience, p_group: opts.groupId ?? null, p_roles: opts.roles ?? null, p_urgent: !!opts.urgent,
  });
}

export async function setNotificationPref(groupId: string, pref: 'all' | 'mentions' | 'none') {
  await rpc('set_notification_pref', { p_group: groupId, p_pref: pref });
}

export async function registerPushToken(token: string, platform: string) {
  await rpc('register_push_token', { p_token: token, p_platform: platform });
}

export async function unregisterPushToken(token: string) {
  await rpc('unregister_push_token', { p_token: token });
}

export async function markNotificationsOpened(ids: string[]) {
  if (!live || !current || !ids.length) return;
  await sb().rpc('mark_notifications_opened', { p_ids: ids });
}

/** Notification ids this person has already opened. */
export async function openedNotifications(ids: string[]): Promise<Set<string>> {
  if (!live || !current || !ids.length) return new Set();
  const rows = await run(sb().from('notification_opens').select('notification_id').in('notification_id', ids));
  return new Set(rows.map((r) => r.notification_id));
}

/** For senders: how many people opened each notification. */
export async function notificationOpenCounts(ids: string[]): Promise<Record<string, number>> {
  if (!live || !ids.length) return {};
  const rows = await rpc('notification_open_counts', { p_ids: ids });
  return Object.fromEntries(rows.map((r) => [r.id, Number(r.opened)]));
}

/** Delete notifications from your own inbox (others and the sender's history keep them). */
export async function dismissNotifications(ids: string[]) {
  if (!ids.length) return;
  await rpc('dismiss_notifications', { p_ids: ids });
}

export async function clearMyNotifications(): Promise<number> {
  return rpc('clear_my_notifications') as Promise<number>;
}
