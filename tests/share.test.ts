/** src/share/qr.ts: the Share tab's QR code for the school website. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { qrRows, SCHOOL_WEBSITE } from '../src/share/qr';

const cells = (runs: { dark: boolean; length: number }[]) => runs.flatMap((r) => Array(r.length).fill(r.dark ? 1 : 0)).join('');

test('the website QR code is square, with the three corner finder patterns', () => {
  assert.equal(SCHOOL_WEBSITE, 'https://www.khroyals.com');
  const { size, rows } = qrRows(SCHOOL_WEBSITE);
  assert.equal(size, 25, 'version 2: small enough to scan from across a desk');
  assert.equal(rows.length, size);
  for (const runs of rows) assert.equal(runs.reduce((n, r) => n + r.length, 0), size);
  const grid = rows.map(cells);
  const finder = ['1111111', '1000001', '1011101', '1011101', '1011101', '1000001', '1111111'];
  finder.forEach((line, i) => {
    assert.equal(grid[i].slice(0, 7), line, `top-left, row ${i}`);
    assert.equal(grid[i].slice(size - 7), line, `top-right, row ${i}`);
    assert.equal(grid[size - 7 + i].slice(0, 7), line, `bottom-left, row ${i}`);
  });
});

test('runs alternate, so each row draws as few views as possible', () => {
  for (const runs of qrRows(SCHOOL_WEBSITE).rows) {
    runs.slice(1).forEach((r, i) => assert.notEqual(r.dark, runs[i].dark));
  }
});
