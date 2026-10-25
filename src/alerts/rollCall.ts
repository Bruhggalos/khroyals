/**
 * A critical alert's roll call, sorted for the senders: who needs help (soonest first, so
 * the longest waiting is on top), who hasn't answered and who's safe (by name), and which
 * list to open first. No app imports, so tests run it.
 */
import type { AlertStatusRow } from '../api/types';

export type RollCallTab = AlertStatusRow['status'];

const byName = (a: AlertStatusRow, b: AlertStatusRow) => a.name.localeCompare(b.name);
const byTime = (a: AlertStatusRow, b: AlertStatusRow) => (a.updatedAt ?? '').localeCompare(b.updatedAt ?? '') || byName(a, b);

export function rollCall(rows: AlertStatusRow[]) {
  const groups: Record<RollCallTab, AlertStatusRow[]> = {
    help: rows.filter((r) => r.status === 'help').sort(byTime),
    none: rows.filter((r) => r.status === 'none').sort(byName),
    safe: rows.filter((r) => r.status === 'safe').sort(byName),
  };
  /** Open on Need help when someone does, else on who hasn't answered, else on Safe. */
  const first: RollCallTab = groups.help.length ? 'help' : groups.none.length ? 'none' : 'safe';
  return { groups, first };
}
