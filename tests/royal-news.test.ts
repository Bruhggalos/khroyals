/** Royal News: reading a Smore newsletter page into the app's blocks (supabase/functions/import-newsletter/smore.ts). */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { isoDate, paragraphs, parseSmore, smoreUrl, type NewsBlock } from '../supabase/functions/import-newsletter/smore';

const page = readFileSync(join(__dirname, 'fixtures/smore-royals-news.html'), 'utf8');
const issue = parseSmore(page, 'https://app.smore.com/n/ms70g-royals-news');
const texts = issue.blocks.filter((b): b is Extract<NewsBlock, { kind: 'text' }> => b.kind === 'text');

test('only Smore newsletter links are read, tidied to the page address', () => {
  assert.equal(smoreUrl('https://app.smore.com/n/ms70g-royals-news?ref=email'), 'https://app.smore.com/n/ms70g-royals-news');
  assert.equal(smoreUrl(' https://www.smore.com/n/ms70g '), 'https://app.smore.com/n/ms70g');
  for (const bad of ['http://app.smore.com/n/ms70g', 'https://evil.com/n/ms70g', 'https://app.smore.com.evil.com/n/x',
    'https://app.smore.com/u/someone', 'not a link']) assert.equal(smoreUrl(bad), null, bad);
});

test('an issue: its title and date, section headings, items, pictures and links', () => {
  assert.equal(issue.title, 'Royals News');
  assert.equal(issue.sentOn, '2026-10-23');
  assert.deepEqual(issue.blocks[0], { kind: 'heading', text: 'Important Information' });
  assert.deepEqual(texts.map((t) => t.title), ['PE Uniform Store Open', 'KH Merch Store', 'Save the Date: K-12 Parent Meeting',
    'Save the Dates: Spirit Week', 'Fall Fest 🍂', 'Dunk Tank for D.C. 💦', 'Rocktober Family Night']);
  assert.deepEqual(issue.blocks.filter((b) => b.kind === 'image').map((b) => (b as { src: string }).src), [
    'https://cdn.smore.com/u/41af/fd4379908e725054da77cef57f0a77d3.png', 'https://cdn.smore.com/u/6c1d/9fea8d7f94ffe455d885e074ca3cdb46.jpeg']);
  const fallFest = texts.find((t) => t.title?.startsWith('Fall Fest'))!;
  assert.deepEqual(fallFest.paragraphs[1], [{ text: '• K2-K4:', bold: true }, { text: ' 9:00-10:30 AM' }], 'list items keep their bullet');
  assert.deepEqual(fallFest.paragraphs.at(-1), [{ text: 'Sign up here.', href: 'https://my.cheddarup.com/c/fall-festival-volunteers-91147/forms' }]);
});

test('links keep their real address; tracking links (which can name the reader) are dropped', () => {
  const links = JSON.stringify(issue.blocks);
  assert.ok(!/edulnk|__\$u__|nk=/.test(links));
  const pe = texts[0].paragraphs[1];
  assert.equal(pe.map((s) => s.text).join(''), 'To order, visit www.khroyals.com and navigate to Student Life > PE Uniform Store.');
  assert.ok(pe.every((s) => !s.href), 'the tracked www.khroyals.com link stays as plain text');
  assert.deepEqual(paragraphs('<p>Go <a href="javascript:alert(1)">here</a> or <a o-href="https://khroyals.com/x" href="https://76d0.edulnk.com/r?__$u__">there</a></p>'),
    [[{ text: 'Go here or ' }, { text: 'there', href: 'https://khroyals.com/x' }]]);
});

test('dates under the title', () => {
  assert.equal(isoDate('October 23, 2026'), '2026-10-23');
  assert.equal(isoDate('Sept 3, 2026'), null);
  assert.equal(isoDate(null), null);
});
