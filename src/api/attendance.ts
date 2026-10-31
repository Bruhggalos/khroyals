/**
 * attendance: internal API implementation for class attendance. Screens import the connect facade.
 * Teachers take roll for the class sections they lead and see the office's late arrivals and early
 * check-outs on it; the office (checkin.manage) sees and takes every section's. The database checks who may.
 */
import type { AttendanceMark, ClassRoll, ClassRollSummary } from './types';
import { live, rpc } from './client';

const noServer = () => { throw new Error('Attendance needs the school server; this build is running on demo data.'); };
const onDay = (day?: string) => (day ? { p_day: day } : {});

/** The sections the signed-in teacher leads, with the day's roll at a glance (today when no day). */
export async function myClassAttendance(day?: string): Promise<ClassRollSummary[]> {
  if (!live) return [];
  return (await rpc('my_class_attendance', onDay(day))) as ClassRollSummary[];
}

/** The office: every section's roll at a glance. */
export async function attendanceOverview(day?: string): Promise<ClassRollSummary[]> {
  if (!live) return [];
  return (await rpc('attendance_overview', onDay(day))) as ClassRollSummary[];
}

/** One section's roll for a day: each student's mark, where they stand, and the office's check-ins. */
export async function classRoll(sectionId: string, day?: string): Promise<ClassRoll> {
  if (!live) noServer();
  return (await rpc('class_attendance_roll', { p_section: sectionId, ...onDay(day) })) as ClassRoll;
}

/** Mark students present, late or absent (null clears). */
export async function markAttendance(sectionId: string, day: string, studentIds: string[], status: AttendanceMark | null) {
  if (!live) noServer();
  await rpc('class_attendance_mark', { p_section: sectionId, p_day: day, p_students: studentIds, p_status: status });
}
