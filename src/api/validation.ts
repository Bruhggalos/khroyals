import type { Json } from './database.types';

/** Narrow database text checks at the API boundary instead of asserting a union. */
export function enumValue<const T extends string>(value: unknown, values: readonly T[]): T {
  const match = values.find((v) => v === value);
  if (match === undefined) throw new Error(`Unexpected value from the school server: ${String(value)}`);
  return match;
}

export function jsonObject(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Invalid object from the school server.');
  return value as Record<string, unknown>;
}

/** Explicit serialization also removes undefined values before passing objects to PostgREST. */
export function jsonValue(value: object): Json { return JSON.parse(JSON.stringify(value)) as Json; }
