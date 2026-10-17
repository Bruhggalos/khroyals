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
import { handleCarlineResponse } from '../carline/autoCheckIn';
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

/** Act on a tapped notification (car line, or open its group). Returns an unsubscribe function. */
export function handleNotificationTaps(): () => void {
  if (Platform.OS === 'web') return () => {};
  const open = (r: Notifications.NotificationResponse) => {
    Notifications.clearLastNotificationResponse();  // so the next launch doesn't replay it
    if (handleCarlineResponse(r)) return;
    const data: any = r.notification.request.content.data;
    if (data?.listingId) router.push(`/market/${data.listingId}`);
    else if (data?.opportunityId) router.push(`/volunteer/${data.opportunityId}`);
    else if (data?.questionId) router.push(`/questions/${data.questionId}`);
    else if (data?.groupId) router.push(`/group/${data.groupId}`);
  };
  const last = Notifications.getLastNotificationResponse();
  if (last) open(last);
  const sub = Notifications.addNotificationResponseReceivedListener(open);
  return () => sub.remove();
}
