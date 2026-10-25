/**
 * How loud a critical alert is on this phone, and the phone settings that make it ring.
 *
 * Android: alerts use the "Emergency alerts" channel. Its sound plays at alarm volume, so the
 * silent and vibrate modes don't mute it, and it shows on the lock screen. Ringing through Do Not
 * Disturb also needs "Do Not Disturb access" for the app (a system setting the person turns on);
 * once it's on, the channel is set again so Android lets it bypass Do Not Disturb.
 *
 * iPhone: alerts are Time Sensitive (they break through Focus). Ringing on silent needs Apple's
 * Critical Alerts entitlement; once a build has it, the phone asks staff to allow critical alerts.
 *
 * The school's push (send-push → `delivery.ts`) names the same channel: change both together.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Alert, Linking, Platform } from 'react-native';
import * as Notifications from 'expo-notifications';

export const EMERGENCY_CHANNEL = 'emergency';
export const BUZZ = [0, 600, 300, 600, 300, 600];

/** Create the app's notification channels (Android; a no-op elsewhere). Safe to call often. */
export async function setUpChannels() {
  if (Platform.OS !== 'android') return;
  await Notifications.setNotificationChannelAsync('default', { name: 'Royals Connect', importance: Notifications.AndroidImportance.HIGH });
  await Notifications.setNotificationChannelAsync(EMERGENCY_CHANNEL, {
    name: 'Emergency alerts',
    description: 'Severe weather, lockdowns and other emergencies from the school administration. Rings at alarm volume, even on silent.',
    importance: Notifications.AndroidImportance.MAX, bypassDnd: true, enableVibrate: true, vibrationPattern: BUZZ,
    lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC, sound: 'default',
    audioAttributes: { usage: Notifications.AndroidAudioUsage.ALARM, contentType: Notifications.AndroidAudioContentType.SONIFICATION },
  });
  // The first version's channel played at notification volume; channels can't change that once made.
  await Notifications.deleteNotificationChannelAsync('critical').catch(() => {});
}

export type AlertReadiness = {
  /** Notifications are allowed for the app. */
  allowed: boolean;
  /** Android: alerts ring through Do Not Disturb. iPhone: alerts ring on silent and Do Not Disturb. */
  ringsThroughDnd: boolean;
};

export async function alertReadiness(): Promise<AlertReadiness | null> {
  if (Platform.OS === 'web') return null;
  const perm = await Notifications.getPermissionsAsync();
  const allowed = perm.status === 'granted';
  if (Platform.OS === 'ios') return { allowed, ringsThroughDnd: allowed && !!perm.ios?.allowsCriticalAlerts };
  await setUpChannels();  // picks up Do Not Disturb access granted since the channel was made
  const channel = await Notifications.getNotificationChannelAsync(EMERGENCY_CHANNEL);
  return { allowed, ringsThroughDnd: allowed && !!channel?.bypassDnd };
}

/** Android: open the system list where the person gives KH Royals Do Not Disturb access. */
export async function openDndAccess() {
  try {
    await Linking.sendIntent('android.settings.NOTIFICATION_POLICY_ACCESS_SETTINGS');
  } catch {
    await Linking.openSettings();
  }
}

const ASKED = 'khroyals.askedDndAccess';

/**
 * Staff on Android: ask once whether emergency alerts may ring through Do Not Disturb, and open
 * the setting if so. Profile → Emergency alerts shows the same choice later.
 */
export async function offerDndAccess() {
  if (Platform.OS !== 'android') return;
  const ready = await alertReadiness();
  if (!ready?.allowed || ready.ringsThroughDnd) return;
  try {
    if (await AsyncStorage.getItem(ASKED)) return;
    await AsyncStorage.setItem(ASKED, '1');
  } catch { return; }
  Alert.alert('Emergency alerts',
    'Let school emergency alerts (lockdowns, severe weather) ring even when Do Not Disturb is on? '
    + 'On the next screen, turn on Do Not Disturb access for KH Royals.',
    [{ text: 'Not now', style: 'cancel' }, { text: 'Allow', onPress: () => { openDndAccess(); } }]);
}
