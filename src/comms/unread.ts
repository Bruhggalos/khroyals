/**
 * The bell's count: the school's notifications this person hasn't opened yet (the ones on the bell page). One
 * count for every bell, kept current while the app runs: a new notification for them (realtime), a push
 * arriving, the app coming back to the front, signing in or out, and the bell page opening them.
 */
import { useEffect, useState } from 'react';
import { AppState, Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import { hasSignIn, live, onAuthChange, subscribeNotifications, unreadNotificationCount } from '../api/connect';

let count = 0;
let asked = 0;   // the newest request wins
const listeners = new Set<(n: number) => void>();
let stop: (() => void) | null = null;

function set(n: number) {
  if (n === count) return;
  count = n;
  listeners.forEach((l) => l(n));
}

/** Ask the server for the count again. */
export function refreshUnread() {
  if (!live) return;
  const mine = ++asked;
  hasSignIn().then((signedIn) => (signedIn ? unreadNotificationCount() : 0))
    .then((n) => { if (mine === asked) set(n); })
    .catch(() => {});
}

/** The bell page has just opened everything it shows. */
export function clearUnread() {
  asked++;
  set(0);
}

function start() {
  let offRealtime = subscribeNotifications(refreshUnread);
  const offAuth = onAuthChange(() => {
    // A new channel, so realtime sends the rows the person now signed in may see.
    offRealtime(); offRealtime = subscribeNotifications(refreshUnread);
    refreshUnread();
  });
  const foreground = AppState.addEventListener('change', (s) => { if (s === 'active') refreshUnread(); });
  const pushed = Platform.OS === 'web' ? null : Notifications.addNotificationReceivedListener(refreshUnread);
  refreshUnread();
  return () => { offRealtime(); offAuth(); foreground.remove(); pushed?.remove(); };
}

/** The current count; the first bell on screen starts keeping it current, the last one stops. */
export function useUnreadCount(): number {
  const [n, setN] = useState(count);
  useEffect(() => {
    listeners.add(setN);
    if (!stop) stop = start();
    setN(count);
    return () => {
      listeners.delete(setN);
      if (!listeners.size && stop) { stop(); stop = null; }
    };
  }, []);
  return n;
}
