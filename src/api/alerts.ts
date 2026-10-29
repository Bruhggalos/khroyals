import { subscribeChanges } from './realtime';
import { enumValue } from './validation';
/** alerts: internal API implementation. Screens import the connect facade. */
import type { AlertKind } from '../alerts/kinds';
import type { AccessPoint, AlertAnswer, AlertStatusRow, CriticalAlert } from './types';
import type { ApRow } from '../alerts/whereabouts';
import { live, rpc, run, sb } from './client';
import { current } from './session';
import { toAlert } from './mappers';

/** The latest alerts, newest first (teachers and staff only; everyone else gets none). */
export async function listAlerts(limit = 20): Promise<CriticalAlert[]> {
  if (!live || !current) return [];
  return (await run(sb().from('critical_alerts').select('*').order('created_at', { ascending: false }).limit(limit))).map(toAlert);
}

export async function myAlertAnswers(): Promise<AlertAnswer[]> {
  if (!live || !current) return [];
  return (await run(sb().from('critical_alert_responses').select('*').eq('user_id', current.id))).map((r) => ({
    alertId: r.alert_id, userId: r.user_id, status: enumValue(r.status, ['safe', 'help']), note: r.note, updatedAt: r.updated_at,
  }));
}

export async function sendCriticalAlert(kind: AlertKind, title: string, body: string): Promise<CriticalAlert> {
  return toAlert(await rpc('critical_alert_send', { p_kind: kind, p_title: title, p_body: body }));
}

export async function answerAlert(alertId: string, status: 'safe' | 'help', note?: string | null) {
  await rpc('critical_alert_respond', { p_alert: alertId, p_status: status, p_note: note?.trim() || null });
}

export async function endAlert(alertId: string, note?: string | null) {
  await rpc('critical_alert_end', { p_alert: alertId, p_note: note?.trim() || null });
}

export async function alertStatus(alertId: string): Promise<AlertStatusRow[]> {
  return (await rpc('critical_alert_status', { p_alert: alertId })) as AlertStatusRow[];
}

/** Where the phone was when it answered; sent right after the answer. Kept only if they agreed to share it. */
export async function shareAlertLocation(alertId: string, fix: {
  lat: number | null; lng: number | null; accuracy: number | null; at: string | null; bssid: string | null; ssid: string | null;
  error: 'denied' | 'unavailable' | null;
}) {
  await rpc('critical_alert_share_location', {
    p_alert: alertId, p_lat: fix.lat, p_lng: fix.lng, p_accuracy: fix.accuracy, p_located_at: fix.at,
    p_bssid: fix.bssid, p_ssid: fix.ssid, p_error: fix.error,
  });
}

/** Whether the signed-in person agreed to share their location with alert answers (null: not asked yet). */
export async function myLocationConsent(): Promise<boolean | null> {
  if (!live || !current) return null;
  const rows = await run(sb().from('location_consents').select('allowed').eq('user_id', current.id));
  return rows[0]?.allowed ?? null;
}

export async function setLocationConsent(allowed: boolean) { await rpc('alert_location_consent', { p_allowed: allowed }); }

/** The Alert map: the school's Wi-Fi access points and where each one is. */
export async function listAccessPoints(): Promise<AccessPoint[]> {
  if (!live || !current) return [];
  const rows = await run(sb().from('wifi_access_points').select('*').order('building').order('floor').order('place'));
  return rows.map((r) => ({ bssid: r.bssid, place: r.place, building: r.building, floor: r.floor, notes: r.notes, updatedAt: r.updated_at }));
}

/** Add or change one; `oldBssid` when the BSSID itself was corrected. */
export async function saveAccessPoint(ap: ApRow, oldBssid?: string | null) {
  await rpc('wifi_ap_save', { p_bssid: ap.bssid, p_place: ap.place, p_building: ap.building, p_floor: ap.floor, p_notes: ap.notes, p_old: oldBssid ?? null });
}

export async function deleteAccessPoint(bssid: string) { await rpc('wifi_ap_delete', { p_bssid: bssid }); }

/** Add or update many at once (all or none). Returns how many were saved. */
export async function importAccessPoints(rows: ApRow[]): Promise<number> {
  return Number(await rpc('wifi_ap_import', { p_rows: rows }));
}

export function subscribeAlerts(onChange: () => void): () => void {
  return subscribeChanges('subscribeAlerts', [{ event: '*', table: 'critical_alerts' }, { event: '*', table: 'critical_alert_responses' }], onChange);
}
