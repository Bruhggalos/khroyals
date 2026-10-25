/** src/sports/search.ts: Activities search looks through every activity and every schedule. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { searchActivities, searchWords } from '../src/sports/search';

const sport = (id: string, name: string, description = '', category = 'sports') =>
  ({ id, name, icon: '🏀', description, category: category as 'sports', coachIds: [] });
const season = (id: string, sportId: string, name: string, details = '') => ({
  id, sportId, name, startsOn: '2026-11-01', endsOn: '2027-02-28', signupOpens: null, signupCloses: null,
  minGrade: null, maxGrade: null, details, infoUrl: null,
});
const game = (id: string, seasonId: string, title: string, startsAt: string, location: string | null = null, notes = '') => ({
  id, seasonId, kind: 'game' as const, title, startsAt, endsAt: null, location, home: null, notes, cancelled: false,
});

const SPORTS = [sport('bb', 'Basketball', 'Varsity, JV and middle school.'), sport('an', 'Annie Jr.', 'This year’s musical.', 'theater')];
const SEASONS = [
  season('ms', 'bb', 'Middle School Boys 2026–27', 'Not on the schedule yet: at Randolph on Nov 21 (time to be announced).'),
  season('vg', 'bb', 'Varsity Girls 2026–27'),
  season('fall', 'an', 'Fall show'),
];
const EVENTS = [
  game('e1', 'vg', 'Varsity Girls at Randolph', '2026-11-05T00:00:00Z', 'Randolph'),
  game('e2', 'ms', 'MS Boys at Randolph', '2026-11-05T22:00:00Z', 'Randolph'),
  game('e3', 'ms', 'MS Boys vs. Athens Bible', '2026-11-24T22:00:00Z', 'Kingdom Heights'),
  game('e0', 'vg', 'Varsity Girls at Randolph', '2025-11-05T00:00:00Z', 'Randolph'),
  { ...game('e4', 'fall', 'Rehearsal', '2026-11-02T21:30:00Z', 'Auditorium', 'Bring your script.'), kind: 'rehearsal' as const },
];
const NOW = Date.parse('2026-10-25T12:00:00Z');
const find = (q: string) => searchActivities(q, SPORTS, SEASONS, EVENTS, NOW);
const titles = (hits: { event: { id: string } }[]) => hits.map((h) => h.event.id);

test('"Randolph" finds the games there and the activity that mentions it', () => {
  const r = find('Randolph');
  assert.deepEqual(r.activities.map((s) => s.name), ['Basketball'], "from a season's details");
  assert.deepEqual(titles(r.upcoming), ['e1', 'e2'], 'soonest first');
  assert.deepEqual(titles(r.past), ['e0'], 'past ones apart');
  assert.equal(r.upcoming[0].sport?.name, 'Basketball');
});

test('any order, any case, no accents; every word has to match', () => {
  assert.deepEqual(titles(find('RANDOLPH boys').upcoming), ['e2']);
  assert.deepEqual(titles(find('boys randolph').upcoming), ['e2']);
  assert.deepEqual(find('annié').activities.map((s) => s.name), ['Annie Jr.']);
  assert.deepEqual(titles(find('script').upcoming), ['e4'], "an item's notes");
  assert.deepEqual(titles(find('auditorium').upcoming), ['e4'], 'its place');
  assert.deepEqual(find('randolph chess'), { activities: [], upcoming: [], past: [] });
  assert.deepEqual(searchWords('  Varsity   Girls '), ['varsity', 'girls']);
});

test('an activity or season name alone finds the activity, not all of its games', () => {
  const r = find('basketball');
  assert.deepEqual(r.activities.map((s) => s.name), ['Basketball']);
  assert.deepEqual([r.upcoming, r.past], [[], []]);
  assert.deepEqual(titles(find('basketball athens').upcoming), ['e3'], 'with a word from the game, it finds the game');
  assert.deepEqual(find('theater').activities.map((s) => s.name), ['Annie Jr.'], 'the category');
  assert.deepEqual(find('').activities, []);
});
