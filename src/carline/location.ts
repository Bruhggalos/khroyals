/**
 * Where the parent is right now, for announcing arrival. The server compares it
 * with the pickup spot and radius the school set; the location isn't stored
 * (only the distance, for staff).
 */
import * as Location from 'expo-location';
import type { Spot } from '../api/connect';

export class LocationError extends Error {}

export async function currentSpot(): Promise<Spot> {
  const perm = await Location.requestForegroundPermissionsAsync();
  if (perm.status !== 'granted') {
    throw new LocationError('Allow location for KH Royals so the school can confirm you\'re at pickup.');
  }
  try {
    const p = await Promise.race([
      Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High }),
      new Promise<never>((_, reject) => setTimeout(() => reject(new Error('timeout')), 15000)),
    ]);
    return { lat: p.coords.latitude, lng: p.coords.longitude, accuracy: p.coords.accuracy ?? null };
  } catch {
    // Slow GPS: a fix from the last two minutes is good enough.
    const last = await Location.getLastKnownPositionAsync({ maxAge: 120_000 }).catch(() => null);
    if (last) return { lat: last.coords.latitude, lng: last.coords.longitude, accuracy: last.coords.accuracy ?? null };
    throw new LocationError('Couldn\'t get your location. Check that location is on, then try again.');
  }
}

/** "350 ft" / "1.2 mi" (US units for families; the database stores metres). */
export function distanceLabel(m: number) {
  return m >= 1609 ? `${(m / 1609.34).toFixed(1)} mi` : `${Math.round(m * 3.28084)} ft`;
}
