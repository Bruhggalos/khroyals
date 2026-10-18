import { getUser } from '../api/connect';

export { gradeLabel } from '../comms/grades';
export { clock, hoursLabel, minutesSince } from './time';

export const fullName = (id: string | null) => {
  const p = id ? getUser(id) : undefined;
  return p ? `${p.firstName} ${p.lastName}`.trim() : 'Unknown';
};
