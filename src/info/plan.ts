/**
 * One day on the Planner tab, from what's loaded once for the two weeks: whether there's
 * school, the uniform, the student's (or teacher's) assignments, a card for each of a
 * parent's children (their class assignments, activities and forms to sign), and the day's other
 * things (school events, activities, volunteer sign-ups, car line hours). No app
 * imports, so tests run it.
 */
import type { Ionicons } from '@expo/vector-icons';
import type { Assignment, ChildAssignment, MyCalendarItem, Opportunity, Signup, Sport, SportEvent, SportRegistration, SportSeason } from '../api/types';
import { clock, hoursLabel } from '../carline/time';
import { itemTime } from '../myCalendar/when';
import { assignmentsOn, dayLabel, dayOf, eventsToday, noSchool, uniformFor, type DressTheme, type Uniform } from './today';

type Icon = React.ComponentProps<typeof Ionicons>['name'];
/** One thing on a day: what, a detail line, and where tapping it goes. */
export type Row = { key: string; icon: Icon; title: string; detail?: string; href?: string; tone?: 'accent' | 'muted' | 'green' };
export type Kid = { id: string; firstName: string; grade: number | null | undefined };
type CalendarDay = { id: string; date: string; endDate: string | null; title: string; category: string };

export type InfoData = {
  /** Whose assignments the Assignments card shows: a student's own, or a teacher's classes'. */
  assigns: 'student' | 'teacher' | null;
  assignments: Assignment[];
  /** A parent's children, and what their teachers assigned. */
  kids: Kid[];
  kidAssignments: ChildAssignment[];
  /** Open forms still to sign, and for which children. */
  forms: { id: string; title: string; dueOn: string; waiting: string[] }[];
  schedule: SportEvent[]; sports: Sport[]; seasons: SportSeason[];
  /** The children's activity sign-ups, to put each event on the right child's card. */
  registrations: SportRegistration[];
  opportunities: Opportunity[];
  /** The signed-in person's own volunteer sign-ups. */
  signups: Signup[];
  /** Pickup hours, for whoever picks children up. */
  carline: { start: string; end: string; openNow: boolean } | null;
  /** A teacher's or staff member's own calendar (My calendar). */
  myCalendar?: MyCalendarItem[];
};

export const NO_DATA: InfoData = {
  assigns: null, assignments: [], kids: [], kidAssignments: [], forms: [], schedule: [], sports: [], seasons: [],
  registrations: [], opportunities: [], signups: [], carline: null,
};

export type DayPlan = {
  day: string; label: string; dayOff: string | null; uniform: Uniform | null;
  assignments: { teacher: boolean; overdue: Assignment[]; due: Assignment[] } | null;
  kids: { kid: Kid; rows: Row[] }[];
  items: Row[];
  /** Something on this day for this person (the date strip's dot). */
  busy: boolean;
};

