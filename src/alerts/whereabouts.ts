/**
 * Where someone was when they answered a critical alert, as the senders read it, and the
 * access point list IT pastes into the Alert map. No app imports, so tests run it.
 */

/** The location parts of a roll call row (critical_alert_status). */
export type Located = {
  status: 'safe' | 'help' | 'none';
  lat?: number | null; lng?: number | null; accuracy?: number | null; locatedAt?: string | null;
  bssid?: string | null; ssid?: string | null;
  place?: { place: string; building: string; floor: string; approx: boolean } | null;
  locationError?: 'no_consent' | 'denied' | 'unavailable' | null;
  consent?: boolean | null;
};

/** "Room 112 · Main building · 1st floor" (with "probably" when matched on a sibling radio). */
export function placeLine(r: Located): string | null {
  if (!r.place) return null;
  const parts = [r.place.place, r.place.building, r.place.floor].filter((x) => x && x.trim());
  return `${r.place.approx ? 'Probably ' : ''}${parts.join(' · ')}`;
}

/** "Within 12 m" / "Within about 1.2 km", from the phone's GPS accuracy. */
export function accuracyLine(m: number | null | undefined): string | null {
  if (m == null) return null;
  if (m < 1000) return `Within ${Math.max(1, Math.round(m))} m`;
  return `Within about ${(m / 1000).toFixed(1)} km`;
}

/** Why there's no location to show, or null when there is one (or they haven't answered). */
export function noLocationReason(r: Located): string | null {
  if (r.status === 'none') return null;
  const has = r.lat != null || !!r.bssid;
  if (has) return null;
  if (r.locationError === 'no_consent' || r.consent === false) return 'They chose not to share their location.';
  if (r.locationError === 'denied') return 'Location is turned off for the app on their phone.';
  if (r.locationError === 'unavailable') return 'Their phone couldn’t find its location in time.';
  return 'No location came with this answer.';
}

/** A short line for the roll call: the place on the map, else how close the GPS fix is. */
export function shortWhere(r: Located): string | null {
  return placeLine(r) ?? (r.lat != null ? `GPS ${accuracyLine(r.accuracy)?.toLowerCase() ?? 'location'}` : null);
}

/** A Maps link to the spot (Apple Maps on iPhone, the map app on Android, Google Maps elsewhere). */
export function mapsUrl(lat: number, lng: number, os: string, label = 'Answered here') {
  const q = encodeURIComponent(label);
  if (os === 'ios') return `https://maps.apple.com/?ll=${lat},${lng}&q=${q}`;
  if (os === 'android') return `geo:${lat},${lng}?q=${lat},${lng}(${q})`;
  return `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`;
}

/** "AA-BB-CC-DD-EE-FF", "aabb.ccdd.eeff" or "aabbccddeeff" → "aa:bb:cc:dd:ee:ff"; null if it isn't one. */
export function normalizeMac(m: string | null | undefined): string | null {
  const x = (m ?? '').toLowerCase().replace(/[^0-9a-f]/g, '');
  return x.length === 12 ? x.match(/../g)!.join(':') : null;
}

export type ApRow = { bssid: string; place: string; building: string; floor: string; notes: string };

/**
 * The list IT pastes: one access point a line, "BSSID, place, building, floor, notes" (commas or
 * tabs, so a spreadsheet's columns paste straight in). A header line and blank lines are skipped.
 */
export function parseApList(text: string): { rows: ApRow[]; errors: string[] } {
  const rows: ApRow[] = [];
  const errors: string[] = [];
  text.split(/\r?\n/).forEach((line, i) => {
    if (!line.trim()) return;
    const cells = line.split(line.includes('\t') ? '\t' : ',').map((c) => c.trim().replace(/^"(.*)"$/, '$1').trim());
    const bssid = normalizeMac(cells[0]);
    if (!bssid) {
      if (i === 0 && /bssid|mac/i.test(cells[0])) return;  // the header
      errors.push(`Line ${i + 1}: "${cells[0]}" isn't a MAC address.`);
      return;
    }
    if (!cells[1]) { errors.push(`Line ${i + 1}: say where ${bssid} is.`); return; }
    rows.push({ bssid, place: cells[1], building: cells[2] ?? '', floor: cells[3] ?? '', notes: cells.slice(4).join(', ') });
  });
  return { rows, errors };
}
