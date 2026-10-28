/** src/carline/festive.ts: which festive scene the car line board shows, and the school's switches for them. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { FESTIVE, christmasBreak, easter, festiveScene, holidayDate, isSchoolDay, schoolDayBefore, thanksgiving } from '../src/carline/festive';

/** The school's No School days for 2026-27, as on its calendar. */
const YEAR = [
  { title: 'Labor Day – Closed', date: '2026-09-07' }, { title: 'Fall Break', date: '2026-10-05', end: '2026-10-09' },
  { title: 'Veteran’s Day – Closed', date: '2026-11-11' }, { title: 'Thanksgiving Break', date: '2026-11-23', end: '2026-11-27' },
  { title: 'Christmas Break', date: '2026-12-21', end: '2027-01-01' }, { title: 'Rev. Dr. MLK Jr. Day – Closed', date: '2027-01-18' },
  { title: 'President’s Day', date: '2027-02-15' }, { title: 'Spring Break', date: '2027-03-15', end: '2027-03-19' },
  { title: 'Good Friday', date: '2027-03-26' }, { title: 'Easter Monday', date: '2027-03-29' },
];

test('the fall scene runs the week before Thanksgiving week through the day before Thanksgiving', () => {
  assert.equal(thanksgiving(2026), '2026-11-26');
  assert.equal(thanksgiving(2027), '2027-11-25');
  assert.equal(thanksgiving(2028), '2028-11-23', 'November starting on a Wednesday');
  assert.equal(thanksgiving(2029), '2029-11-22', 'the earliest it can be');
  // 2026: school is off Nov 23-27, so the scene shows on the last school week, Nov 16-20.
  assert.equal(festiveScene('2026-11-15'), null, 'the Sunday before');
  assert.equal(festiveScene('2026-11-16'), 'thanksgiving', 'Monday of the week before');
  assert.equal(festiveScene('2026-11-20'), 'thanksgiving', 'Friday, the last car line before the break');
  assert.equal(festiveScene('2026-11-25'), 'thanksgiving', 'the day before Thanksgiving');
  assert.equal(festiveScene('2026-11-26'), null, 'Thanksgiving Day');
  assert.equal(festiveScene('2026-11-27'), null);
  assert.equal(festiveScene('2026-10-27'), null);
  assert.equal(festiveScene('2027-11-15'), 'thanksgiving', 'Monday, ten days before Nov 25');
  assert.equal(festiveScene('2027-11-14'), null);
});

test('the snow scene runs the last school week before Christmas break, from the school calendar', () => {
  const calendar = [{ title: 'Thanksgiving Break', date: '2026-11-23' }, { title: 'Christmas Break', date: '2026-12-21' }];
  assert.equal(christmasBreak(2026, calendar), '2026-12-21');
  assert.equal(christmasBreak(2026), '2026-12-21', 'no calendar: the Monday of Christmas week');
  assert.equal(christmasBreak(2028), '2028-12-25', 'Christmas on a Monday');
  assert.equal(christmasBreak(2028, [{ title: 'Christmas Break', date: '2028-12-18' }]), '2028-12-18', "the school's own date wins");
  assert.equal(christmasBreak(2027, [{ title: 'Winter Break', date: '2027-12-17' }]), '2027-12-17');
  assert.equal(christmasBreak(2026, [{ title: 'Spring Break', date: '2026-03-15' }]), '2026-12-21', 'other breaks are ignored');

  // 2026: Christmas Break starts Monday Dec 21, so the last school week is Dec 14-18.
  assert.equal(festiveScene('2026-12-13', calendar), null, 'the Sunday before');
  assert.equal(festiveScene('2026-12-14', calendar), 'christmas');
  assert.equal(festiveScene('2026-12-18', calendar), 'christmas', 'Friday, the last car line before the break');
  assert.equal(festiveScene('2026-12-20', calendar), 'christmas');
  assert.equal(festiveScene('2026-12-21', calendar), null, 'the break itself');
  assert.equal(festiveScene('2026-12-07', calendar), null);
  // A break that starts on a Friday: the week before that week, through Thursday.
  const winter = [{ title: 'Winter Break', date: '2027-12-17' }];
  assert.equal(festiveScene('2027-12-05', winter), null);
  assert.equal(festiveScene('2027-12-06', winter), 'christmas');
  assert.equal(festiveScene('2027-12-16', winter), 'christmas');
  assert.equal(festiveScene('2027-12-17', winter), null);
});

test('Fall Break and Spring Break scenes run the school week before each, from the school calendar', () => {
  const calendar = [{ title: 'Fall Break', date: '2026-10-05' }, { title: 'Spring Break', date: '2027-03-15' }];
  assert.equal(festiveScene('2026-09-27', calendar), null, 'the Sunday before');
  assert.equal(festiveScene('2026-09-28', calendar), 'fall-break');
  assert.equal(festiveScene('2026-10-02', calendar), 'fall-break', 'Friday, the last car line before the break');
  assert.equal(festiveScene('2026-10-05', calendar), null, 'the break itself');
  assert.equal(festiveScene('2027-03-07', calendar), null);
  assert.equal(festiveScene('2027-03-08', calendar), 'spring-break');
  assert.equal(festiveScene('2027-03-12', calendar), 'spring-break');
  assert.equal(festiveScene('2027-03-15', calendar), null);
  assert.equal(festiveScene('2026-09-28'), null, 'not on the calendar: no scene');
  assert.equal(festiveScene('2027-03-08', [{ title: 'Easter Monday', date: '2027-03-15' }]), null, 'other days off are not Spring Break');
});

