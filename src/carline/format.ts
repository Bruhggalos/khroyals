import { getUser } from '../api/connect';

export const fullName = (id: string | null) => {
  const p = id ? getUser(id) : undefined;
  return p ? `${p.firstName} ${p.lastName}`.trim() : 'Unknown';
};

export const gradeLabel = (g?: number | null) => (g == null ? '' : g >= 1 ? `Grade ${g}` : 'K');

export const clock = (iso: string) => new Date(iso).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });

export const minutesSince = (iso: string, now = Date.now()) => Math.max(0, Math.floor((now - new Date(iso).getTime()) / 60000));
