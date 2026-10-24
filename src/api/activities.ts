import { replacePhoto, removeStoredPhoto } from './storage';
import { subscribeChanges } from './realtime';
/** activities: internal API implementation. Screens import the connect facade. */
import { enumValue } from './validation';
import { CATEGORIES } from '../sports/categories';
import { sampleSports } from '../sports/sample';
import type { Category } from '../sports/categories';
import type { MySport, Sport, SportAttendance, SportEvent, SportRegistration, SportRsvp, SportSeason } from './types';
import { live, rpc, run, sb } from './client';
import { current } from './session';
import { avatarUrl, signAvatars } from './storage';
import { toRegistration, toSeason, toSportEvent } from './mappers';

export const noServer = () => { throw new Error('Activities need the school server; this build is running on demo data.'); };

/** Every activity with its coaches or directors, and every season (anyone may read them, signed out too). */
export async function listSports(): Promise<{ sports: Sport[]; seasons: SportSeason[] }> {
  if (!live) { const { sports, seasons } = sampleSports(); return { sports, seasons }; }
  const [sports, coaches, seasons] = await Promise.all([
    run(sb().from('sports').select('*').order('name')),
    run(sb().from('sport_coaches').select('sport_id, user_id')),
    run(sb().from('sport_seasons').select('*').order('starts_on')),
  ]);
  // Team photos are private to approved accounts; signed-out visitors see the emoji.
  if (current && !current.pending) await signAvatars(sports.map((x) => x.photo_path)).catch(() => {});
  return {
    sports: sports.map((x) => ({
      id: x.id, name: x.name, icon: x.icon, description: x.description, category: enumValue(x.category, CATEGORIES.map((c) => c.key)),
      coachIds: coaches.filter((c) => c.sport_id === x.id).map((c) => c.user_id),
      photoPath: x.photo_path ?? null, photo: current && !current.pending ? avatarUrl(x.photo_path) : '',
    })),
    seasons: seasons.map(toSeason),
  };
}

/** An activity's schedule from a few hours ago on (games still being played count), or all of it with `past`. */
export async function sportSchedule(seasonIds: string[], opts: { past?: boolean } = {}): Promise<SportEvent[]> {
  if (!seasonIds.length) return [];
  if (!live) return sampleSports().events.filter((e) => seasonIds.includes(e.seasonId));
  let query = sb().from('sport_events').select('*').in('season_id', seasonIds);
  if (!opts.past) query = query.gte('starts_at', new Date(Date.now() - 3 * 3600_000).toISOString());
  const rows = await run(query.order('starts_at'));
  return rows.map(toSportEvent);
}

/** The sports the signed-in person follows or has a registered child (or self) in. */
export async function mySports(): Promise<MySport[]> {
  if (!live || !current) return [];
  return ((await rpc('my_sports'))).map((r) => ({ sportId: r.sport_id, following: r.following, registered: r.registered }));
}

/** What's coming up for those sports. */
export async function mySportSchedule(days = 60): Promise<SportEvent[]> {
  if (!live || !current) return [];
  return ((await rpc('my_sport_schedule', { p_days: days }))).map(toSportEvent);
}

/** Sign-ups this person may see: their family's, or every sign-up for sports they manage. */
export async function sportRegistrations(seasonIds: string[]): Promise<SportRegistration[]> {
  if (!live || !current || !seasonIds.length) return [];
  const rows = await run(sb().from('sport_registrations').select('*').in('season_id', seasonIds).order('created_at'));
  return rows.map(toRegistration);
}

export async function followSport(sportId: string, follow: boolean) {
  if (!live) noServer();
  await rpc('sport_follow', { p_sport: sportId, p_follow: follow });
}

export async function saveSport(s: { id?: string | null; name: string; icon: string; description: string; category: Category }): Promise<{ id: string }> {
  if (!live) noServer();
  return rpc('sport_save', {
    p_id: s.id ?? null, p_name: s.name, p_icon: s.icon, p_description: s.description, p_category: s.category,
  }) as Promise<{ id: string }>;
}

export async function deleteSport(id: string) { if (!live) noServer(); await rpc('sport_delete', { p_id: id }); }

