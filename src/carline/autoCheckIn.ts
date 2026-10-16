/**
 * Automatic car line check-in (opt-in, iPhone and Android).
 *
 * A geofence around the car line wakes the app when the parent's phone arrives.
 * The server checks their children in if the line is open (carline_arrived()
 * decides: pickup hours on school days) and the app posts "You're checked in"
 * with a Cancel button. Arriving shortly before the line opens schedules a
 * reminder for opening time instead, dropped again if they leave. The phone's
 * location stays on the phone; the server only hears "I've arrived".
 *
 * Geofence events can start the app in the background, so the task has to be
 * defined as the bundle loads: index.js imports this file before expo-router.
 */
import { Platform } from 'react-native';
import * as Location from 'expo-location';
import * as Notifications from 'expo-notifications';
import * as TaskManager from 'expo-task-manager';
import { router } from 'expo-router';
import { carlineArrived, carlineCancel, carlineConfig, type Arrival } from '../api/connect';

const TASK = 'carline-arrival';
const CATEGORY = 'carline-checked-in';
const CANCEL = 'carline-cancel';
const REMINDER = 'carline-opens';
/** Only remind people who arrive this close to opening time (not, say, at morning drop-off). */
const REMIND_WITHIN_MS = 45 * 60_000;

export const autoCheckInSupported = Platform.OS === 'ios' || Platform.OS === 'android';

const list = (n: string[]) => (n.length < 2 ? n.join('') : `${n.slice(0, -1).join(', ')} and ${n[n.length - 1]}`);

const setUpCategory = () => Notifications.setNotificationCategoryAsync(CATEGORY, [
  { identifier: CANCEL, buttonTitle: 'Cancel check-in', options: { isDestructive: true, opensAppToForeground: true } },
]);

async function notifyArrival(r: Arrival) {
  if (r.state === 'open' && r.checkedIn.length > 0) {
    await Notifications.cancelScheduledNotificationAsync(REMINDER).catch(() => {});
    await setUpCategory();
    await Notifications.scheduleNotificationAsync({
      content: {
        title: "You're checked in",
        body: `The car line staff know you're here for ${list(r.names)}.`,
        categoryIdentifier: CATEGORY,
        data: { carline: 'checked-in', pickupIds: r.checkedIn },
      },
      trigger: null,
    });
  } else if (r.state === 'early') {
    const opens = new Date(r.opensAt);
    if (opens.getTime() - Date.now() > REMIND_WITHIN_MS) return;
    await Notifications.scheduleNotificationAsync({
      identifier: REMINDER,
      content: { title: 'The car line is open', body: 'Tap to check in.', data: { carline: 'opens' } },
      trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: opens },
    });
  }
}

if (autoCheckInSupported) {
  TaskManager.defineTask<{ eventType: Location.GeofencingEventType }>(TASK, async ({ data, error }) => {
    if (error || !data) return;
    try {
      if (data.eventType === Location.GeofencingEventType.Enter) await notifyArrival(await carlineArrived());
      else await Notifications.cancelScheduledNotificationAsync(REMINDER);
    } catch {
      // Signed out or offline: nothing to do until the next arrival.
    }
  });
}

async function registerZone() {
  const c = await carlineConfig();
  await Location.startGeofencingAsync(TASK, [{
    identifier: 'carline', latitude: c.latitude, longitude: c.longitude, radius: c.radius, notifyOnEnter: true, notifyOnExit: true,
  }]);
}

export async function autoCheckInEnabled(): Promise<boolean> {
  return autoCheckInSupported && (await Location.hasStartedGeofencingAsync(TASK).catch(() => false));
}

/** Turn it on. Asks for location ("Always") and notifications; returns why not if one is refused. */
export async function enableAutoCheckIn(): Promise<string | null> {
  if ((await Location.requestForegroundPermissionsAsync()).status !== 'granted') {
    return 'Location access is off for KH Royals.';
  }
  if ((await Location.requestBackgroundPermissionsAsync()).status !== 'granted') {
    return Platform.OS === 'ios'
      ? 'Set KH Royals location access to "Always" in Settings so it can notice when you arrive.'
      : 'Set KH Royals location access to "Allow all the time" in Settings so it can notice when you arrive.';
  }
  let notes = await Notifications.getPermissionsAsync();
  if (notes.status !== 'granted') notes = await Notifications.requestPermissionsAsync();
  if (notes.status !== 'granted') return 'Turn on notifications for KH Royals so you know when you\'re checked in.';
  await setUpCategory();
  await registerZone();
  return null;
}

export async function disableAutoCheckIn() {
  if (!autoCheckInSupported) return;
  if (await Location.hasStartedGeofencingAsync(TASK).catch(() => false)) await Location.stopGeofencingAsync(TASK);
  await Notifications.cancelScheduledNotificationAsync(REMINDER).catch(() => {});
}

/** Keep the zone in step with the school's settings (called when the Car Line screen opens). */
export async function refreshAutoCheckIn() {
  if (await autoCheckInEnabled()) await registerZone().catch(() => {});
}

/** Taps on car line notifications. Returns true if the response was one of ours. */
export function handleCarlineResponse(r: Notifications.NotificationResponse): boolean {
  const data = r.notification.request.content.data as { carline?: string; pickupIds?: string[] } | undefined;
  if (data?.carline === 'checked-in') {
    const cancel = r.actionIdentifier === CANCEL
      ? Promise.all((data.pickupIds ?? []).map((id) => carlineCancel(id).catch(() => {})))
      : Promise.resolve();
    cancel.finally(() => router.push('/carline'));
    return true;
  }
  if (data?.carline === 'opens') {
    carlineArrived().then(notifyArrival).catch(() => {}).finally(() => router.push('/carline'));
    return true;
  }
  return false;
}
