import { getUser, type SchoolQuestion } from '../api/connect';

export const GREEN = '#16A34A';
const HOUR = 3_600_000;

/** How long a question has been waiting: "just now", "5 h", "3 d". */
export function age(since: string | null, now = Date.now()): string {
  if (!since) return '';
  const hours = Math.max(0, (now - new Date(since).getTime()) / HOUR);
  if (hours < 1) return 'just now';
  if (hours < 24) return `${Math.floor(hours)} h`;
  return `${Math.floor(hours / 24)} d`;
}

/** Waiting more than a school day is a nudge; more than three is overdue. */
export function ageColor(since: string | null, now = Date.now()): string {
  if (!since) return '#5B6577';
  const hours = (now - new Date(since).getTime()) / HOUR;
  return hours >= 72 ? '#B42318' : hours >= 24 ? '#B45309' : '#5B6577';
}

export const waiting = (q: SchoolQuestion) => q.status === 'new' || q.status === 'assigned';

/** What the person who asked sees. */
export function askerStatus(q: SchoolQuestion): { label: string; color: string } {
  switch (q.status) {
    case 'answered': return { label: 'Answered', color: GREEN };
    case 'closed': return { label: 'Closed', color: '#5B6577' };
    default: return { label: 'Waiting for the school', color: '#B45309' };
  }
}

export const nameOf = (id: string | null) => {
  const p = id ? getUser(id) : undefined;
  return p ? `${p.firstName} ${p.lastName}`.trim() : 'Someone';
};

export const when = (iso: string) => {
  const d = new Date(iso);
  return d.toDateString() === new Date().toDateString()
    ? d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
    : d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
};
