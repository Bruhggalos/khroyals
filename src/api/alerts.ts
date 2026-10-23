import { subscribeChanges } from './realtime';
import { enumValue } from './validation';
/** alerts: internal API implementation. Screens import the connect facade. */
import type { AlertKind } from '../alerts/kinds';
import type { AlertAnswer, AlertStatusRow, CriticalAlert } from './types';
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

export function subscribeAlerts(onChange: () => void): () => void {
  return subscribeChanges('subscribeAlerts', [{ event: '*', table: 'critical_alerts' }, { event: '*', table: 'critical_alert_responses' }], onChange);
}
