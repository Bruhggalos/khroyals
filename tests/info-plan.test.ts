/** src/info/plan.ts: one day on the Planner tab for a student, a teacher and a parent. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { NO_DATA, planDay, type InfoData } from '../src/info/plan';

const ev = (date: string, title: string, category = 'Academic', endDate: string | null = null) => ({ id: title, date, endDate, title, category });
const CAL = [ev('2026-11-03', 'ACT Testing', 'Academic', '2026-11-04'), ev('2026-11-11', 'Veteran’s Day – Closed', 'No School')];
const TODAY = '2026-10-30'; // a Friday

const sport = (id: string, name: string) => ({ id, name, icon: '🏐', description: '', category: 'sports' as const, coachIds: [] });
const season = (id: string, sportId: string) => ({
  id, sportId, name: 'Fall', startsOn: '2026-08-01', endsOn: '2026-12-01', signupOpens: null, signupCloses: null,
  minGrade: null, maxGrade: null, details: '', infoUrl: null,
});
const game = (id: string, seasonId: string, startsAt: string, title = 'Game') => ({
  id, seasonId, kind: 'game' as const, title, startsAt, endsAt: null, location: 'Gym', home: true, notes: '', cancelled: false,
});
const asg = (id: string, title: string, dueOn: string | null, done = false) => ({
  id, rosterId: 'eng', className: 'English 10', ownerId: 't', title, details: '', dueOn, createdAt: '', done,
});

const PARENT: InfoData = {
  ...NO_DATA,
  kids: [{ id: 'ava', firstName: 'Ava', grade: 3 }, { id: 'liam', firstName: 'Liam', grade: 10 }],
  kidAssignments: [{ id: 'k1', studentId: 'ava', rosterId: 'r3', className: 'Reading', title: 'Book report', details: '', dueOn: '2026-11-02' }],
  forms: [{ id: 'f1', title: 'Zoo field trip', dueOn: '2026-11-02', waiting: ['ava'] }, { id: 'f0', title: 'Photo release', dueOn: '2026-10-28', waiting: ['liam'] }],
  sports: [sport('vb', 'Volleyball'), sport('ch', 'Chess Club')],
  seasons: [season('vb-f', 'vb'), season('ch-f', 'ch')],
  schedule: [game('g1', 'vb-f', '2026-11-02T22:00:00Z'), game('g2', 'ch-f', '2026-11-02T20:30:00Z', 'Chess Club meet')],
  registrations: [{ id: 'r', seasonId: 'vb-f', studentId: 'liam', requestedBy: 'p', status: 'registered', note: '', decisionNote: '', createdAt: '' }],
  opportunities: [{
    id: 'o1', leadId: 'x', title: 'Book fair helpers', description: '', startsOn: '2026-11-02', endsOn: null, startTime: '08:00', endTime: '10:00',
    location: 'Library', spots: 4, kind: 'help', item: null, quantity: null, status: 'open', deleteReason: null, createdAt: '',
  }],
  signups: [{ opportunityId: 'o1', userId: 'p', createdAt: '', quantity: null }],
  carline: { start: '14:45', end: '15:30', openNow: true },
};

test("a parent: a card for each child, the family's other things, car line on school days", () => {
  const mon = planDay('2026-11-02', TODAY, CAL, PARENT);
  assert.equal(mon.label, 'Monday');
  assert.deepEqual(mon.kids.map((k) => [k.kid.firstName, k.rows.map((r) => r.title)]),
    [['Ava', ['Book report', 'Sign: Zoo field trip']], ['Liam', ['Volleyball: Game']]], "each child's assignments, activities and forms to sign");
  assert.equal(mon.kids[0].rows[1].href, '/forms/f1');
  assert.deepEqual(mon.items.map((r) => r.title), ['Chess Club meet', 'Book fair helpers', 'Car line pickup'], 'followed, not registered');
  assert.equal(mon.items.find((r) => r.key === 'carline')!.detail, '2:45–3:30 PM', '"Open now" is only for today');
  assert.equal(mon.items.find((r) => r.key === 'vol-o1')!.detail, 'You signed up · 8:00–10:00 AM · Library');
  assert.equal(mon.busy, true);

  const sat = planDay('2026-10-31', TODAY, CAL, PARENT);
  assert.deepEqual([sat.dayOff, sat.uniform, sat.kids, sat.items, sat.busy], ['Weekend', null, [], [], false], 'nothing on a day off');

  const fri = planDay(TODAY, TODAY, CAL, PARENT);
  assert.deepEqual(fri.kids.map((k) => k.rows.map((r) => `${r.title} (${r.detail})`)), [[], ['Sign: Photo release (Form overdue)']],
    'an overdue form shows on today; each child shows on a school day, even with nothing');
  assert.match(fri.items.find((r) => r.key === 'carline')!.detail!, /Open now/);
  assert.equal(planDay(TODAY, TODAY, CAL, { ...PARENT, forms: [] }).busy, false, 'car line alone is not a busy day');

  const wed = planDay('2026-11-04', TODAY, CAL, PARENT);
  assert.deepEqual(wed.uniform!.notes.map((n) => n.split(':')[0]), ['K4–5th (Ava)', '9th–12th (Liam)']);
  assert.deepEqual(wed.items.map((r) => r.title), ['ACT Testing', 'Car line pickup']);
});

test('a student: their assignments every day (overdue on today), their activities in the list', () => {
  const data: InfoData = {
    ...NO_DATA, assigns: 'student',
    assignments: [asg('a1', 'Essay', '2026-11-02'), asg('a2', 'Map quiz', '2026-10-28'), asg('a3', 'Lab', TODAY, true)],
    sports: PARENT.sports, seasons: PARENT.seasons, schedule: PARENT.schedule,
  };
  const fri = planDay(TODAY, TODAY, CAL, data, [10]);
  assert.deepEqual([fri.assignments!.overdue.map((a) => a.title), fri.assignments!.due.map((a) => a.title)], [['Map quiz'], ['Lab']]);
  const mon = planDay('2026-11-02', TODAY, CAL, data, [10]);
  assert.deepEqual([mon.assignments!.overdue, mon.assignments!.due.map((a) => a.title)], [[], ['Essay']]);
  assert.deepEqual(mon.items.map((r) => r.title), ['Chess Club meet', 'Volleyball: Game']);
  assert.ok(planDay('2026-10-31', TODAY, CAL, data).assignments, 'the card shows on days off too');
  assert.deepEqual(planDay('2026-11-04', TODAY, CAL, data, [10]).uniform!.notes.map((n) => n.split(':')[0]), ['9th–12th']);
});

test("a teacher: what's due in their classes, once they've assigned something", () => {
  assert.equal(planDay(TODAY, TODAY, CAL, { ...NO_DATA, assigns: 'teacher' }).assignments, null);
  const t = planDay('2026-11-02', TODAY, CAL, { ...NO_DATA, assigns: 'teacher', assignments: [asg('a1', 'Essay', '2026-11-02'), asg('a2', 'Old', '2026-10-01')] });
  assert.deepEqual([t.assignments!.teacher, t.assignments!.overdue, t.assignments!.due.map((a) => a.title)], [true, [], ['Essay']]);
});

test("a teacher: their own calendar on the day, and a game they'll go to shows once", () => {
  const item = (id: string, title: string, extra: object = {}) => ({
    id, sportEventId: null, sportId: null, title, date: '2026-11-02', startTime: null, endTime: null,
    location: null, address: null, notes: '', cancelled: false, ...extra,
  });
  const TEACHER: InfoData = {
    ...NO_DATA, sports: [sport('vb', 'Volleyball')], seasons: [season('vb-f', 'vb')],
    schedule: [game('g1', 'vb-f', '2026-11-02T22:00:00Z'), game('g3', 'vb-f', '2026-11-02T23:30:00Z', 'JV game')],
    myCalendar: [
      item('m1', 'Faculty meeting', { startTime: '07:30', endTime: '08:15', location: 'Library' }),
      item('m2', '🏐 Volleyball · Game', { sportEventId: 'g1', sportId: 'vb', startTime: '17:00', cancelled: true }),
    ],
  };
  const mon = planDay('2026-11-02', TODAY, CAL, TEACHER);
  assert.deepEqual(mon.items.map((r) => r.key), ['my-m1', 'my-m2', 'sport-g3'], 'the planned game once, as My calendar has it');
  assert.deepEqual(mon.items.slice(0, 2).map((r) => r.detail), ['7:30–8:15 AM · Library', 'Cancelled']);
  assert.equal(mon.busy, true);
  assert.equal(planDay('2026-11-03', TODAY, CAL, TEACHER).items.some((r) => r.key.startsWith('my-')), false);
});