export function planDay(day: string, today: string, calendar: CalendarDay[], d: InfoData, grades: (number | null | undefined)[] = [],
  dress: DressTheme[] = []): DayPlan {
  const dayOff = noSchool(day, calendar);
  const wearers = d.kids.length ? d.kids.map((k) => ({ name: k.firstName, grade: k.grade })) : grades;

  // Assignments: a student's due (and, today, overdue); a teacher's due in their classes.
  let assignments: DayPlan['assignments'] = null;
  if (d.assigns === 'student') assignments = { teacher: false, ...assignmentsOn(d.assignments, day, today) };
  else if (d.assigns === 'teacher' && d.assignments.length) assignments = { teacher: true, overdue: [], due: assignmentsOn(d.assignments, day, today).due };

  // Activities on this day, each on the card of the children registered for it (else in the day's list).
  const sportOf = (seasonId: string) => d.sports.find((x) => x.id === d.seasons.find((se) => se.id === seasonId)?.sportId);
  const activity = (e: SportEvent, key: string): Row => {
    const sport = sportOf(e.seasonId);
    return {
      key, icon: 'trophy-outline', tone: e.cancelled ? 'muted' : 'accent',
      title: sport && !e.title.includes(sport.name) ? `${sport.name}: ${e.title}` : e.title,
      detail: e.cancelled ? 'Cancelled' : [clock(e.startsAt), e.location].filter(Boolean).join(' · '),
      href: sport ? `/activities/${sport.id}` : '/activities',
    };
  };
  const going = (e: SportEvent) => d.registrations
    .filter((r) => r.status === 'registered' && r.seasonId === e.seasonId).map((r) => r.studentId);
  const games = d.schedule.filter((e) => dayOf(e.startsAt) === day).sort((a, b) => a.startsAt.localeCompare(b.startsAt));

  const kids = d.kids.map((kid) => ({
    kid,
    rows: [
      ...d.kidAssignments.filter((a) => a.studentId === kid.id && a.dueOn === day).map((a): Row => ({
        key: `ka-${kid.id}-${a.id}`, icon: 'document-text-outline', title: a.title, detail: a.className,
      })),
      ...games.filter((e) => going(e).includes(kid.id)).map((e) => activity(e, `kg-${kid.id}-${e.id}`)),
      // A form to sign shows on its due day, and on today while it's overdue.
      ...d.forms.filter((f) => f.waiting.includes(kid.id) && (f.dueOn === day || (day === today && f.dueOn < today))).map((f): Row => ({
        key: `kf-${kid.id}-${f.id}`, icon: 'create-outline', tone: 'accent', title: `Sign: ${f.title}`,
        detail: f.dueOn === day ? 'Form due' : 'Form overdue', href: `/forms/${f.id}`,
      })),
    ],
  })).filter((k) => k.rows.length || !dayOff);

  // My calendar: the person's own events, and the activity items they plan to go to (shown once).
  const mine = (d.myCalendar ?? []).filter((i) => i.date === day);
  const planned = new Set(mine.map((i) => i.sportEventId).filter(Boolean));
  const items: Row[] = [
    ...eventsToday(day, calendar).map((e): Row => ({ key: `cal-${e.id}`, icon: 'calendar-outline', title: e.title, detail: e.category, href: '/calendar' })),
    ...mine.map((i): Row => ({
      key: `my-${i.id}`, icon: 'person-circle-outline', tone: i.cancelled ? 'muted' : undefined, title: i.title, href: '/my-calendar',
      detail: i.cancelled ? 'Cancelled' : [itemTime(i.startTime, i.endTime), i.location].filter(Boolean).join(' · '),
    })),
    ...games.filter((e) => !planned.has(e.id) && !going(e).some((id) => d.kids.some((k) => k.id === id))).map((e) => activity(e, `sport-${e.id}`)),
  ];
  for (const sgn of d.signups) {
    const o = d.opportunities.find((x) => x.id === sgn.opportunityId);
    if (!o || o.status !== 'open' || o.startsOn > day || (o.endsOn ?? o.startsOn) < day) continue;
    const when = o.startTime && o.endTime ? hoursLabel(o.startTime, o.endTime) : o.startTime ? clock(`${day}T${o.startTime}`) : null;
    items.push({
      key: `vol-${o.id}`, icon: 'hand-left-outline', tone: 'green', title: o.title, href: `/volunteer/${o.id}`,
      detail: o.kind === 'items' ? `Bring ${sgn.quantity ?? ''} ${o.item ?? 'items'}`.replace(/\s+/g, ' ') : ['You signed up', when, o.location].filter(Boolean).join(' · '),
    });
  }
  const busy = items.length > 0 || kids.some((k) => k.rows.length > 0) || !!assignments?.due.length || !!assignments?.overdue.length;
  if (d.carline && !dayOff) {
    items.push({
      key: 'carline', icon: 'car-outline', title: 'Car line pickup', href: '/carline',
      detail: `${hoursLabel(d.carline.start, d.carline.end)}${day === today && d.carline.openNow ? ' · Open now' : ''}`,
    });
  }

  return { day, label: dayLabel(day, today), dayOff, uniform: uniformFor(day, calendar, wearers, dress), assignments, kids, items, busy };
}
