/**
 * The More tab's menu, from the website's: the footer's Quick Links as a drop-down at
 * the top (without Family Portal, which is in the menu, and with the menu's current
 * School Calendar; the footer's is last year's), then Student Life; no Admissions or
 * News; and Employment as a link next to Family Portal (the footer's buttons aren't
 * shown). Shaped here, not in the
 * imported content, so a fresh import of khroyals.com keeps it. No app imports, so
 * tests run it.
 */
import type { Link, NavItem } from './types';

const LEFT_OUT = ['Admissions', 'News'];
const FIRST = 'Student Life';
const CALENDAR = /^School Calendar/i;

export function moreMenu(navigation: NavItem[], footer: { actions: Link[]; quickLinks: Link[] }): NavItem[] {
  const nav = navigation.filter((n) => !LEFT_OUT.includes(n.label));
  const menu = [...nav.filter((n) => n.label === FIRST), ...nav.filter((n) => n.label !== FIRST)];
  const employment = footer.actions.find((a) => a.label === 'Employment');
  if (employment) {
    const at = menu.findIndex((n) => n.label === 'Family Portal');
    menu.splice(at < 0 ? menu.length : at + 1, 0, { label: employment.label, url: employment.url });
  }
  const calendar = nav.flatMap((n) => n.items ?? []).find((i) => CALENDAR.test(i.label));
  const quick = footer.quickLinks.filter((l) => l.label !== 'Family Portal')
    .map((l) => (calendar && CALENDAR.test(l.label) ? { ...l, url: calendar.url } : l));
  if (quick.length) menu.unshift({ label: 'Quick Links', items: quick });
  return menu;
}
