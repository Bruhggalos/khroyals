/** src/site/faq.ts: the home page's F.A.Q.s move from the Info tab to Ask the School. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { faqSection, isFaqSection } from '../src/site/faq';
import type { Section } from '../src/site/types';

const home = JSON.parse(readFileSync(join(__dirname, '../content/site/home.json'), 'utf8')) as { sections: Section[] };

test('the home page has one F.A.Q.s section, which the Info tab leaves out', () => {
  assert.equal(home.sections.filter(isFaqSection).length, 1);
  assert.ok(home.sections.filter((s) => !isFaqSection(s)).length > 5, 'the rest of the home page stays');
});

test('Ask the School shows the questions and answers without the F.A.Q.s heading or photo', () => {
  const faq = faqSection(home.sections)!;
  assert.ok(!faq.blocks.some((b) => b.type === 'heading' || b.type === 'image'));
  assert.ok(faq.blocks.some((b) => b.type === 'button' && /contact/i.test(b.label)), 'Contact Us stays');
  const accordion = faq.blocks.find((b) => b.type === 'accordion');
  assert.ok(accordion && accordion.type === 'accordion' && accordion.items.length >= 5);
  assert.ok(accordion.items.some((i) => /tuition/i.test(i.title)));
});

test('headings like "FAQ" and "F.A.Q.s" both count; other headings do not', () => {
  const sec = (text: string): Section => ({ blocks: [{ type: 'heading', level: 2, text }] });
  assert.ok(isFaqSection(sec('F.A.Q.s')));
  assert.ok(isFaqSection(sec('FAQ')));
  assert.ok(!isFaqSection(sec('Fine Arts')));
  assert.equal(faqSection([sec('Our Story')]), null);
});
