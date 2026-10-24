import type { CriticalAlert } from '../api/types';

export type AlertChanges = { started: CriticalAlert[]; cleared: CriticalAlert[] };

/** What happened between two looks at the latest alerts. `known` maps each alert id seen so far to whether it had ended. */
export function alertChanges(known: ReadonlyMap<string, boolean>, latest: CriticalAlert[]): AlertChanges {
  return {
    started: latest.filter((a) => !a.endedAt && !known.has(a.id)),
    cleared: latest.filter((a) => !!a.endedAt && known.get(a.id) === false),
  };
}
