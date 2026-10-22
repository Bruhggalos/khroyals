/**
 * What the parent's check-in button shows. It always shows: "Check In" during pickup
 * hours, greyed out before and after them, and a green "Checked In!" once everyone
 * you're picking up is in line. No app imports, so tests run it.
 */
export type CheckInButton =
  | { kind: 'ready' }                         // "Check In": choose children and check in
  | { kind: 'checked-in' }                    // "Checked In!": everyone still to pick up is in line
  | { kind: 'outside'; opensAt?: string }     // greyed out: before or after pickup hours (or no school)
  | { kind: 'done' };                         // greyed out: everyone is picked up for today

/**
 * `line`: the car line's state now ('early' is a school day before pickup starts).
 * `waiting` / `ready`: how many of your children are in line / not checked in yet today.
 */
export function checkInButton(line: { state: 'open' | 'early' | 'closed'; opensAt?: string } | undefined,
  waiting: number, ready: number): CheckInButton {
  if (line?.state === 'closed') return { kind: 'outside' };
  if (waiting > 0 && ready === 0) return { kind: 'checked-in' };
  if (line?.state === 'early') return { kind: 'outside', opensAt: line.opensAt };
  if (ready === 0) return { kind: 'done' };
  return { kind: 'ready' };
}
