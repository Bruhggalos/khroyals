/** policy: internal API implementation. Screens import the connect facade. */
import type { Access, Person, Sport } from './types';

/** Staff the office has put on car line duty (the database checks the same rule). */
export const onCarlineDuty = (p: Person | null) => !!p?.carlineDuty && ['admin', 'teacher', 'staff'].includes(p.schoolRole);

/** Manages this sport: a coach on its staff, or someone with the (verified) sports.manage permission. */
export const canManageSport = (sport: Sport, access: Access | null, me: Person | null) =>
  !!access?.permissions.includes('sports.manage')
  || (!!me && ['admin', 'teacher', 'staff'].includes(me.schoolRole) && sport.coachIds.includes(me.id));

/** Parents, staff and Family accounts volunteer; the office picks Volunteer Leaders (the database checks the same). */
export const canVolunteer = (p: Person | null) => !!p && !p.pending && ['parent', 'teacher', 'staff', 'admin', 'family'].includes(p.schoolRole);

/**
 * A Family account (a grandparent, say): car line pickup for the children the office linked,
 * Volunteer, Activities and the school's news, calendar and Handbook. No groups, Student app,
 * Marketplace or Ask the School; the database refuses those too.
 */
export const isFamily = (p: Person | null | undefined) => !!p && !p.pending && p.schoolRole === 'family';
/** Who buys event tickets: approved parents, teachers, staff and Family accounts (not students or substitutes). */
export const canBuyTickets = (p: Person | null | undefined) => !!p && !p.pending && ['parent', 'teacher', 'staff', 'admin', 'family'].includes(p.schoolRole);
/** A Substitute: closed by default; class tools come from the sub schedule, only while on duty (the server decides). */
export const isSubstitute = (p: Person | null | undefined) => !!p && !p.pending && p.schoolRole === 'substitute';

/** Teachers, staff and admins (who also get critical alerts). */
export const isSchoolStaff = (p: Person | null | undefined) => !!p && !p.pending && ['admin', 'teacher', 'staff'].includes(p.schoolRole);

export const isVolunteerLead = (p: Person | null) => canVolunteer(p) && !!p?.volunteerLead && p?.schoolRole !== 'family';
