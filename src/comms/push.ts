/**
 * Push notifications through Expo's free push service. After sign-in the phone
 * asks permission (iOS: "Allow notifications?"), gets an Expo push token and
 * registers it with the backend; the send-push Edge Function delivers to it.
 * Tapping a notification opens what it's about.
 *
 * Delivery needs an Expo project id (app.json → extra.eas.projectId, from
 * `eas init`) plus an APNs key (iPhone) or Firebase credentials (Android) in
 * that Expo project. Until then the phone still asks permission, so the app's
 * own notifications (car line) work, and the school's still reach the
 * Notifications page; they just don't buzz the phone.
 */
import { Platform } from 'react-native';
import Constants from 'expo-constants';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import { router } from 'expo-router';
import { markNotificationsOpened, registerPushToken, session, unregisterPushToken } from '../api/connect';
import { handleCarlineResponse } from '../carline/autoCheckIn';
import { notificationHref } from './inbox';
import { clearLocalNotifications } from './localInbox';
import appJson from '../../app.json';

Notifications.setNotificationHandler({
  handleNotification: async () => ({ shouldShowBanner: true, shouldShowList: true, shouldPlaySound: true, shouldSetBadge: false }),
});

let token: string | null = null;

/** True once this phone is registered for the school's pushes (they ring for alerts, so the app needn't). */
export const pushRegistered = (): boolean => token !== null;

export type PushState = 'on' | 'denied' | 'unsupported' | 'not-configured' | 'error';
export type Permission = 'granted' | 'denied' | 'undetermined' | 'unsupported';

const projectId = (): string | undefined => (Constants.expoConfig?.extra as any)?.eas?.projectId
  ?? (Constants as any).easConfig?.projectId ?? (appJson as any).expo?.extra?.eas?.projectId;

/**
 * Ask to show notifications (once; iOS won't ask again after "Don't Allow"), then register for the school's pushes.
 * `critical`: teachers and staff, who get critical alerts. iPhone also asks to let those ring on silent (only once
 * the app has Apple's Critical Alerts entitlement; until then iOS skips that question).
 */
export async function enablePush(opts: { critical?: boolean } = {}): Promise<{ state: PushState; detail?: string }> {
  if (Platform.OS === 'web') return { state: 'unsupported', detail: 'Notifications need the Android or iPhone app.' };
  try {
    if (Platform.OS === 'android') {  // Android 13+ only asks once a channel exists
      await Notifications.setNotificationChannelAsync('default', { name: 'Royals Connect', importance: Notifications.AndroidImportance.HIGH });
      await Notifications.setNotificationChannelAsync('critical', {
        name: 'Critical alerts', description: 'Severe weather, lockdowns and other emergencies from the school administration.',
        importance: Notifications.AndroidImportance.MAX, bypassDnd: true, enableVibrate: true, vibrationPattern: [0, 600, 300, 600, 300, 600],
        lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC, sound: 'default',
      });
    }
    let perm = await Notifications.getPermissionsAsync();
    if (perm.status !== 'granted' && perm.canAskAgain) perm = await Notifications.requestPermissionsAsync();
    if (perm.status === 'granted' && opts.critical && Platform.OS === 'ios' && !perm.ios?.allowsCriticalAlerts) {
      perm = await Notifications.requestPermissionsAsync({ ios: { allowAlert: true, allowBadge: true, allowSound: true, allowCriticalAlerts: true } });
    }
    if (perm.status !== 'granted') return { state: 'denied', detail: 'Notifications are turned off for KH Royals in your phone\'s Settings.' };
    if (!Device.isDevice) return { state: 'unsupported', detail: 'The school\'s pushes need a real phone; simulators only show the app\'s own notifications.' };
    const id = projectId();
    if (!id) return { state: 'not-configured', detail: 'Push isn\'t set up for this build yet (missing Expo project id).' };
    token = (await Notifications.getExpoPushTokenAsync({ projectId: id })).data;
    await registerPushToken(token, Platform.OS);
    return { state: 'on' };
  } catch (e: any) {
    return { state: 'error', detail: e.message };
  }
}

/** For the Notifications page: may this phone show notifications, and can the school's pushes reach it? */
export async function pushStatus(): Promise<{ permission: Permission; delivered: boolean }> {
  if (Platform.OS === 'web') return { permission: 'unsupported', delivered: false };
  const { status } = await Notifications.getPermissionsAsync();
  return { permission: status as Permission, delivered: Device.isDevice && !!projectId() };
}

/** Stop notifications to this device (on sign-out), and forget its own ones. */
export async function disablePush() {
  if (token) await unregisterPushToken(token).catch(() => {});
  token = null;
  await clearLocalNotifications();
}

/** Act on a tapped notification (car line Cancel, or open what it's about). Returns an unsubscribe function. */
export function handleNotificationTaps(): () => void {
  if (Platform.OS === 'web') return () => {};
  const open = (r: Notifications.NotificationResponse) => {
    Notifications.clearLastNotificationResponse();  // so the next launch doesn't replay it
    if (handleCarlineResponse(r)) return;
    const data: any = r.notification.request.content.data;
    // Count the open for the sender (the app may have just started, so load the session first).
    if (data?.notificationId) session().then(() => markNotificationsOpened([data.notificationId])).catch(() => {});
    const href = notificationHref(data);
    if (href) router.push(href);
  };
  const last = Notifications.getLastNotificationResponse();
  if (last) open(last);
  const sub = Notifications.addNotificationResponseReceivedListener(open);
  return () => sub.remove();
}
