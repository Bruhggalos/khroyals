/**
 * The app is for approved accounts only (src/AccountGate.tsx covers it otherwise). Where someone
 * stands: still checking, signed out, signed in but waiting for the office's approval, or in.
 * No app imports, so tests run it.
 */
export type Gate = 'checking' | 'out' | 'waiting' | 'in';

export const gateFor = (person: { pending?: boolean } | null): Gate => (!person ? 'out' : person.pending ? 'waiting' : 'in');
