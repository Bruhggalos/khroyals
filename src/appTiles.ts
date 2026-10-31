/**
 * Which Main Page tiles a person sees, and which show as staff versions. No app imports,
 * so tests run it.
 *
 * - `family: false` keeps a tile off Family accounts' page; `student: false` off students'.
 * - `staffOnly` tiles (Alerts) and `adminOnly` tiles (the admin portal) show only in staff view.
 * - `staffVersion` tiles (Car Line, Ask the School) open in their staff version in staff view.
 * - `studentApp` tiles (Ask the Teacher, Assignments) are for students, and for staff in
 *   staff view (the teacher side).
 * - `inStaffView: false` tiles (Student, News, Marketplace, Volunteer, Handbook) are left out of the
 *   staff view; staff find them on the Standard view.
 * - Substitutes see only the tiles marked `sub` (their Sub Days and the public apps); `subOnly`
 *   tiles are theirs alone.
 *
 * In staff view the staff versions (elevated, marked in gold) come first, then the rest, each
 * group in the order the tiles are listed.
 */
export type TileRules = {
  family?: false; student?: false; inStaffView?: false; staffOnly?: true; adminOnly?: true; staffVersion?: true; studentApp?: true; sub?: true; subOnly?: true;
};

/**
 * `staffView`: a teacher, staff member or admin with the Main Page switch on Staff.
 * `student`: a student account. `substitute`: a Substitute account. `admin`: has admin powers.
 */
export type Viewer = { staffView: boolean; family: boolean; admin: boolean; student?: boolean; substitute?: boolean };

export function visibleTiles<T extends TileRules>(tiles: T[], v: Viewer): (T & { elevated: boolean })[] {
  return tiles
    .filter((t) => (t.subOnly || v.substitute ? !!v.substitute && !!t.sub
      : v.staffView && t.inStaffView === false ? false
      : t.adminOnly ? v.staffView && v.admin
      : t.staffOnly ? v.staffView
      : t.studentApp ? !!v.student || v.staffView
      : v.student ? t.student !== false
      : !(v.family && t.family === false)))
    .map((t) => ({ ...t, elevated: v.staffView && !!(t.staffOnly || t.adminOnly || t.staffVersion || t.studentApp) }))
    .sort((a, b) => Number(b.elevated) - Number(a.elevated));
}
