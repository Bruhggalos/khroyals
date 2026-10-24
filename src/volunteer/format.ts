import { getUser, type Opportunity } from '../api/connect';
import { isPastDay, schoolToday } from '../calendar/past';

const pad = (n: number) => String(n).padStart(2, '0');
export const todayIso = schoolToday;

export const isPast = (o: Opportunity) => isPastDay(o.endsOn ?? o.startsOn);

const day = (iso: string) => new Date(`${iso}T12:00`).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
const time = (hm: string) => { const [h, m] = hm.split(':').map(Number); return `${((h + 11) % 12) + 1}:${pad(m)} ${h >= 12 ? 'PM' : 'AM'}`; };

/** "Thu, Oct 22 · 3:00 PM–5:00 PM", or "Bring by Thu, Oct 22" for an item request. */
export const whenLabel = (o: Opportunity) => {
  if (o.kind === 'items') return `Bring by ${day(o.startsOn)}`;
  const days = o.endsOn && o.endsOn !== o.startsOn ? `${day(o.startsOn)} – ${day(o.endsOn)}` : day(o.startsOn);
  const hours = o.startTime ? ` · ${time(o.startTime)}${o.endTime ? `–${time(o.endTime)}` : ''}` : '';
  return days + hours;
};

/** "Thursday, October 22", or "Mon, Nov 16 – Thu, Nov 19" for more than one day. */
export const longDayLabel = (o: Opportunity) => o.endsOn && o.endsOn !== o.startsOn
  ? `${day(o.startsOn)} – ${day(o.endsOn)}`
  : new Date(`${o.startsOn}T12:00`).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });

/** "2:45 PM – 3:30 PM" ("… each day" when it runs several days); null without a start time. */
export const timeLabel = (o: Opportunity) => {
  if (!o.startTime) return null;
  const hours = `${time(o.startTime)}${o.endTime ? ` – ${time(o.endTime)}` : ''}`;
  return o.endsOn && o.endsOn !== o.startsOn ? `${hours} each day` : hours;
};

/** "4 of 6" with a limit, otherwise "4". */
export const countLabel = (n: number, spots: number | null) => (spots ? `${n} of ${spots}` : String(n));

export const nameOf = (id: string | null) => {
  const p = id ? getUser(id) : undefined;
  return p ? `${p.firstName} ${p.lastName}`.trim() : 'Someone';
};
