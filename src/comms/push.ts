/**
 * Push notifications through Expo's free push service. After sign-in the
 * device asks permission, gets an Expo push token and registers it with the
 * backend; the send-push Edge Function delivers to it. Tapping a notification
 * opens its group.
 *
 * Needs an Expo project id (app.json → extra.eas.projectId, from `eas init`)
 * and, for Android, Firebase credentials (google-services.json). Until those
 * exist registration is skipped and the app works without push.
 */
import { Platform } from 'react-native';
import Constants from 'expo-constants';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import { router } from 'expo-router';
import { registerPushToken, unregisterPushToken } from '../api/connect';
import appJson from '../../app.json';

Notifications.setNotificationHandler({
  handleNotification: async () => ({ shouldShowBanner: true, shouldShowList: true, shouldPlaySound: true, shouldSetBadge: false }),
});

let token: string | null = null;

export type PushState = 'on' | 'denied' | 'unsupported' | 'not-configured' | 'error';

export async function enablePush(): Promise<{ state: PushState; detail?: string }> {
  if (Platform.OS === 'web' || !Device.isDevice) return { state: 'unsupported', detail: 'Push needs the Android or iPhone app on a real device.' };
  const projectId = (Constants.expoConfig?.extra as any)?.eas?.projectId ?? (Constants as any).easConfig?.projectId
    ?? (appJson as any).expo?.extra?.eas?.projectId;
  if (!projectId) return { state: 'not-configured', detail: 'Push isn\'t set up for this build yet (missing Expo project id).' };
  try {
    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync('default', { name: 'Royals Connect', importance: Notifications.AndroidImportance.HIGH });
    }
    let { status } = await Notifications.getPermissionsAsync();
    if (status !== 'granted') status = (await Notifications.requestPermissionsAsync()).status;
    if (status !== 'granted') return { state: 'denied', detail: 'Notifications are turned off in your phone\'s settings.' };
    token = (await Notifications.getExpoPushTokenAsync({ projectId })).data;
    await registerPushToken(token, Platform.OS);
    return { state: 'on' };
  } catch (e: any) {
    return { state: 'error', detail: e.message };
  }
}

/** Stop pushes to this device (on sign-out). */
export async function disablePush() {
  if (token) await unregisterPushToken(token).catch(() => {});
  token = null;
}

/** Open the group a tapped notification belongs to. Returns an unsubscribe function. */
export function handleNotificationTaps(): () => void {
  if (Platform.OS === 'web') return () => {};
  const open = (data: any) => { if (data?.groupId) router.push(`/group/${data.groupId}`); };
  Notifications.getLastNotificationResponseAsync().then((r) => r && open(r.notification.request.content.data));
  const sub = Notifications.addNotificationResponseReceivedListener((r) => open(r.notification.request.content.data));
  return () => sub.remove();
}
