import { GRADES } from './grades';

/** Empty means no grade restriction; invalid input must never widen the audience. */
export function parseGrades(text: string): number[] | undefined {
  if (!text.trim()) return undefined;
  const values = text.split(',').map((part) => part.trim());
  if (values.some((part) => !/^-?\d+$/.test(part) || !GRADES.some((g) => g.value === Number(part)))) {
    throw new Error('Choose grades from K2 (-3) through 12. Separate them with commas; Kindergarten is 0.');
  }
  return [...new Set(values.map(Number))];
}
