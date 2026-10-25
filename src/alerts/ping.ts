/**
 * Pings for a critical alert while the app is running: a new alert rings and buzzes the phone,
 * and the all clear is announced. The school's push does this too when the phone is set up for
 * push (and works with the app closed); this covers phones without it, and any alert the app
 * learns of before the push arrives. Both go through notifyLocal, so they reach the bell page.
 */
import { Vibration } from 'react-native';
import type { CriticalAlert } from '../api/connect';
import { pushRegistered } from '../comms/push';
import { notifyLocal } from '../comms/localInbox';
import { alertKind } from './kinds';
import { BUZZ, EMERGENCY_CHANNEL } from './loudness';

export async function pingStarted(a: CriticalAlert) {
  Vibration.vibrate(BUZZ);
  if (pushRegistered()) return;  // the push rings for it
  await notifyLocal({ title: `${alertKind(a.kind).label}: ${a.title}`, body: a.body || 'Open KH Royals for details.', data: { alertId: a.id, kind: a.kind, critical: true }, sound: true },
    { id: `alert-${a.id}`, channelId: EMERGENCY_CHANNEL }).catch(() => {});
}

export async function pingCleared(a: CriticalAlert) {
  Vibration.vibrate([0, 300, 150, 300]);
  if (pushRegistered()) return;
  await notifyLocal({ title: `✅ All clear: ${a.title}`, body: a.endNote || 'The alert is over.', data: { alertId: a.id, kind: a.kind }, sound: true },
    { id: `allclear-${a.id}`, channelId: EMERGENCY_CHANNEL }).catch(() => {});
}
