import { getUser } from '../api/connect';

export const fullName = (id: string | null) => {
  const p = id ? getUser(id) : undefined;
  return p ? `${p.firstName} ${p.lastName}`.trim() : 'Unknown';
};

export { gradeLabel } from '../comms/grades';

export const clock = (iso: string) => new Date(iso).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });

/** "14:45" → "2:45". */
const hm12 = (hm: string) => { const [h, m] = hm.split(':').map(Number); return `${((h + 11) % 12) + 1}:${String(m).padStart(2, '0')}`; };
/** Pickup hours like "2:45–3:30 PM". */
export const hoursLabel = (start: string, end: string) => `${hm12(start)}–${hm12(end)} ${Number(end.split(':')[0]) >= 12 ? 'PM' : 'AM'}`;

export const minutesSince = (iso: string, now = Date.now()) => Math.max(0, Math.floor((now - new Date(iso).getTime()) / 60000));
