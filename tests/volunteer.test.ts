/** src/volunteer/details.ts: banner art, lengths, countdowns and detail sections. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { dateTile, detailSections, durationLabel, HELPING_HANDS, pledgedTotal, sectionIcon, spotsLeft, startsLabel, stillNeeded, themeOf } from '../src/volunteer/details';

const day = (startsOn: string, endsOn: string | null = null, startTime: string | null = null, endTime: string | null = null) =>
  ({ startsOn, endsOn, startTime, endTime });

test('the banner art comes from the title first, then the details', () => {
  assert.equal(themeOf({ title: 'Car line helpers', description: '' }).glyph, 'car-side');
  assert.equal(themeOf({ title: 'Book Fair volunteers', description: '' }).glyph, 'book-open-variant');
  assert.equal(themeOf({ title: 'Copying and laminating', description: '' }).glyph, 'printer');
  assert.equal(themeOf({ title: 'Christmas Program ushers', description: '' }).label, 'Christmas', 'the first match wins');
  assert.equal(themeOf({ title: 'Saturday help', description: 'Weeding the front garden' }).label, 'Grounds');
  assert.deepEqual(themeOf({ title: 'Saturday help', description: 'Anything goes' }), HELPING_HANDS);
});

test('lengths read in minutes, hours or days', () => {
  assert.equal(durationLabel(day('2026-10-22', null, '14:45', '15:30')), '45 min');
  assert.equal(durationLabel(day('2026-10-28', null, '09:00', '11:00')), '2 hours');
  assert.equal(durationLabel(day('2026-10-28', null, '09:00', '10:00')), '1 hour');
  assert.equal(durationLabel(day('2026-10-28', null, '09:00', '10:30')), '1 hr 30 min');
  assert.equal(durationLabel(day('2026-11-16', '2026-11-19', '07:30', '15:30')), '4 days');
  assert.equal(durationLabel(day('2026-11-01', '2026-11-03')), '3 days', 'across the end of daylight saving time');
  assert.equal(durationLabel(day('2026-10-28', null, '09:00')), null);
  assert.equal(durationLabel(day('2026-10-28')), null);
});

test('how soon it starts, by the school date', () => {
  const today = '2026-10-20';
  assert.equal(startsLabel(day('2026-10-20'), today), 'Today');
  assert.equal(startsLabel(day('2026-10-21'), today), 'Tomorrow');
  assert.equal(startsLabel(day('2026-12-01'), today), 'In 42 days');
  assert.equal(startsLabel(day('2026-10-19', '2026-10-21'), today), 'Happening now');
  assert.equal(startsLabel(day('2026-10-19'), today), null, 'over');
});

test('the date tile shows one day, a range, or a range across months', () => {
  assert.deepEqual(dateTile(day('2026-10-22')), { month: 'OCT', days: '22' });
  assert.deepEqual(dateTile(day('2026-11-16', '2026-11-19')), { month: 'NOV', days: '16–19' });
  assert.deepEqual(dateTile(day('2026-11-30', '2026-12-02')), { month: 'NOV–DEC', days: '30–2' });
});

test('spots left', () => {
  assert.equal(spotsLeft(1, 4), '3 spots left');
  assert.equal(spotsLeft(3, 4), 'Last spot!');
  assert.equal(spotsLeft(4, 4), 'Full');
  assert.equal(spotsLeft(9, null), null);
});

test('details split into sections at blank lines and short headings', () => {
  assert.deepEqual(detailSections(''), []);
  assert.deepEqual(detailSections('Help at pickup.'), [{ heading: null, paragraphs: ['Help at pickup.'] }]);
  assert.deepEqual(detailSections([
    'Open car doors at pickup.', '', 'Arrive by 2:40 PM at the front entrance.', '',
    'What to bring:', 'Something bright to wear', '', 'A smile!', '',
    'Questions: Ask in the chat.',
  ].join('\n')), [
    { heading: null, paragraphs: ['Open car doors at pickup.', 'Arrive by 2:40 PM at the front entrance.'] },
    { heading: 'What to bring', paragraphs: ['Something bright to wear', 'A smile!'] },
    { heading: 'Questions', paragraphs: ['Ask in the chat.'] },
  ]);
  assert.deepEqual(detailSections('3:30 PM sharp\nhttps://khroyals.com/volunteer'),
    [{ heading: null, paragraphs: ['3:30 PM sharp\nhttps://khroyals.com/volunteer'] }], 'times and links are not headings');
  assert.equal(sectionIcon('What to bring'), 'bag-handle-outline');
  assert.equal(sectionIcon(null), 'document-text-outline');
  assert.equal(sectionIcon('Good to know'), 'information-circle-outline');
});

test('a sentence with a colon in it is not a heading', () => {
  assert.deepEqual(detailSections('Help teachers get ready for next week: copying, laminating and cutting.'),
    [{ heading: null, paragraphs: ['Help teachers get ready for next week: copying, laminating and cutting.'] }]);
  assert.deepEqual(detailSections('Where to meet: the front office'), [{ heading: 'Where to meet', paragraphs: ['the front office'] }]);
  assert.deepEqual(detailSections('Things you might want to bring along:\nWater'), [{ heading: 'Things you might want to bring along', paragraphs: ['Water'] }],
    'a longer heading on a line of its own');
});

test('item requests: "Items needed" art, pledge totals and what is still needed', () => {
  assert.deepEqual(themeOf({ title: 'Classroom tissues', description: '', kind: 'items', item: 'boxes of tissues' }),
    { glyph: 'package-variant-closed', label: 'Items needed' }, 'the title matching Classroom help does not count');
  assert.equal(themeOf({ title: 'Snack drive', description: '', kind: 'items', item: 'bags of snacks' }).glyph, 'food-apple');
  assert.equal(pledgedTotal([{ quantity: 10 }, { quantity: 2 }, { quantity: null }]), 12);
  assert.equal(stillNeeded(14, 24), '10 still needed');
  assert.equal(stillNeeded(24, 24), 'All pledged!');
});
