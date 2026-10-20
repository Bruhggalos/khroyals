/** Small pieces for activity events: the countdown on event cards and the Directions link. */

/** "Starts in 03 Days 21 Hours 33 Minutes"; `started` once it has begun. */
export function countdown(startsAt: string, now = Date.now()) {
  const ms = new Date(startsAt).getTime() - now;
  if (ms <= 0) return { started: true, days: 0, hours: 0, minutes: 0 };
  const minutes = Math.ceil(ms / 60_000);  // 59.5 minutes away still reads "1 hour", not "0"
  return { started: false, days: Math.floor(minutes / 1440), hours: Math.floor((minutes % 1440) / 60), minutes: minutes % 60 };
}

export const two = (n: number) => String(n).padStart(2, '0');

/** A Maps link to the event: the address when there is one, else the venue name. Null when neither is set. */
export function directionsUrl(venue: string | null | undefined, address: string | null | undefined, os: string) {
  const to = [venue, address].filter((x) => x && x.trim()).join(', ').trim();
  if (!to) return null;
  const q = encodeURIComponent(address?.trim() ? `${venue?.trim() ? `${venue.trim()}, ` : ''}${address.trim()}` : to);
  if (os === 'ios') return `https://maps.apple.com/?daddr=${q}`;
  if (os === 'android') return `geo:0,0?q=${q}`;
  return `https://www.google.com/maps/dir/?api=1&destination=${q}`;
}
