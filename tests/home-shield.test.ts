/** src/homeShield.ts: the welcome screen's shield lands centered on the Home button, at its size. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { flightPath } from '../src/homeShield';

test('the shield flies center to center and shrinks to the button', () => {
  // A 160-point shield in the middle of a phone, and the 66-point Home button raised above the tab bar.
  const p = flightPath({ x: 107.5, y: 250, width: 160, height: 160 }, { x: 154.5, y: 720, width: 66, height: 66 });
  assert.equal(p.dx, 0);
  assert.equal(p.dy, 753 - 330);
  assert.equal(p.scale, 66 / 160);
});

test('the Home button stays hidden while the shield flies in, and shows again when it lands', async () => {
  const { hideHomeButton, watchHomeButton } = await import('../src/homeShield');
  const seen: boolean[] = [];
  const stop = watchHomeButton((h) => seen.push(h));
  hideHomeButton(true);
  hideHomeButton(false);
  stop();
  hideHomeButton(true);
  hideHomeButton(false);
  assert.deepEqual(seen, [false, true, false], 'told straight away, then each change, until it stops watching');
});