test('holiday dates', () => {
  assert.deepEqual([2026, 2027, 2028, 2029].map(easter), ['2026-04-05', '2027-03-28', '2028-04-16', '2029-04-01']);
  assert.equal(holidayDate('labor-day', 2026), '2026-09-07');
  assert.equal(holidayDate('mlk-day', 2027), '2027-01-18');
  assert.equal(holidayDate('presidents-day', 2027), '2027-02-15');
  assert.equal(holidayDate('mothers-day', 2027), '2027-05-09');
  assert.equal(holidayDate('memorial-day', 2027), '2027-05-31');
  assert.equal(holidayDate('memorial-day', 2026), '2026-05-25');
});

test('school days skip weekends and the No School days on the calendar', () => {
  assert.equal(isSchoolDay('2026-10-07', YEAR), false, 'Fall Break');
  assert.equal(isSchoolDay('2026-10-10', YEAR), false, 'a Saturday');
  assert.equal(isSchoolDay('2026-10-12', YEAR), true);
  assert.equal(schoolDayBefore('2026-10-12', YEAR), '2026-10-02', 'back over Fall Break');
  assert.equal(schoolDayBefore('2027-01-04', YEAR), '2026-12-18', 'back over Christmas break');
});

test('a holiday shows on the school day before it and on the day itself', () => {
  const on = (day: string) => festiveScene(day, YEAR);
  // Labor Day is a Monday off: the Friday before.
  assert.equal(on('2026-09-03'), null);
  assert.equal(on('2026-09-04'), 'labor-day');
  // Veterans Day is a Wednesday off: the Tuesday before.
  assert.equal(on('2026-11-10'), 'veterans-day');
  assert.equal(on('2026-11-09'), null);
  assert.equal(on('2027-01-15'), 'mlk-day');
  // Valentine's Day is a Sunday; it shares the Friday before with Presidents' Day (Monday off), and comes first.
  assert.equal(on('2027-02-11'), null);
  assert.equal(on('2027-02-12'), 'valentines');
  assert.equal(festiveScene('2027-02-12', YEAR, { enabled: true, off: ['valentines'] }), 'presidents-day');
  // St. Patrick's Day falls in Spring Break: the Friday before wins over Spring Break's week.
  assert.equal(on('2027-03-11'), 'spring-break');
  assert.equal(on('2027-03-12'), 'st-patricks');
  // Easter: Good Friday is off, so the Thursday before.
  assert.equal(on('2027-03-25'), 'easter');
  assert.equal(on('2027-03-24'), null);
  assert.equal(on('2027-05-07'), 'mothers-day', "the Friday before Mother's Day");
  assert.equal(on('2027-05-28'), 'memorial-day');
  // A holiday on a school day shows the day before and the day itself.
  assert.equal(festiveScene('2028-02-14', []), 'valentines', 'a Monday');
  assert.equal(festiveScene('2028-02-11', []), 'valentines', 'the Friday before');
  assert.equal(festiveScene('2028-02-10', []), null);
});

test("the school's switches turn scenes off, one by one or all at once", () => {
  assert.equal(festiveScene('2027-03-25', YEAR, { enabled: true, off: ['easter'] }), null);
  assert.equal(festiveScene('2026-11-16', YEAR, { enabled: true, off: ['thanksgiving'] }), null);
  assert.equal(festiveScene('2026-11-16', YEAR, { enabled: true, off: ['christmas'] }), 'thanksgiving');
  for (const day of ['2026-09-04', '2026-11-16', '2026-12-14', '2027-03-12']) {
    assert.equal(festiveScene(day, YEAR, { enabled: false, off: [] }), null, day);
  }
});

test('the festive switches are the same list in the app and the database', () => {
  const dir = join(__dirname, '../supabase/migrations');
  const sql = readdirSync(dir).filter((f) => f.endsWith('.sql')).sort().map((f) => readFileSync(join(dir, f), 'utf8')).join('\n');
  const listed = /festive_keys\(\) returns text\[\][^$]*\$\$\s*select array\[([^\]]*)\]/i.exec(sql);
  assert.ok(listed, 'app.festive_keys() is in the migrations');
  const keys = [...listed[1].matchAll(/'([^']+)'/g)].map((m) => m[1]);
  assert.deepEqual([...keys].sort(), FESTIVE.map((f) => f.key).sort());
  assert.equal(new Set(FESTIVE.map((f) => f.key)).size, FESTIVE.length, 'no repeats');
});
