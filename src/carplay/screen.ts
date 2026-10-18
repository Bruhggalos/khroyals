/**
 * What the CarPlay screen shows. Pure, so tests run it: src/carplay/controller.ts
 * loads the state and hands the result to the native module (modules/carplay).
 *
 * Kept short for the car: one big "I'm here" row, then a row per child with their
 * pickup number, worded like the phone and Android Auto. A row's id says what
 * tapping it does: "checkin:<student ids>" or "cancel:<pickup id>"; checking in
 * sends the phone's location, which the server checks against the pickup spot.
 */
import type { CarItem, CarScreen } from '../../modules/carplay';
import { clock } from '../carline/time';

export type Kid = { id: string; firstName: string; lastName: string; number?: string | null };
export type KidPickup = { id: string; studentId: string; status: 'waiting' | 'picked_up' | 'cancelled'; arrivedAt: string; pickedUpAt: string | null };

export type CarState =
  | { kind: 'offline' }
  | { kind: 'signed-out' }
  | { kind: 'pending' }
  | { kind: 'error'; message: string }
  | { kind: 'parent'; kids: Kid[]; pickups: KidPickup[]; hours?: string; line?: 'open' | 'early' | 'closed' };

const message = (text: string, detail: string, symbol = 'info.circle'): CarScreen => ({
  sections: [{ items: [{ id: '', text, detail, symbol }] }],
});

/** "Emma", "Emma and Noah", "Emma, Noah and Ava". */
export const names = (n: string[]) => (n.length < 2 ? n.join('') : `${n.slice(0, -1).join(', ')} and ${n[n.length - 1]}`);

export function carScreen(state: CarState): CarScreen {
  switch (state.kind) {
    case 'offline': return message('Car line needs the school server', 'This build is running on demo data.');
    case 'signed-out': return message('Sign in on your iPhone', 'Open KH Royals on your phone and sign in to use the car line here.', 'person.crop.circle');
    case 'pending': return message('Waiting for approval', 'The car line opens once the school office approves your account.', 'hourglass');
    case 'error': return message("Couldn't load the car line", state.message, 'exclamationmark.triangle');
    case 'parent': break;
  }
  const { kids, pickups, hours, line } = state;
  const closed = line === 'closed';
  if (kids.length === 0) {
    return message('No children linked yet', 'Add them on your phone under My profile → My children, or ask the school office.', 'person.2');
  }
  // Each child's latest check-in today (cancelled ones don't count), as on the phone.
  const latest = (id: string) => [...pickups].reverse().find((p) => p.studentId === id && p.status !== 'cancelled');
  const ready = kids.filter((k) => !latest(k.id));
  const waiting = kids.filter((k) => latest(k.id)?.status === 'waiting');

  const main: CarItem = waiting.length
    ? { id: '', text: "You're in the car line", detail: 'Staff can see you and your pickup numbers. Pull forward when you\'re waved up.', symbol: 'checkmark.circle.fill' }
    : closed && ready.length
      ? { id: '', text: 'The car line is closed', detail: `It's open on school days${hours ? `, ${hours}` : ''}.`, symbol: 'clock' }
      : ready.length
        ? { id: `checkin:${ready.map((k) => k.id).join(',')}`, text: "I'm here", detail: `Check in ${names(ready.map((k) => k.firstName))}`, symbol: 'car.fill' }
        : { id: '', text: 'Everyone is picked up', detail: 'See you next time!', symbol: 'checkmark.seal.fill' };

  const row = (k: Kid): CarItem => {
    const name = k.number ? `#${k.number}  ${k.firstName} ${k.lastName}`.trim() : `${k.firstName} ${k.lastName}`.trim();
    const p = latest(k.id);
    if (!p) {
      return closed
        ? { id: '', text: name, detail: 'Not checked in', symbol: 'circle' }
        : { id: `checkin:${k.id}`, text: name, detail: 'Not checked in. Tap to check in.', symbol: 'circle' };
    }
    if (p.status === 'waiting') {
      return {
        id: `cancel:${p.id}`, text: name, detail: `In line since ${clock(p.arrivedAt)}. Tap to cancel.`, symbol: 'car.fill',
        confirm: { title: `Cancel ${k.firstName}'s check-in?`, ok: 'Cancel Check-In', cancel: 'Keep' },
      };
    }
    return { id: '', text: name, detail: p.pickedUpAt ? `Picked up at ${clock(p.pickedUpAt)}` : 'Picked up', symbol: 'checkmark.circle.fill' };
  };

  return {
    sections: [
      { header: hours ? `Pickup ${hours}` : undefined, items: [main] },
      // One child: the big row already says it all, but keep theirs for the status and Cancel.
      { header: kids.length > 1 ? 'Your children' : undefined, items: kids.map(row) },
    ],
  };
}

/** What a tapped row asks for. */
export function parseAction(id: string): { checkIn: string[] } | { cancel: string } | null {
  const [verb, arg] = [id.slice(0, id.indexOf(':')), id.slice(id.indexOf(':') + 1)];
  if (verb === 'checkin' && arg) return { checkIn: arg.split(',').filter(Boolean) };
  if (verb === 'cancel' && arg) return { cancel: arg };
  return null;
}
