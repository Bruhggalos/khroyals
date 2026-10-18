import { getUser, type Condition, type MarketLine } from '../api/connect';

export const money = (cents: number) => (cents / 100).toLocaleString('en-US', { style: 'currency', currency: 'USD' });

/** "12", "$12.50" → cents; null if it isn't a price. */
export const parseMoney = (text: string): number | null => {
  const t = text.replace(/[$,\s]/g, '');
  return /^\d+(\.\d{0,2})?$/.test(t) ? Math.round(Number(t) * 100) : null;
};

export const CONDITIONS: { key: Condition; label: string }[] = [
  { key: 'new', label: 'New' }, { key: 'like_new', label: 'Like new' }, { key: 'good', label: 'Good' }, { key: 'fair', label: 'Fair' },
];
export const conditionLabel = (c: Condition) => CONDITIONS.find((x) => x.key === c)?.label ?? c;

export const nameOf = (id: string | null) => {
  const p = id ? getUser(id) : undefined;
  return p ? `${p.firstName} ${p.lastName}`.trim() : 'Someone';
};

/** Lines still in the running (not withdrawn or declined). */
export const inLine = (l: MarketLine) => l.status === 'agreed' || l.status === 'offered' || l.status === 'countered';

export const when = (iso: string) => {
  const d = new Date(iso);
  const today = d.toDateString() === new Date().toDateString();
  return today ? d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }) : d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
};

export { ask } from '../ui';

/** What deleting does at each stage. */
export function deleteWarning(l: { status: string }) {
  if (l.status === 'pending') return 'The sale is off: your buyer is told, and the post disappears from the Marketplace.';
  if (l.status === 'sold') return 'It disappears from your list.';
  return 'It disappears from the Marketplace, and anyone in line is told.';
}
