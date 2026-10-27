/** The car line's big-screen board (app/carline-board.tsx): order and sizes, with no app imports (so tests run it). */

type Row = { status: 'waiting' | 'picked_up'; arrivedAt: string; pickedUpAt: string | null };

const at = (iso: string | null) => (iso ? Date.parse(iso) : 0);

/**
 * Cars still waiting first, in the order they arrived (first in line at the top); then the
 * children already picked up, most recent first, so a row drops below the line as soon as
 * staff confirm it.
 */
export function boardOrder<T extends Row>(rows: T[]): { waiting: T[]; done: T[] } {
  return {
    waiting: rows.filter((r) => r.status === 'waiting').sort((a, b) => at(a.arrivedAt) - at(b.arrivedAt)),
    done: rows.filter((r) => r.status === 'picked_up').sort((a, b) => at(b.pickedUpAt) - at(a.pickedUpAt)),
  };
}

/**
 * Cars that checked in since the board last loaded: waiting rows it hadn't seen (they set off the
 * ripples around the shield). None on the first load (`seen` null), so opening the board is quiet;
 * an undone pickup keeps its id, so it isn't new.
 */
export function newArrivals<T extends Row & { id: string }>(seen: ReadonlySet<string> | null, rows: T[]): T[] {
  return seen ? rows.filter((r) => r.status === 'waiting' && !seen.has(r.id)) : [];
}

/** "Avery Johnson" → ["A", "very Johnson"]: on a birthday the crown hangs off the first letter. */
export function splitInitial(name: string): [string, string] {
  const [first = '', ...rest] = Array.from(name.trim());
  return [first, rest.join('')];
}

/** How long a birthday fanfare stays on the board; several birthdays announced together take turns. */
export const FANFARE_MS = 6000;

/** Arrived in the last minute: marked New so staff notice the car. */
export const isNew = (arrivedAt: string, now = Date.now()) => now - at(arrivedAt) < 60_000;

/** Waiting this long or more: the minutes turn amber. */
export const LONG_WAIT_MINUTES = 10;

/** The board's base text size: grows with the screen so it reads from across a room. */
export const boardTextSize = (width: number) => Math.round(Math.min(30, Math.max(15, width / 64)));
