/** Activities hooks: a ticking clock for countdowns, and "Are you going?" for the events on screen. */
import { useCallback, useEffect, useState } from 'react';
import {
  eventAttendance, isFamily, myChildren, myRsvps, sportRegistrations,
  type Person, type SportAttendance, type SportEvent, type SportRegistration, type SportRsvp,
} from '../api/connect';

/** Now, every `ms` (30 s by default), so countdowns move. */
export function useNow(ms = 30_000) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), ms); return () => clearInterval(t); }, [ms]);
  return now;
}

/**
 * For these events: which of your people answer (your registered children, or you if you're a
 * registered student), your answers, and, for events you lead, who's coming.
 */
export function useEventPeople(me: Person | null, events: SportEvent[]) {
  const [kids, setKids] = useState<Person[]>([]);
  const [regs, setRegs] = useState<SportRegistration[]>([]);
  const [answers, setAnswers] = useState<SportRsvp[]>([]);
  const [attendance, setAttendance] = useState<SportAttendance[]>([]);
  const ids = events.map((e) => e.id);
  const key = ids.join(',');
  const reload = useCallback(async () => {
    if (!me || me.pending || !ids.length) { setRegs([]); setAnswers([]); setAttendance([]); return; }
    const seasons = [...new Set(events.map((e) => e.seasonId))];
    try {
      const [k, r, a, at] = await Promise.all([
        me.schoolRole === 'student' ? [me] : isFamily(me) ? [] : myChildren(),
        sportRegistrations(seasons), myRsvps(ids), eventAttendance(ids).catch(() => []),
      ]);
      setKids(k); setRegs(r); setAnswers(a); setAttendance(at);
    } catch { /* offline: keep what's showing */ }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [me?.id, me?.pending, key]);
  useEffect(() => { reload(); }, [reload]);

  const peopleFor = (e: SportEvent) => regs
    .filter((r) => r.seasonId === e.seasonId && r.status === 'registered' && kids.some((k) => k.id === r.studentId))
    .map((r) => {
      const k = kids.find((x) => x.id === r.studentId)!;
      return { id: k.id, name: k.id === me?.id ? 'You' : `${k.firstName} ${k.lastName}`.trim() };
    });
  const attendanceFor = (e: SportEvent) => attendance.filter((a) => a.eventId === e.id);
  return { peopleFor, attendanceFor, answers, reload };
}
