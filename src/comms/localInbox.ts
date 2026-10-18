/**
 * Notifications the phone shows by itself (the car line's "You're checked in"
 * and "The car line is open"), kept on the phone so the Notifications page lists
 * them beside the school's. Show every on-device notification with
 * notifyLocal(), never Notifications.scheduleNotificationAsync directly
 * (tests/inbox.test.ts checks), so nothing the phone shows is missing there.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Notifications from 'expo-notifications';
import { addLocal, cancelLocalEntry, removeLocal, shownLocal, type LocalNotice } from './inbox';

const KEY = 'khroyals.localNotifications';

async function read(): Promise<LocalNotice[]> {
  try {
    return JSON.parse((await AsyncStorage.getItem(KEY)) ?? '[]');
  } catch {
    return [];
  }
}
const write = (list: LocalNotice[]) => AsyncStorage.setItem(KEY, JSON.stringify(list)).catch(() => {});

type Content = { title: string; body: string; data?: Record<string, unknown>; categoryIdentifier?: string };

/**
 * Show a notification now, or at `at`. It joins the Notifications page from the moment it shows,
 * even if notifications are off for the app (it's recorded before the phone is asked to show it).
 */
export async function notifyLocal(content: Content, opts: { id?: string; at?: Date } = {}): Promise<string> {
  const id = opts.id ?? `local-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  const showAt = (opts.at ?? new Date()).toISOString();
  await write(addLocal(await read(), {
    key: `${id}@${showAt}`, notificationId: id, title: content.title, body: content.body, data: content.data ?? {}, showAt,
  }));
  await Notifications.scheduleNotificationAsync({
    identifier: id,
    content,
    trigger: opts.at ? { type: Notifications.SchedulableTriggerInputTypes.DATE, date: opts.at } : null,
  });
  return id;
}

/** Take back a scheduled notification that hasn't shown yet (it won't appear on the page either). */
export async function cancelLocal(id: string) {
  await Notifications.cancelScheduledNotificationAsync(id).catch(() => {});
  await write(cancelLocalEntry(await read(), id));
}

/** This phone's own notifications that have shown, newest first. */
export async function localNotifications(): Promise<LocalNotice[]> {
  return shownLocal(await read());
}

/** Delete one from the Notifications page. */
export async function dismissLocal(key: string) {
  await write(removeLocal(await read(), key));
}

/** Forget them all (sign-out, or "Clear all" on the Notifications page). */
export async function clearLocalNotifications() {
  await AsyncStorage.removeItem(KEY).catch(() => {});
}
