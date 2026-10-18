/**
 * The Notifications page's list, without React Native: the notifications this
 * phone shows by itself (kept beside the school's), and where tapping any
 * notification goes. src/comms/localInbox.ts stores the list on the phone.
 */

/** A notification this phone showed (or will show) by itself. */
export type LocalNotice = {
  key: string;             // one per showing
  notificationId: string;  // expo-notifications identifier; a daily reminder reuses it
  title: string;
  body: string;
  data: Record<string, unknown>;
  showAt: string;          // when it shows: now, or later for a scheduled one
};

const KEEP = 50;
const MAX_AGE_MS = 30 * 24 * 60 * 60_000;

const at = (n: LocalNotice) => Date.parse(n.showAt);
const newestFirst = (a: LocalNotice, b: LocalNotice) => at(b) - at(a);

/** Add one. Rescheduling replaces the same notification if it hasn't shown yet; ones that showed stay. */
export function addLocal(list: LocalNotice[], n: LocalNotice, now = Date.now()): LocalNotice[] {
  return [n, ...list.filter((x) => !(x.notificationId === n.notificationId && at(x) > now))]
    .filter((x) => now - at(x) < MAX_AGE_MS)
    .sort(newestFirst)
    .slice(0, KEEP);
}

/** A scheduled notification was taken back before it showed. */
export function cancelLocalEntry(list: LocalNotice[], notificationId: string, now = Date.now()): LocalNotice[] {
  return list.filter((x) => !(x.notificationId === notificationId && at(x) > now));
}

/** Delete one from the Notifications page (by its key). */
export function removeLocal(list: LocalNotice[], key: string): LocalNotice[] {
  return list.filter((x) => x.key !== key);
}

/** The ones that have shown (in the last 30 days), newest first. */
export function shownLocal(list: LocalNotice[], now = Date.now()): LocalNotice[] {
  return list.filter((x) => at(x) <= now && now - at(x) < MAX_AGE_MS).sort(newestFirst);
}

/** Where tapping a notification goes, from its data (the school's and the phone's alike). */
export function notificationHref(data: Record<string, unknown> | null | undefined): string | null {
  if (!data) return null;
  if (data.carline) return '/carline';
  if (data.listingId) return `/market/${data.listingId}`;
  if (data.opportunityId) return `/volunteer/${data.opportunityId}`;
  if (data.questionId) return `/questions/${data.questionId}`;
  if (data.groupId) return `/group/${data.groupId}`;
  return null;
}
