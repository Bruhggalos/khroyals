/** src/info/today.ts: the Planner tab's date, greeting, school day, uniform and next two weeks. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  addDays, assignmentsOn, dayLabel, dayOf, eventsToday, greeting, headerDate, names, nextTwoWeeks, noSchool, schoolHour, twoWeeks, uniformFor, dressFor, type DressTheme,
} from '../src/info/today';

const ev = (date: string, title: string, category = 'Academic', endDate: string | null = null) => ({ id: title, date, endDate, title, category });
const CAL = [
  ev('2026-11-03', 'ACT Testing', 'Academic', '2026-11-04'),
  ev('2026-11-11', 'Veteran’s Day – Closed', 'No School'),
  ev('2026-11-13', 'Spirit Day'),
  ev('2026-11-23', 'Thanksgiving Break', 'No School', '2026-11-27'),
  ev('2026-12-01', 'Christmas Program'),
];

test('the header date and the greeting', () => {
  assert.equal(headerDate('2026-10-24'), 'Saturday, October 24');
  assert.equal(greeting(8, { firstName: 'Ava', schoolRole: 'student' }), 'Good morning Ava!');
  assert.equal(greeting(13, { firstName: 'Ben', schoolRole: 'parent' }), 'Good afternoon Royal!', "only a student's name");
  assert.equal(greeting(19, null), 'Good evening Royal!');
  assert.equal(schoolHour(new Date('2026-10-24T13:30:00Z')), 8, 'Central time');
  assert.equal(addDays('2026-10-31', 1), '2026-11-01');
});

test('school days: weekends and days off have no school', () => {
  assert.equal(noSchool('2026-10-24', CAL), 'Weekend');
  assert.equal(noSchool('2026-11-11', CAL), 'Veteran’s Day – Closed');
  assert.equal(noSchool('2026-11-25', CAL), 'Thanksgiving Break');
  assert.equal(noSchool('2026-11-04', CAL), null);
  assert.deepEqual(eventsToday('2026-11-04', CAL).map((e) => e.title), ['ACT Testing']);
});

test('the uniform: daily, Wednesday Chapel by grade, Spirit Day, none without school', () => {
  assert.equal(uniformFor('2026-10-24', CAL), null);
  const mon = uniformFor('2026-11-02', CAL)!;
  assert.equal(mon.kind, 'daily');
  assert.match(mon.shoes, /Sneakers are fine/);
  const wed = uniformFor('2026-11-04', CAL, [-2, 6])!;
  assert.equal(wed.kind, 'chapel');
  assert.match(wed.shoes, /No sneakers/);
  assert.deepEqual(wed.notes.map((n) => n.split(':')[0]), ['K2–K3', '6th–8th']);
  const kids = uniformFor('2026-11-04', CAL, [{ name: 'Ava', grade: 3 }, { name: 'Liam', grade: 0 }, { name: 'Mia', grade: 10 }])!;
  assert.deepEqual(kids.notes.map((n) => n.split(':')[0]), ['K4–5th (Ava and Liam)', '9th–12th (Mia)'], "a parent's children by name");
  assert.equal(names(['Ava', 'Liam', 'Mia']), 'Ava, Liam and Mia');
  assert.ok(uniformFor('2026-11-13', CAL)!.notes.some((n) => n.startsWith('Spirit Day')));
});

test('the two weeks of days, and assignments on each', () => {
  const days = twoWeeks('2026-10-30');
  assert.deepEqual([days.length, days[0], days[3], days[13]], [14, '2026-10-30', '2026-11-02', '2026-11-12']);
  assert.equal(dayLabel('2026-10-30', '2026-10-30'), 'Today');
  assert.equal(dayLabel('2026-10-31', '2026-10-30'), 'Tomorrow');
  assert.equal(dayLabel('2026-11-02', '2026-10-30'), 'Monday');
  assert.equal(dayLabel('2026-11-09', '2026-10-30'), 'Monday, Nov 9');
  assert.equal(dayOf('2026-10-31T03:30:00Z'), '2026-10-30', 'evening in Central time');

  const a = (title: string, dueOn: string | null, done = false) => ({ title, dueOn, done });
  const list = [a('Essay', '2026-11-02'), a('Map quiz', '2026-10-28'), a('Old, done', '2026-10-27', true), a('Reading', '2026-10-30', true),
    a('Lab', '2026-10-30'), a('Someday', null)];
  const today = assignmentsOn(list, '2026-10-30', '2026-10-30');
  assert.deepEqual(today.overdue.map((x) => x.title), ['Map quiz'], 'done ones are not overdue');
  assert.deepEqual(today.due.map((x) => x.title), ['Lab', 'Reading'], 'done ones stay, checked off');
  const monday = assignmentsOn(list, '2026-11-02', '2026-10-30');
  assert.deepEqual([monday.overdue, monday.due.map((x) => x.title)], [[], ['Essay']], 'overdue only shows on today');
});

test('coming up: after today through the next two weeks', () => {
  assert.deepEqual(nextTwoWeeks(CAL, '2026-10-24').map((e) => e.title), ['ACT Testing']);
  assert.deepEqual(nextTwoWeeks(CAL, '2026-11-10').map((e) => e.title), ['Veteran’s Day – Closed', 'Spirit Day', 'Thanksgiving Break']);
  assert.deepEqual(nextTwoWeeks(CAL, '2026-11-24').map((e) => e.title), ['Thanksgiving Break', 'Christmas Program'], 'still on after today');
  assert.deepEqual(nextTwoWeeks(CAL, '2026-12-05'), []);
});

test('dress-up days: the theme sits above the uniform, for the right grades and children', () => {
  const thu = '2026-10-29';
  const SPIRIT: DressTheme[] = [
    { date: '2026-10-26', week: 'Spirit Week', title: 'Mismatch Monday', details: 'Clash!', gradeFrom: null, gradeTo: null },
    { date: thu, week: 'Spirit Week', title: 'Twinning Thursday', details: 'Dress alike.', gradeFrom: 6, gradeTo: 12 },
    { date: thu, week: 'Spirit Week', title: 'Character Day', details: 'Be a character.', gradeFrom: -3, gradeTo: 5 },
  ];
  const mon = uniformFor('2026-10-26', [], [], SPIRIT)!;
  assert.equal(mon.title, 'Daily uniform', 'the usual uniform is still there');
  assert.deepEqual(mon.dress, { week: 'Spirit Week', themes: [{ title: 'Mismatch Monday', details: 'Clash!', who: null }] });
  assert.equal(uniformFor('2026-10-27', [], [], SPIRIT)!.dress, null);

  // Staff and visitors see every theme with its grades; a student only theirs; a parent's children by name.
  assert.deepEqual(dressFor(thu, SPIRIT)!.themes.map((t) => t.who), ['6th–12th', 'K2–5th']);
  assert.deepEqual(dressFor(thu, SPIRIT, [1])!.themes.map((t) => t.title), ['Character Day']);
  const kids = dressFor(thu, SPIRIT, [{ name: 'Winry', grade: 1 }, { name: 'Ava', grade: 3 }, { name: 'Mia', grade: 10 }])!;
  assert.deepEqual(kids.themes.map((t) => t.who), ['6th–12th: Mia', 'K2–5th: Winry and Ava']);
  assert.equal(uniformFor('2026-10-31', [], [], [{ ...SPIRIT[0], date: '2026-10-31' }]), null, 'no school on the weekend, so nothing to wear');
});
