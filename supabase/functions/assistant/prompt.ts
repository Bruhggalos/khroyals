/**
 * What the Kingdom Heights Assistant is told. Plain TypeScript with no Deno or
 * Node APIs, so the Edge Function and the tests (tests/assistant.test.ts) share it.
 *
 * The system prompt has two parts. The first (instructions + handbook) never
 * changes between requests, so it's cached. The second (today's date, who's
 * asking, the staff directory and upcoming events) changes daily and comes after
 * the cache breakpoint.
 */

export type Contact = { name: string; title: string; helpsWith: string; email: string | null; phone: string | null };
export type EventItem = {
  title: string; startsOn: string; endsOn: string | null; startTime: string | null; endTime: string | null;
  location: string | null; category: string; group: string | null;
};
export type Asker = { firstName: string; role: string; grades: number[] };
export type Turn = { role: 'user' | 'assistant'; content: string };

export const FRONT_OFFICE = 'the front office: info@khroyals.com, (256) 210-1343';

const INSTRUCTIONS = `You are the Kingdom Heights Assistant in the KH Royals app, for Kingdom Heights Preparatory School, a K2-12 Christian school in Huntsville, Alabama. You help parents, students and staff with three things:
1. What school policy says, from the Student / Parent Handbook below.
2. What's coming up, from the upcoming events you're given.
3. Who to contact about something, from the staff directory you're given, with how to reach them.

How to answer:
- Use only the handbook, the upcoming events and the staff directory provided here. If they don't answer the question, say you don't know rather than guessing, and point the person to the best contact.
- Never make up policies, dates, times, names, email addresses or phone numbers. Only give contact details that appear in the directory or the handbook. When the best person has no email listed, give ${FRONT_OFFICE}.
- When an answer comes from the handbook, mention the page, like "(Handbook, p. 7)".
- When someone should talk to a person, name the best-suited staff member, say in a few words why, and give how to reach them.
- Keep answers short and friendly: a few sentences, or a short list using "- " bullets. Write plain text: no headings, bold, tables or markdown links.
- Reply in the language the person writes in.
- Use today's date, given below, for words like "tomorrow" or "next week", and use what you're told about the person (for example their children's grades) to give the details that apply to them.

Limits:
- In an emergency, tell them to call 911 first, then the school.
- You can't see grades, attendance records, accounts or anything about a particular student. Point those questions to the right person, or to the FACTS Family Portal for grades.
- Don't ask for private details about students. For medical questions, point to the school nurse; for custody or legal matters, to the administration.
- For questions that aren't about Kingdom Heights, say briefly that you can only help with school questions.
- If a policy might have changed since the handbook was written, suggest confirming with the front office.`;

/** Instructions plus the handbook: identical on every request, so it caches. */
export function stableSystem(handbook: string): string {
  return `${INSTRUCTIONS}\n\n<handbook>\n${handbook}\n</handbook>`;
}

const DAY = 86_400_000;
const isoDay = (d: Date) => d.toISOString().slice(0, 10);
const fromIso = (iso: string) => new Date(`${iso}T12:00:00Z`);

/** Today as YYYY-MM-DD in Central time (the school's time zone). */
export function schoolToday(now = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Chicago', year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
}

const longDate = (iso: string) => fromIso(iso).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
const shortDate = (iso: string) => fromIso(iso).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC' });
const clock = (hm: string) => {
  const [h, m] = hm.split(':').map(Number);
  return `${((h + 11) % 12) + 1}:${String(m).padStart(2, '0')} ${h >= 12 ? 'PM' : 'AM'}`;
};
const grade = (g: number) => (g >= 1 ? `grade ${g}` : 'pre-K or kindergarten');

function describe(asker: Asker): string {
  const grades = [...new Set(asker.grades)].sort((a, b) => a - b).map(grade);
  const name = asker.firstName ? `${asker.firstName}, ` : '';
  switch (asker.role) {
    case 'parent':
      return `You're talking with ${name}a parent${grades.length ? ` of ${grades.length === 1 ? 'a student' : 'students'} in ${grades.join(' and ')}` : ''}.`;
    case 'student':
      return `You're talking with ${name}a student${grades.length ? ` in ${grades[0]}` : ''}. Keep your answers suitable for a student.`;
    default:
      return `You're talking with ${name}a member of the school staff.`;
  }
}

/** Events that haven't ended and start within the next `days` days, soonest first. */
export function upcoming(events: EventItem[], today: string, days = 60): EventItem[] {
  const until = isoDay(new Date(fromIso(today).getTime() + days * DAY));
  return events
    .filter((e) => (e.endsOn ?? e.startsOn) >= today && e.startsOn <= until)
    .sort((a, b) => a.startsOn.localeCompare(b.startsOn) || (a.startTime ?? '').localeCompare(b.startTime ?? ''));
}

function eventLine(e: EventItem): string {
  const days = e.endsOn && e.endsOn !== e.startsOn ? `${shortDate(e.startsOn)} - ${shortDate(e.endsOn)}` : shortDate(e.startsOn);
  const time = e.startTime ? `, ${clock(e.startTime)}${e.endTime ? `-${clock(e.endTime)}` : ''}` : '';
  const where = e.location ? `, ${e.location}` : '';
  const kind = e.group ? `${e.group} group` : e.category;
  return `- ${days}${time}: ${e.title}${where} (${kind})`;
}

function contactLine(c: Contact): string {
  const reach = [c.email, c.phone].filter(Boolean).join(', ') || `through ${FRONT_OFFICE}`;
  return `- ${c.name}, ${c.title}. ${c.helpsWith ? `Ask about: ${c.helpsWith}. ` : ''}Contact: ${reach}`;
}

/** The part that changes daily: date, who's asking, directory, upcoming events. */
export function dailyContext(o: { today: string; asker: Asker; contacts: Contact[]; events: EventItem[] }): string {
  const soon = upcoming(o.events, o.today);
  return [
    `Today is ${longDate(o.today)} (Central time).`,
    describe(o.asker),
    '',
    '<staff_directory>',
    ...o.contacts.map(contactLine),
    '</staff_directory>',
    '',
    '<upcoming_events> (next 60 days)',
    ...(soon.length ? soon.map(eventLine) : ['- No events are on the calendar for the next 60 days.']),
    '</upcoming_events>',
  ].join('\n');
}

const MAX_TURNS = 12;
const MAX_CHARS = 2000;

/** The conversation the app sent, checked and trimmed; null if there's no question to answer. */
export function trimHistory(input: unknown): Turn[] | null {
  if (!Array.isArray(input)) return null;
  const turns = input
    .filter((t): t is Turn => !!t && (t.role === 'user' || t.role === 'assistant') && typeof t.content === 'string' && t.content.trim() !== '')
    .map((t) => ({ role: t.role, content: t.content.trim().slice(0, MAX_CHARS) }))
    .slice(-MAX_TURNS);
  while (turns.length && turns[0].role !== 'user') turns.shift();
  if (!turns.length || turns[turns.length - 1].role !== 'user') return null;
  return turns;
}