export async function setSportCoach(sportId: string, userId: string, on: boolean) {
  if (!live) noServer();
  await rpc('sport_set_coach', { p_sport: sportId, p_user: userId, p_on: on });
}

export async function saveSeason(s: Omit<SportSeason, 'id'> & { id?: string | null }) {
  if (!live) noServer();
  await rpc('season_save', {
    p_id: s.id ?? null, p_sport: s.sportId, p_name: s.name, p_starts: s.startsOn, p_ends: s.endsOn,
    p_signup_opens: s.signupOpens, p_signup_closes: s.signupCloses, p_min_grade: s.minGrade, p_max_grade: s.maxGrade,
    p_details: s.details, p_info_url: s.infoUrl,
  });
}

export async function deleteSeason(id: string) { if (!live) noServer(); await rpc('season_delete', { p_id: id }); }

export async function saveSportEvent(e: Omit<SportEvent, 'id' | 'cancelled'> & { id?: string | null }) {
  if (!live) noServer();
  await rpc('sport_event_save', {
    p_id: e.id ?? null, p_season: e.seasonId, p_kind: e.kind, p_title: e.title, p_starts: e.startsAt, p_ends: e.endsAt,
    p_location: e.location, p_home: e.home, p_notes: e.notes, p_address: e.address ?? null,
  });
}

export async function cancelSportEvent(id: string, cancelled: boolean) {
  if (!live) noServer();
  await rpc('sport_event_cancel', { p_id: id, p_cancelled: cancelled });
}

export async function deleteSportEvent(id: string) { if (!live) noServer(); await rpc('sport_event_delete', { p_id: id }); }

export async function registerForSport(seasonId: string, studentId: string, note: string) {
  if (!live) noServer();
  await rpc('sport_register', { p_season: seasonId, p_student: studentId, p_note: note });
}

export async function withdrawSportRegistration(id: string) { if (!live) noServer(); await rpc('sport_withdraw', { p_registration: id }); }

export async function decideSportRegistration(id: string, approve: boolean, note = '') {
  if (!live) noServer();
  await rpc('sport_decide', { p_registration: id, p_approve: approve, p_note: note });
}

/** Your family's answers for these schedule items. */
export async function myRsvps(eventIds: string[]): Promise<SportRsvp[]> {
  if (!live || !current || !eventIds.length) return [];
  const rows = await run(sb().from('sport_event_rsvps').select('*').in('event_id', eventIds));
  return rows.map((r) => ({ eventId: r.event_id, studentId: r.student_id, status: enumValue(r.status, ['going', 'not_going']) }));
}

/** Going, Not going, or null to clear. */
export async function answerRsvp(eventId: string, studentId: string, status: 'going' | 'not_going' | null) {
  await rpc('sport_rsvp', { p_event: eventId, p_student: studentId, p_status: status });
}

/** Who's coming, for the schedule items you lead (others come back empty). */
export async function eventAttendance(eventIds: string[]): Promise<SportAttendance[]> {
  if (!live || !current || !eventIds.length) return [];
  const rows = await rpc('sport_event_attendance', { p_events: eventIds });
  return rows.map((r) => ({ eventId: r.event_id, studentId: r.student_id, name: r.name, status: enumValue(r.status, ['going', 'not_going', 'none']) }));
}

/** Upload a JPEG (base64) as an activity's team photo (its coaches or directors and activity managers). */
export async function uploadSportPhoto(sportId: string, base64: string, oldPath?: string | null) {
  const path = `sports/${sportId}/${Date.now()}.jpg`;
  await replacePhoto(path, base64, () => rpc('set_sport_photo', { p_sport: sportId, p_path: path }), oldPath);
}

export async function removeSportPhoto(sportId: string, oldPath?: string | null) {
  await rpc('set_sport_photo', { p_sport: sportId, p_path: null });
  await removeStoredPhoto('avatars', oldPath).catch(() => {});
}

export function subscribeSports(onChange: () => void): () => void {
  return subscribeChanges('subscribeSports', [{ event: '*', table: 'sport_events' }, { event: '*', table: 'sport_registrations' }, { event: '*', table: 'sport_event_rsvps' }], onChange);
}
