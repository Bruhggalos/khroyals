/** src/arcText.ts: the tab bar's "Home" label curving along the bottom of the shield button. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { bottomArc } from '../src/arcText';

test('letters run left to right below the center, mirrored around the bottom', () => {
  const [h, o, m, e] = bottomArc('Home', 40, 10);
  assert.ok(h.x < o.x && o.x < m.x && m.x < e.x, 'left to right');
  for (const l of [h, o, m, e]) {
    assert.ok(l.y > 0, 'below the center');
    assert.ok(Math.abs(Math.hypot(l.x, l.y) - 40) < 1e-9, 'on the circle');
  }
  const span = bottomArc('HH', 40, 10);
  assert.ok(Math.abs(span[0].x + span[1].x) < 1e-9 && span[0].y === span[1].y, 'centered on the bottom');
});

test('each letter tilts to follow the curve, tops toward the center', () => {
  const [h, , , e] = bottomArc('Home', 40, 10);
  assert.ok(h.rotate > 0, 'the left end turns clockwise');
  assert.ok(e.rotate < 0, 'the right end turns counterclockwise');
  // A letter's "up" (rotated from straight up) points back at the center.
  const up = (deg: number) => [Math.sin((deg * Math.PI) / 180), -Math.cos((deg * Math.PI) / 180)];
  const [ux, uy] = up(h.rotate);
  assert.ok(Math.abs(ux * -h.y - uy * -h.x) < 1e-9 && ux * -h.x + uy * -h.y > 0);
});

test('wider letters get more room, and a bigger circle bends the text less', () => {
  const [, a, b] = bottomArc('imi', 40, 10);
  assert.ok(Math.abs(b.rotate - a.rotate) > 0);
  const tight = bottomArc('Home', 40, 10), loose = bottomArc('Home', 80, 10);
  assert.ok(Math.abs(loose[0].rotate) < Math.abs(tight[0].rotate));
});
