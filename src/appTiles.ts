/**
 * Which Main Page tiles a person sees, and which show as staff versions. No app imports,
 * so tests run it.
 *
 * - `family: false` keeps a tile off Family accounts' page; `student: false` off students'.
 * - `staffOnly` tiles (Alerts) and `adminOnly` tiles (the admin portal) show only in staff view.
 * - `staffVersion` tiles (Car Line, Ask the School) open in their staff version in staff view.
 * - `studentApp` tiles (Ask the Teacher, Assignments) are for students, and for staff in
 *   staff view (the teacher side).
 */
export type TileRules = { family?: false; student?: false; staffOnly?: true; adminOnly?: true; staffVersion?: true; studentApp?: true };

/**
 * `staffView`: a teacher, staff member or admin with the Main Page switch on Staff.
 * `student`: a student account. `admin`: has admin powers.
 */
export type Viewer = { staffView: boolean; family: boolean; admin: boolean; student?: boolean };

export function visibleTiles<T extends TileRules>(tiles: T[], v: Viewer): (T & { elevated: boolean })[] {
  return tiles
    .filter((t) => (t.adminOnly ? v.staffView && v.admin
      : t.staffOnly ? v.staffView
      : t.studentApp ? !!v.student || v.staffView
      : v.student ? t.student !== false
      : !(v.family && t.family === false)))
    .map((t) => ({ ...t, elevated: v.staffView && !!(t.staffOnly || t.adminOnly || t.staffVersion || t.studentApp) }));
}
