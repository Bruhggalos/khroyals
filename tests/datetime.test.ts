/** Dates and times are picked from a calendar or a time wheel (src/forms/DateTimeField.tsx), never typed. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { dateLabel, parseDate, parseTime, timeLabel, toDateString, toTimeString } from '../src/forms/dates';

const ROOT = join(__dirname, '..');
const files = (dir: string): string[] => readdirSync(dir).flatMap((f) => {
  const p = join(dir, f);
  return statSync(p).isDirectory() ? files(p) : p.endsWith('.tsx') ? [p] : [];
});

test('date and time values round-trip in the formats the database expects', () => {
  assert.equal(toDateString(new Date(2026, 9, 4)), '2026-10-04');
  assert.equal(toDateString(parseDate('2016-02-29')!), '2016-02-29');
  assert.equal(parseDate('10/24/2026'), null, 'typed formats are not dates');
  assert.equal(toTimeString(parseTime('7:05')!), '07:05');
  assert.equal(parseTime('3:30 PM'), null);
  assert.equal(dateLabel('2026-10-24'), 'Sat, Oct 24, 2026');
  assert.equal(timeLabel('15:30'), '3:30 PM');
  assert.equal(dateLabel(''), '');
});

test('no screen asks people to type a date or time', () => {
  const typed = /<Field\b[^>]*label="(?:[^"]*\b(?:date|time|birthday)\b|(?:Starts|Ends|Opens|Closes|From|Until)\b)/i;
  const offenders = files(join(ROOT, 'app')).concat(files(join(ROOT, 'src')))
    .flatMap((f) => readFileSync(f, 'utf8').split('\n').map((line, i) => ({ f, i, line })))
    .filter(({ line }) => typed.test(line) || /YYYY-MM-DD/.test(line) && /placeholder|hint/.test(line))
    .map(({ f, i, line }) => `${relative(ROOT, f)}:${i + 1}: ${line.trim()}`);
  assert.deepEqual(offenders, [], 'use DateField / TimeField from src/forms/DateTimeField');
});
