/** src/sports/seasons.ts: how seasons, sign-ups and the Sports page sections work. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { activeSeasons, dateRange, eligible, gradesLabel, parseTime, schoolToday, seasonState, signupState, sportSections, timeLabel, type SeasonInfo } from '../src/sports/seasons';

const TODAY = '2026-10-18';
const season = (id: string, sportId: string, startsOn: string, endsOn: string, more: Partial<SeasonInfo> = {}): SeasonInfo => ({
  id, sportId, name: id, startsOn, endsOn, signupOpens: null, signupCloses: null, minGrade: null, maxGrade: null, ...more,
});

test('a season is in season, coming up or over by its dates (inclusive)', () => {
  assert.equal(seasonState(season('a', 'vb', '2026-08-03', '2026-10-18'), TODAY), 'in-season');
  assert.equal(seasonState(season('a', 'vb', '2026-10-19', '2027-02-01'), TODAY), 'upcoming');
  assert.equal(seasonState(season('a', 'vb', '2026-03-01', '2026-05-01'), TODAY), 'over');
});

test('sign-ups: open within the window, soon before it, closed after, none without one', () => {
  const s = (o: string | null, c: string | null) => season('a', 'bb', '2026-11-02', '2027-02-20', { signupOpens: o, signupCloses: c });
  assert.equal(signupState(s('2026-10-12', '2026-10-30'), TODAY), 'open');
  assert.equal(signupState(s('2026-10-18', '2026-10-18'), TODAY), 'open');
  assert.equal(signupState(s('2026-10-20', '2026-10-30'), TODAY), 'soon');
  assert.equal(signupState(s('2026-09-01', '2026-10-17'), TODAY), 'closed');
  assert.equal(signupState(s(null, null), TODAY), 'none');
});

test('grades: who may sign up, and how it reads', () => {
  const s = season('a', 'vb', TODAY, TODAY, { minGrade: 6, maxGrade: 12 });
  assert.ok(eligible(s, 6) && eligible(s, 12));
  assert.ok(!eligible(s, 5) && !eligible(s, null));
  assert.ok(eligible(season('b', 'vb', TODAY, TODAY), null), 'any grade');
  assert.equal(gradesLabel(s), '6th–12th grade');
  assert.equal(gradesLabel({ minGrade: 11, maxGrade: null }), '11th grade and up');
  assert.equal(gradesLabel({ minGrade: null, maxGrade: null }), '');
  assert.equal(dateRange('2026-08-03', '2026-10-31'), 'Aug 3 – Oct 31');
});

test('the Sports page: in season, coming up (soonest first), and the rest to follow', () => {
  const sports = [{ id: 'vb' }, { id: 'bb' }, { id: 'soc' }, { id: 'golf' }];
  const seasons = [
    season('vb26', 'vb', '2026-08-03', '2026-10-31'),
    season('soc27', 'soc', '2027-02-15', '2027-05-01'),
    season('bb26', 'bb', '2026-11-02', '2027-02-20'),
    season('golf25', 'golf', '2025-03-01', '2025-05-01'),
  ];
  const { inSeason, upcoming, others } = sportSections(sports, seasons, TODAY);
  assert.deepEqual(inSeason.map((x) => x.season.id), ['vb26']);
  assert.deepEqual(upcoming.map((x) => x.season.id), ['bb26', 'soc27']);
  assert.deepEqual(others.map((x) => x.id), ['golf'], 'only past seasons');
  assert.deepEqual(activeSeasons([...seasons, season('vb27', 'vb', '2027-08-02', '2027-10-30')], 'vb', TODAY).map((s) => s.id), ['vb26', 'vb27']);
});

test('school days run on Central time', () => {
  assert.equal(schoolToday(new Date('2026-10-18T04:30:00Z')), '2026-10-17');
  assert.equal(schoolToday(new Date('2026-10-18T06:00:00Z')), '2026-10-18');
});

test('schedule times can be typed the way people write them', () => {
  assert.deepEqual(parseTime('4:30 PM'), { h: 16, m: 30 });
  assert.deepEqual(parseTime('4pm'), { h: 16, m: 0 });
  assert.deepEqual(parseTime('12:15 a.m.'), { h: 0, m: 15 });
  assert.deepEqual(parseTime('12 PM'), { h: 12, m: 0 });
  assert.deepEqual(parseTime('16:30'), { h: 16, m: 30 });
  for (const bad of ['', '4', '13 pm', '4:75', 'noon', '24:00']) assert.equal(parseTime(bad), null, bad);
  assert.equal(timeLabel(16, 30), '4:30 PM');
  assert.equal(timeLabel(0, 5), '12:05 AM');
});

test('activity categories: who leads each, its kinds of schedule items, and the category pills', async () => {
  const { CATEGORIES, categoryInfo, hasHomeAway, inCategory, KIND_LABELS, leaders } = await import('../src/sports/categories');
  assert.deepEqual(CATEGORIES.map((c) => c.label), ['Sports', 'Theater', 'Music', 'Art', 'Clubs']);
  assert.deepEqual(categoryInfo('theater').kinds, ['rehearsal', 'audition', 'performance', 'other']);
  assert.equal(categoryInfo('nonsense').key, 'sports', 'unknown → sports');
  assert.equal(leaders('sports', 2), 'Coaches');
  assert.equal(leaders('theater', 1), 'Director');
  assert.equal(leaders('clubs', 3), 'Leaders');
  assert.ok(hasHomeAway('game') && !hasHomeAway('performance'));
  assert.equal(KIND_LABELS.audition, 'Auditions');
  const items = [{ id: 'vb', category: 'sports' }, { id: 'musical', category: 'theater' }];
  assert.deepEqual(inCategory(items, 'theater').map((x) => x.id), ['musical']);
  assert.equal(inCategory(items, 'all').length, 2);
  // Every kind a category offers is one the database allows.
  const allowed = new Set(Object.keys(KIND_LABELS));
  for (const c of CATEGORIES) for (const k of c.kinds) assert.ok(allowed.has(k), `${c.key}: ${k}`);
});
