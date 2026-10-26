/** calendar: internal API implementation. Screens import the connect facade. */
import type { DressDay, GroupEvent, NewEvent } from './types';
import { live, rpc, run, sb } from './client';
import { toEvent } from './mappers';
import { current } from './session';
import { listMyGroups } from './groups';

/** School calendar plus the calendars of every group the person can see. */
export async function listEvents(): Promise<GroupEvent[]> {
  return (await run(sb().from('events').select('*, groups(name, icon)').order('starts_on'))).map(toEvent);
}

export async function createEvent(e: NewEvent) {
  await run(sb().from('events').insert({
    group_id: e.groupId, title: e.title, description: e.description ?? null, starts_on: e.date, ends_on: e.endDate,
    start_time: e.startTime || null, end_time: e.endTime || null, all_day: !e.startTime, location: e.location || null,
    category: e.category, created_by: current?.id,
  }));
}

export async function deleteEvent(id: string) { await run(sb().from('events').delete().eq('id', id)); }

/** Calendars the person may add events to: the school calendar (admins) and groups they moderate. */
export async function editableCalendars(): Promise<{ groupId: string | null; name: string }[]> {
  const p = current;
  if (!live || !p) return [];
  const groups = await listMyGroups();
  if (p.schoolRole === 'admin') return [{ groupId: null, name: 'School calendar' }, ...groups.map((g) => ({ groupId: g.id, name: g.name }))];
  const mine = await run(sb().from('memberships').select('group_id, role').eq('user_id', p.id).in('role', ['owner', 'moderator']));
  const ids = new Set(mine.map((m) => m.group_id));
  return groups.filter((g) => ids.has(g.id)).map((g) => ({ groupId: g.id, name: g.name }));
}

/** Dress-up days (Spirit Week) from one day through another. Everyone can read them, signed out too. */
export async function listDressDays(from: string, to: string): Promise<DressDay[]> {
  if (!live) return [];
  const rows = await run(sb().from('dress_days').select('*').gte('on_date', from).lte('on_date', to).order('on_date').order('title'));
  return rows.map((r) => ({
    id: r.id, week: r.week, date: r.on_date, title: r.title, details: r.details, gradeFrom: r.grade_from, gradeTo: r.grade_to,
  }));
}

/** School calendar editors: add a dress-up day (no id) or change one. */
export async function saveDressDay(d: Omit<DressDay, 'id'> & { id?: string | null }): Promise<string> {
  return rpc('dress_day_save', {
    p_id: d.id ?? null, p_week: d.week, p_on: d.date, p_title: d.title, p_details: d.details,
    ...(d.gradeFrom != null && d.gradeTo != null ? { p_grade_from: d.gradeFrom, p_grade_to: d.gradeTo } : {}),
  });
}

export async function deleteDressDay(id: string) { await rpc('dress_day_delete', { p_id: id }); }
