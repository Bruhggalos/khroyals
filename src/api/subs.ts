/**
 * subs: internal API implementation for substitutes. Screens import the connect facade.
 * Teachers schedule a sub for the classes they lead, and the office (subs.manage) for any class;
 * a sub sees their own days, with the sub plans only while on duty. The database checks who may.
 */
import type { SubDay, SubOptions } from './types';
import { live, rpc } from './client';

const noServer = () => { throw new Error('Substitutes need the school server; this build is running on demo data.'); };

/** The signed-in sub's days from today on (plans only while on duty). */
export async function mySubDays(): Promise<SubDay[]> {
  if (!live) return [];
  return (await rpc('my_sub_days')) as SubDay[];
}

/** The sub days the signed-in teacher or office can see and change, from today on. */
export async function subSchedule(): Promise<SubDay[]> {
  if (!live) return [];
  return (await rpc('sub_schedule_list')) as SubDay[];
}

/** The classes the signed-in person can schedule a sub for, and who can cover them (substitutes first). */
export async function subOptions(): Promise<SubOptions> {
  if (!live) return { classes: [], people: [] };
  return (await rpc('sub_options')) as SubOptions;
}

/** Schedule a sub, or change a sub day (`id`). Returns its id; the sub is told. */
export async function saveSubDay(d: {
  id?: string | null; substituteId: string; classIds: string[]; startsOn: string; endsOn: string; startTime: string; endTime: string; plans: string;
}): Promise<string> {
  if (!live) noServer();
  return (await rpc('sub_schedule_save', {
    p_id: d.id ?? null, p_substitute: d.substituteId, p_sections: d.classIds, p_starts_on: d.startsOn, p_ends_on: d.endsOn,
    p_start_time: d.startTime, p_end_time: d.endTime, p_plans: d.plans,
  })) as string;
}

export async function deleteSubDay(id: string) { if (!live) noServer(); await rpc('sub_schedule_delete', { p_id: id }); }
