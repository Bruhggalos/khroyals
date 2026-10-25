/**
 * Form fees: how a payment can be made (also the database check on form_payments.method;
 * tests/form-payments.test.ts keeps them matched), the usual places it's handed in, and
 * dollars. No app imports, so tests run it.
 */
import type { PaymentMethod } from '../api/types';

export const PAYMENT_METHODS: { value: PaymentMethod; label: string }[] = [
  { value: 'cash', label: 'Cash' }, { value: 'check', label: 'Check' }, { value: 'card', label: 'Card' },
  { value: 'online', label: 'Online' }, { value: 'other', label: 'Other' },
];
export const methodLabel = (m: PaymentMethod) => PAYMENT_METHODS.find((x) => x.value === m)?.label ?? m;

/** Where payments are usually handed in; anything else can be typed. */
export const HANDED_IN = ['Front office', 'Teacher', 'Coach', 'Online'];

/** 2500 → "$25.00". */
export const money = (cents: number) => (cents / 100).toLocaleString('en-US', { style: 'currency', currency: 'USD' });

/** "25", "$25.50", "1,200" → cents; null if it isn't an amount from $0.01 to $100,000. */
export function parseDollars(text: string): number | null {
  const clean = text.replace(/[$,\s]/g, '');
  if (!/^\d+(\.\d{1,2})?$/.test(clean)) return null;
  const cents = Math.round(Number(clean) * 100);
  return cents >= 1 && cents <= 10_000_000 ? cents : null;
}
