/**
 * School years for the photo gallery, named by the year they end in (2027 = 2026–27), the same as
 * app.school_year_end in the database: a school year starts July 1.
 */

/** The school year a day (YYYY-MM-DD) falls in. */
export function schoolYearOf(day: string): number {
  const [y, m] = day.split('-').map(Number);
  return m >= 7 ? y + 1 : y;
}

/** "2026–27". */
export function schoolYearLabel(year: number): string {
  return `${year - 1}–${String(year).slice(2)}`;
}
