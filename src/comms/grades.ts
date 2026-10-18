/** School grades: K2 = -3, K3 = -2, K4 = -1, Kindergarten = 0, then 1–12 (same as app.grade_label in the database). */
export const GRADES: { value: number; label: string; short: string }[] = [
  { value: -3, label: 'K2', short: 'K2' }, { value: -2, label: 'K3', short: 'K3' }, { value: -1, label: 'K4', short: 'K4' },
  { value: 0, label: 'Kindergarten', short: 'K' },
  ...Array.from({ length: 12 }, (_, i) => {
    const n = i + 1;
    const suffix = n === 1 ? 'st' : n === 2 ? 'nd' : n === 3 ? 'rd' : 'th';
    return { value: n, label: `${n}${suffix}`, short: String(n) };
  }),
];

export function gradeLabel(g: number | null | undefined) {
  if (g == null) return '';
  if (g > 12) return 'Graduated';
  return GRADES.find((x) => x.value === g)?.label ?? (g < -3 ? 'K2' : `${g}th`);
}
