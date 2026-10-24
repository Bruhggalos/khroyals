/** src/site/moreMenu.ts: the More tab's menu, reshaped from the website's. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { moreMenu } from '../src/site/moreMenu';
import type { Link, NavItem } from '../src/site/types';

const site = JSON.parse(readFileSync(join(__dirname, '../content/site/site.json'), 'utf8')) as {
  navigation: NavItem[]; footer: { actions: Link[]; quickLinks: Link[] };
};

test('Quick Links first, then Student Life; no Admissions or News; Employment beside Family Portal', () => {
  const menu = moreMenu(site.navigation, site.footer);
  assert.deepEqual(menu.map((n) => [n.label, n.items ? 'menu' : 'link']), [
    ['Quick Links', 'menu'], ['Student Life', 'menu'], ['About', 'menu'], ['Academics', 'menu'], ['Invest', 'menu'],
    ['Family Portal', 'link'], ['Employment', 'link'], ['Student Support', 'menu'],
  ]);
  assert.equal(menu.find((n) => n.label === 'Employment')!.url, site.footer.actions.find((a) => a.label === 'Employment')!.url);
  const calendar = site.navigation.find((n) => n.label === 'Student Life')!.items!.find((i) => i.label.startsWith('School Calendar'))!;
  assert.deepEqual(menu[0].items!.map((l) => l.label), ['Video/Photography Policy', 'School Calendar', 'Uniforms', 'Giving'], 'no Family Portal');
  assert.equal(menu[0].items!.find((l) => l.label === 'School Calendar')!.url, calendar.url, "this year's calendar, from the menu");
  assert.match(calendar.url, /2026-2027/);
});

test('still works if the website drops Family Portal or Employment', () => {
  const nav: NavItem[] = [{ label: 'About', items: [] }, { label: 'Student Life', items: [] }];
  assert.deepEqual(moreMenu(nav, { actions: [{ label: 'Employment', url: 'https://jobs' }], quickLinks: [] }).map((n) => n.label),
    ['Student Life', 'About', 'Employment']);
  assert.deepEqual(moreMenu(nav, { actions: [], quickLinks: [] }).map((n) => n.label), ['Student Life', 'About']);
});
