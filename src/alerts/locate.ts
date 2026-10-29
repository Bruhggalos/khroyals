/**
 * Where the phone is when its owner answers a critical alert: a GPS fix (with its accuracy) and
 * the Wi-Fi access point it's connected to (BSSID, the access point's MAC address). The phone
 * asked for permission once, when they agreed (LocationConsent); only the web asks here. Gives up on GPS
 * after a few seconds and uses the last fix from the past few minutes instead.
 */
import { Platform } from 'react-native';
import * as Location from 'expo-location';
import NetInfo from '@react-native-community/netinfo';
import { normalizeMac } from './whereabouts';

export type Fix = {
  lat: number | null; lng: number | null; accuracy: number | null; at: string | null;
  bssid: string | null; ssid: string | null; error: 'denied' | 'unavailable' | null;
};

const within = <T,>(p: Promise<T>, ms: number) =>
  Promise.race([p, new Promise<null>((resolve) => setTimeout(() => resolve(null), ms))]);

/** The access point the phone is on (Android, and iPhone with location allowed); null on cellular or the web. */
export async function currentAccessPoint(): Promise<{ bssid: string | null; ssid: string | null }> {
  if (Platform.OS === 'web') return { bssid: null, ssid: null };
  try {
    NetInfo.configure({ shouldFetchWiFiSSID: true });
    const st = await NetInfo.fetch('wifi');
    const d = st.type === 'wifi' ? (st.details as { bssid?: string | null; ssid?: string | null } | null) : null;
    const bssid = normalizeMac(d?.bssid);
    // Android reports 02:00:00:00:00:00 when it won't say.
    return { bssid: bssid === '02:00:00:00:00:00' ? null : bssid, ssid: d?.ssid?.trim() || null };
  } catch {
    return { bssid: null, ssid: null };
  }
}

export async function locate(timeoutMs = 8000): Promise<Fix> {
  const none = { lat: null, lng: null, accuracy: null, at: null };
  let perm: Location.PermissionResponse | null = null;
  try {
    perm = await Location.getForegroundPermissionsAsync();
    // The web has no prompt at sign-in; the browser asks the first time an answer is sent.
    if (!perm.granted && Platform.OS === 'web' && perm.canAskAgain) perm = await Location.requestForegroundPermissionsAsync();
  } catch { /* treated as denied */ }
  const ap = perm?.granted ? await currentAccessPoint() : { bssid: null, ssid: null };
  if (!perm?.granted) return { ...none, ...ap, error: 'denied' };
  try {
    const pos = (await within(Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High }), timeoutMs))
      ?? (await Location.getLastKnownPositionAsync({ maxAge: 5 * 60_000 }));
    if (!pos) return { ...none, ...ap, error: ap.bssid ? null : 'unavailable' };
    return {
      lat: pos.coords.latitude, lng: pos.coords.longitude, accuracy: pos.coords.accuracy ?? null,
      at: new Date(pos.timestamp).toISOString(), ...ap, error: null,
    };
  } catch {
    return { ...none, ...ap, error: ap.bssid ? null : 'unavailable' };
  }
}
