/**
 * The school's car line traffic flow (assets/carline/traffic-flow.png, from the
 * Traffic Flow Map): all traffic enters from Holmes Avenue; K2–K4 follow the blue line to
 * the entrance by the playground, Kindergarten–12th the red line to the entrance by the KH
 * office, and both merge into one lane out onto 14th Street. No app imports, so tests run it.
 */
export type PickupLine = 'k2-k4' | 'k-12';

export const LINES: Record<PickupLine, { name: string; line: string; entrance: string; color: string }> = {
  'k2-k4': { name: 'K2–K4', line: 'Blue line', entrance: 'by the playground', color: '#3B4EA3' },
  'k-12': { name: 'K–12th', line: 'Red line', entrance: 'by the KH office', color: '#D7141D' },
};

/** K2, K3 and K4 (grades −3 to −1) take the blue line; Kindergarten through 12th the red line. */
export const lineFor = (grade: number | null | undefined): PickupLine | null =>
  grade == null ? null : grade < 0 ? 'k2-k4' : 'k-12';

/** The lines a family drives for these children: one, both, or none when no grade is known. */
export function familyLines(grades: (number | null | undefined)[]): PickupLine[] {
  const lines = new Set(grades.map(lineFor));
  return (['k2-k4', 'k-12'] as const).filter((l) => lines.has(l));
}

/** The map's rules, as the school wrote them. */
export const TRAFFIC_RULES = [
  'All traffic must enter from Holmes Avenue.',
  'K2–K4 follow the blue line for drop-off and pickup.',
  'K–12th follow the red line for drop-off and pickup.',
  'Families with students in both drop-off locations need to complete one drop-off line before entering the second.',
  'Student parking is in the red parking lot (Lot 14).',
  'All traffic must merge into one lane and exit onto 14th Street.',
];
