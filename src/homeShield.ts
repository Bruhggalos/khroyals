/**
 * The Home button in the middle of the tab bar, so the welcome screen's shield can fly into it after
 * sign-in (src/AccountGate.tsx): the tab button registers itself, and the welcome screen asks where
 * it is on screen. No app imports, so tests run `flightPath`.
 */
import type { View } from 'react-native';

export type Frame = { x: number; y: number; width: number; height: number };

let home: { current: View | null } | null = null;

/** The tab bar's Home button, while it's mounted (null when it unmounts). */
export function setHomeButton(ref: { current: View | null } | null) { home = ref; }

/** Where a view is on screen, or null if it isn't laid out (or doesn't answer in time). */
export function frameOf(view: View | null | undefined): Promise<Frame | null> {
  return new Promise((resolve) => {
    if (!view) return resolve(null);
    const t = setTimeout(() => resolve(null), 300);
    view.measureInWindow((x, y, width, height) => { clearTimeout(t); resolve(width > 0 && height > 0 ? { x, y, width, height } : null); });
  });
}

export const homeButtonFrame = () => frameOf(home?.current);

let hidden = false;
const watchers = new Set<(hidden: boolean) => void>();

/** While the welcome screen's shield is on its way, the Home button stays out of sight so there's only ever one shield. */
export function hideHomeButton(h: boolean) { hidden = h; watchers.forEach((w) => w(h)); }

/** The Home button follows hideHomeButton (told straight away); returns the unsubscribe. */
export function watchHomeButton(w: (hidden: boolean) => void) {
  watchers.add(w);
  w(hidden);
  return () => { watchers.delete(w); };
}

/** How far to move the shield (center to center) and how much to shrink it to land on the Home button. */
export function flightPath(from: Frame, to: Frame) {
  return {
    dx: to.x + to.width / 2 - (from.x + from.width / 2),
    dy: to.y + to.height / 2 - (from.y + from.height / 2),
    scale: to.width / from.width,
  };
}
