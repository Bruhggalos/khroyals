import { getUser, type Opportunity } from '../api/connect';

const pad = (n: number) => String(n).padStart(2, '0');
/** Today as YYYY-MM-DD on this device. */
export const todayIso = () => { const d = new Date(); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };

export const isPast = (o: Opportunity) => (o.endsOn ?? o.startsOn) < todayIso();

const day = (iso: string) => new Date(`${iso}T12:00`).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
const time = (hm: string) => { const [h, m] = hm.split(':').map(Number); return `${((h + 11) % 12) + 1}:${pad(m)} ${h >= 12 ? 'PM' : 'AM'}`; };

/** "Thu, Oct 22 · 3:00 PM–5:00 PM" */
export const whenLabel = (o: Opportunity) => {
  const days = o.endsOn && o.endsOn !== o.startsOn ? `${day(o.startsOn)} – ${day(o.endsOn)}` : day(o.startsOn);
  const hours = o.startTime ? ` · ${time(o.startTime)}${o.endTime ? `–${time(o.endTime)}` : ''}` : '';
  return days + hours;
};

/** "4 of 6" with a limit, otherwise "4". */
export const countLabel = (n: number, spots: number | null) => (spots ? `${n} of ${spots}` : String(n));

export const nameOf = (id: string | null) => {
  const p = id ? getUser(id) : undefined;
  return p ? `${p.firstName} ${p.lastName}`.trim() : 'Someone';
};
