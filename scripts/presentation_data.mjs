#!/usr/bin/env node
/**
 * Sample data for showing the app to the school: made-up teachers, a coach, a director,
 * front office staff and ten families (parents and students without logins), with classes,
 * assignments, forms (signed, paid and still to do), marketplace listings, activities and
 * volunteer opportunities. It centers on one real test account: their children are in the
 * classes and get the forms, they teach one class themselves (the Staff view), and a second
 * login can become a 6th grader in two of the classes (the student view). The school's real
 * activities stay as they are; the younger child (and two made-up classmates) join Royals
 * Cheer and the parent follows Basketball, if those exist.
 *
 *   SUPABASE_ACCESS_TOKEN=… node scripts/presentation_data.mjs --parent <email> [--student <email>]
 *     [--day 2026-10-27] [--remove] [--print]
 *
 * --day is the day it'll be shown (dates are around it; default: the next school day).
 * Nothing is sent: rows are written directly, so nobody gets a notification, and forms and
 * classes only reach the parent's children and the made-up families. Every row has a fixed
 * id, so running it again replaces it, and --remove takes all of it out (the student login
 * stays, without its classes). --print shows the SQL instead of running it.
 */
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

// ----------------------------------------------------------------------------
// Helpers

const uid = (key) => {
  const h = createHash('md5').update(`khroyals-presentation:${key}`).digest('hex');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20, 32)}`;
};
const quote = (s) => `'${String(s).replace(/'/g, "''")}'`;
/** A SQL literal: { ts } is a timestamp, { json } and other objects are jsonb, arrays are int[] or text[]. */
const lit = (v) => (v === null || v === undefined ? 'null'
  : typeof v === 'number' || typeof v === 'boolean' ? String(v)
  : Array.isArray(v) ? `array[${v.map(lit).join(', ')}]::${typeof v[0] === 'number' ? 'int' : 'text'}[]`
  : typeof v === 'object' && 'ts' in v ? `${quote(v.ts)}::timestamptz`
  : typeof v === 'object' ? `${quote(JSON.stringify('json' in v ? v.json : v))}::jsonb`
  : quote(v));
const row = (values) => `(${values.map(lit).join(', ')})`;
const insert = (table, cols, rows) => (rows.length ? `insert into public.${table} (${cols.join(', ')}) values\n  ${rows.map(row).join(',\n  ')};` : '');
const inList = (ids) => (ids.length ? `(${ids.map(lit).join(', ')})` : '(null)');

const addDays = (iso, n) => { const d = new Date(`${iso}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const weekend = (iso) => [0, 6].includes(new Date(`${iso}T12:00:00Z`).getUTCDay());
/**
 * The school day `n` school days from `day` (negative: before it).
 * @param {string} day @param {number} n @returns {string}
 */
export function schoolDay(day, n) {
  let d = day;
  for (let k = 0; k !== n;) { d = addDays(d, n < 0 ? -1 : 1); if (!weekend(d)) k += n < 0 ? -1 : 1; }
  return d;
}
const at = (date, time) => ({ ts: `${date} ${time} America/Chicago` });
const pretty = (iso) => new Date(`${iso}T12:00:00Z`).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', timeZone: 'UTC' });
const ordinal = (g) => (g === 0 ? 'Kindergarten' : g < 0 ? ['K2', 'K3', 'K4'][g + 3] : `${g}${g === 1 ? 'st' : g === 2 ? 'nd' : g === 3 ? 'rd' : 'th'}`);

// ----------------------------------------------------------------------------
// The made-up people

const STAFF = [
  { key: 'taylor', first: 'Jennifer', last: 'Taylor', role: 'teacher' },
  { key: 'brooks', first: 'Rachel', last: 'Brooks', role: 'teacher' },
  { key: 'davis', first: 'Marcus', last: 'Davis', role: 'teacher' },
  { key: 'price', first: 'Hannah', last: 'Price', role: 'teacher' },
  { key: 'garcia', first: 'Maria', last: 'Garcia', role: 'staff' },
];
/** Five families in the older child's grade (a) and five in the younger's (b). */
const FAMILIES = [
  { key: 'rivera', parent: 'Carmen', relation: 'mother', child: 'Mason', last: 'Rivera', set: 'a' },
  { key: 'patel', parent: 'Priya', relation: 'mother', child: 'Sophia', last: 'Patel', set: 'a' },
  { key: 'johnson', parent: 'Dana', relation: 'mother', child: 'Caleb', last: 'Johnson', set: 'a' },
  { key: 'kim', parent: 'Jin', relation: 'father', child: 'Grace', last: 'Kim', set: 'a' },
  { key: 'bennett', parent: 'Laura', relation: 'mother', child: 'Noah', last: 'Bennett', set: 'a' },
  { key: 'chen', parent: 'Wei', relation: 'father', child: 'Lily', last: 'Chen', set: 'b' },
  { key: 'moore', parent: 'Tara', relation: 'mother', child: 'Jackson', last: 'Moore', set: 'b' },
  { key: 'thompson', parent: 'Erin', relation: 'mother', child: 'Ava', last: 'Thompson', set: 'b' },
  { key: 'wright', parent: 'Mike', relation: 'father', child: 'Owen', last: 'Wright', set: 'b' },
  { key: 'adams', parent: 'Beth', relation: 'mother', child: 'Chloe', last: 'Adams', set: 'b' },
];
const staff = (k) => uid(`staff:${k}`);
const parent = (k) => uid(`parent:${k}`);
const kid = (k) => uid(`kid:${k}`);

// ----------------------------------------------------------------------------
// The data

/**
 * The SQL that removes everything this script adds, then (unless `remove`) adds it again.
 * `me` is the test parent's profile id, `children` their children ({ id, grade }, older
 * first), `student` an optional student login's id, `volleyball` an existing season id,
 * `cheer` the real Royals Cheer season's id and `basketball` the real Basketball activity's id.
 * @param {{ day: string, me: string, children: { id: string, grade: number }[], student?: string | null,
 *   volleyball?: string | null, cheer?: string | null, basketball?: string | null, remove?: boolean }} options
 * @returns {string}
 */
export function buildSql({ day, me, children, student = null, volleyball = null, cheer = null, basketball = null, remove = false }) {
  const [older, younger] = children;
  const sd = (n) => schoolDay(day, n);
  const ids = { forms: [], threads: [], assignments: [], rosters: [], events: [], sports: [], opps: [], listings: [], people: [] };
  const out = [];

  const people = [
    ...STAFF.map((s) => ({ id: staff(s.key), first: s.first, last: s.last, role: s.role, grade: null })),
    ...FAMILIES.map((f) => ({ id: parent(f.key), first: f.parent, last: f.last, role: 'parent', grade: null })),
    ...FAMILIES.filter((f) => (f.set === 'a' ? older : younger)).map((f) => ({
      id: kid(f.key), first: f.child, last: f.last, role: 'student', grade: (f.set === 'a' ? older : younger).grade,
    })),
  ];
  ids.people = people.map((p) => p.id);
  const fam = (set) => FAMILIES.filter((f) => f.set === set && (set === 'a' ? older : younger));

  // --- Classes (sections) and assignments
  const classes = [];
  if (older) {
    classes.push({ id: 'demo-homeroom-a', name: `${ordinal(older.grade)} Grade Homeroom`, lead: staff('taylor'), kids: [older.id, ...fam('a').map((f) => kid(f.key)), ...(student ? [student] : [])] });
    classes.push({ id: 'demo-bible-a', name: `Bible ${older.grade > 0 ? older.grade : ordinal(older.grade)}`, lead: me, kids: [older.id, ...fam('a').map((f) => kid(f.key)), ...(student ? [student] : [])] });
  }
  if (younger) classes.push({ id: 'demo-homeroom-b', name: `${ordinal(younger.grade)} Grade – Mrs. Brooks`, lead: staff('brooks'), kids: [younger.id, ...fam('b').map((f) => kid(f.key))] });
  ids.rosters = ['demo-homeroom-a', 'demo-bible-a', 'demo-homeroom-b'];

  const work = [
    ['demo-homeroom-a', 'Read Hatchet, chapters 5–6', 'Be ready to talk about the choices Brian makes.', 0],
    ['demo-homeroom-a', 'Fractions practice, page 84', 'Problems 1–20. Show your work.', 1],
    ['demo-homeroom-a', 'Science fair topic', "One paragraph: your question and how you'll test it.", 3],
    ['demo-homeroom-a', 'Vocabulary quiz: Unit 3', 'Study the 15 words on the Unit 3 list.', 5],
    ['demo-homeroom-a', 'Map of the Fertile Crescent', 'Color and label the rivers and cities.', -1],
    ['demo-bible-a', 'Memory verse: Psalm 23:1–3', 'Say it from memory in class.', 1],
    ['demo-bible-a', 'Reflection journal, week 9', 'One page on this week’s lesson.', 4],
    ['demo-homeroom-b', 'Spelling list 8', 'Practice each word three times.', 0],
    ['demo-homeroom-b', 'Read for 20 minutes and log it', 'Write the book title and the minutes.', 1],
    ['demo-homeroom-b', 'Bring a fall leaf for science', 'Any color, any size.', 2],
    ['demo-homeroom-b', 'Math facts: 2s and 5s', 'Practice sheet in the take-home folder.', 4],
  ].filter(([r]) => classes.some((c) => c.id === r));
  const assignments = work.map(([r, title, details, n], i) => ({ id: uid(`assignment:${i}:${title}`), r, lead: classes.find((c) => c.id === r).lead, title, details, due: sd(n) }));
  if (student) assignments.push({ id: uid('assignment:own'), r: null, lead: student, title: 'Study for the vocab quiz', details: 'Flash cards on the bus.', due: sd(4) });
  ids.assignments = assignments.map((a) => a.id);

  // --- Ask the Teacher (the student login)
  const threads = student && older ? [
    { id: uid('thread:taylor'), teacher: staff('taylor'), messages: [
      [student, 'Mrs. Taylor, is the science fair topic one paragraph or two?', at(sd(-1), '16:10')],
      [staff('taylor'), "One paragraph is plenty. Include your question and how you'll test it.", at(sd(-1), '17:02')],
    ], studentRead: at(sd(-1), '16:11'), teacherRead: at(sd(-1), '17:02') },
    { id: uid('thread:me'), teacher: me, messages: [
      [student, 'Mr. Nelson, can I turn in my reflection journal on Friday?', at(sd(-1), '19:45')],
    ], studentRead: at(sd(-1), '19:45'), teacherRead: null },
  ] : [];
  ids.threads = threads.map((t) => t.id);

  // --- Forms, with signatures and payments
  const bus = { id: 'q1', kind: 'yes_no', prompt: 'May your child ride the school bus?', required: true, options: [] };
  const sign = (f, by, answers = {}, agreed = true, when = at(sd(-1), '19:30')) => ({ f, by, answers, agreed, when });
  const forms = [];
  const fa = fam('a'), fb = fam('b');
  if (older) {
    forms.push({
      key: 'zoo', author: staff('taylor'), title: 'Zoo field trip permission', audience: 'section', section: 'demo-homeroom-a', fee: 1500, due: sd(3),
      details: `Our ${ordinal(older.grade)} grade visits the zoo on ${pretty(sd(6))}. We leave at 8:30 and are back by 2:30. Bring a sack lunch and a water bottle.`,
      questions: [bus, { id: 'q2', kind: 'text', prompt: 'Allergies or medicines we should know about?', required: false, options: [] },
        { id: 'q3', kind: 'choice', prompt: 'Can you chaperone?', required: false, options: ['Yes', 'No', 'Maybe'] }],
      to: classes[0].kids,
      signed: [sign('rivera', 'rivera', { q1: 'yes', q3: 'Yes' }), sign('patel', 'patel', { q1: 'yes', q2: 'Peanut allergy. EpiPen is in her backpack.', q3: 'No' }),
        sign('kim', 'kim', { q1: 'yes', q3: 'Maybe' }), sign('bennett', 'bennett', {}, false)],
      paid: [['rivera', 1500, 'cash', 'Front office', sd(-1), ''], ['patel', 1500, 'check', 'Teacher', sd(-1), 'Check #2214']],
      recorder: staff('taylor'),
    });
    forms.push({
      key: 'retreat', author: me, title: 'Bible class retreat permission', audience: 'section', section: 'demo-bible-a', fee: 2500, due: sd(5),
      details: `Our class retreat is on ${pretty(sd(8))} at Camp Lee, 9:00 to 3:00. Lunch is provided.`,
      questions: [bus, { id: 'q2', kind: 'text', prompt: 'T-shirt size', required: true, options: [] }],
      to: classes[1].kids,
      signed: [sign('rivera', 'rivera', { q1: 'yes', q2: 'Youth L' }), sign('patel', 'patel', { q1: 'yes', q2: 'Adult S' }),
        sign('johnson', 'johnson', { q1: 'no', q2: 'Youth M' }), sign('kim', 'kim', {}, false)],
      paid: [['rivera', 2500, 'online', 'Online', sd(-1), ''], ['patel', 2500, 'cash', 'Front office', sd(0), ''], ['johnson', 2500, 'check', 'Teacher', sd(-1), 'Check #1088']],
      recorder: staff('garcia'),
    });
  }
  if (younger) {
    forms.push({
      key: 'pumpkins', author: staff('brooks'), title: 'Pumpkin patch field trip', audience: 'section', section: 'demo-homeroom-b', fee: 800, due: sd(1),
      details: `${ordinal(younger.grade)} grade picks pumpkins on ${pretty(sd(4))}. Dress for mud and bring a water bottle.`,
      questions: [bus], to: classes.find((c) => c.id === 'demo-homeroom-b').kids,
      signed: fb.filter((f) => f.key !== 'wright').map((f) => sign(f.key, f.key, { q1: 'yes' })),
      paid: [['chen', 800, 'cash', 'Front office', sd(-2), ''], ['moore', 800, 'online', 'Online', sd(-1), ''], ['thompson', 800, 'cash', 'Teacher', sd(-1), '']],
      recorder: staff('brooks'),
    });
  }
  const grades = children.map((c) => c.grade);
  forms.push({
    key: 'handbook', author: staff('garcia'), title: 'Handbook acknowledgment 2026–2027', audience: 'grades', grades, fee: null, due: sd(7),
    details: "Please confirm you've read the 2026–2027 Student / Parent Handbook.", link: 'https://www.khroyals.com/s/KH-Student-Handbook-nj4p.pdf',
    questions: [], to: [...children.map((c) => c.id), ...[...fa, ...fb].map((f) => kid(f.key)), ...(student && older ? [student] : [])],
    signed: [...fa, ...fb].filter((f) => !['bennett', 'wright'].includes(f.key)).map((f) => sign(f.key, f.key)), paid: [], recorder: null,
  });

  // --- Activities
  const sport = (key, name, icon, category, description, coach) => ({ key, id: uid(`sport:${key}`), name, icon, category, description, coach });
  // (An earlier version made up a Basketball activity; the school's real one replaced it.)
  const sports = [
    sport('annie', 'Annie Jr.', '🎭', 'theater', 'This year’s musical. Rehearsals Mondays and Wednesdays after school.', staff('price')),
    sport('chess', 'Chess Club', '♟️', 'clubs', 'All levels welcome. We meet Wednesdays in Room 112.', staff('taylor')),
    sport('choir', 'Royal Voices', '🎵', 'music', 'Lower school choir. Rehearsals Thursdays after school.', staff('price')),
  ];
  ids.sports = [...sports.map((s) => s.id), uid('sport:basketball')];
  const season = (key, sp, name, starts, ends, min, max, details) => ({ id: uid(`season:${key}`), sport: uid(`sport:${sp}`), name, starts, ends, min, max, details });
  const seasons = [
    season('annie', 'annie', 'Fall show', '2026-09-14', '2026-12-12', 2, 8, 'Rehearsals Mon and Wed, 3:30–5:00. Shows Dec 11 and 12.'),
    season('chess', 'chess', 'Fall 2026', '2026-09-02', '2026-12-16', 3, 12, 'Wednesdays, 3:30–4:30.'),
    season('choir', 'choir', '2026–27', '2026-08-17', '2027-05-14', 2, 6, 'Thursdays, 3:30–4:15. Christmas Program on Dec 1.'),
  ];
  const ev = (key, s, kind, title, start, end, location, home = null) => ({ id: uid(`event:${key}`), season: s, kind, title, start, end, location, home });
  const SA = uid('season:annie'), SC = uid('season:chess'), SV = uid('season:choir');
  const events = [
    ev('an1', SA, 'rehearsal', 'Rehearsal: Act 1', at(sd(-1), '15:30'), at(sd(-1), '17:00'), 'Auditorium'),
    ev('an2', SA, 'rehearsal', 'Rehearsal: Act 1', at(sd(1), '15:30'), at(sd(1), '17:00'), 'Auditorium'),
    ev('an3', SA, 'rehearsal', 'Music rehearsal', at(sd(5), '15:30'), at(sd(5), '17:00'), 'Music room'),
    ev('an4', SA, 'performance', 'Annie Jr.: opening night', at('2026-12-11', '19:00'), null, 'Auditorium'),
    ev('ch1', SC, 'meeting', 'Club meeting', at(sd(1), '15:30'), at(sd(1), '16:30'), 'Room 112'),
    ev('ch2', SC, 'competition', 'Rocket City scholastic tournament', at(sd(9), '09:00'), null, 'Huntsville', false),
    ev('cv1', SV, 'rehearsal', 'Rehearsal', at(sd(2), '15:30'), at(sd(2), '16:15'), 'Music room'),
    ev('cv2', SV, 'performance', 'Christmas Program', at('2026-12-01', '18:00'), null, 'Auditorium'),
  ];
  if (volleyball) {
    events.push(ev('vb1', volleyball, 'game', 'vs. Grace Prep', at(sd(0), '17:00'), null, 'Royals Gym', true));
    events.push(ev('vb2', volleyball, 'game', 'at Valley Christian', at(sd(2), '16:30'), null, 'Valley Christian School', false));
  }
  ids.events = events.map((e) => e.id);
  const registrations = [
    ...(younger ? [[SA, younger.id, me, 'registered'], [SV, younger.id, me, 'registered'], ...fb.slice(0, 2).map((f) => [SA, kid(f.key), parent(f.key), 'registered']),
      ...fb.slice(2, 4).map((f) => [SV, kid(f.key), parent(f.key), 'registered'])] : []),
    // The school's real Royals Cheer (K–5): the younger child and two classmates.
    ...(younger && cheer ? [[cheer, younger.id, me, 'registered'], ...fb.slice(3, 5).map((f) => [cheer, kid(f.key), parent(f.key), 'registered'])] : []),
    ...fa.slice(1, 3).map((f) => [SA, kid(f.key), parent(f.key), 'registered']),
    ...fa.slice(3).map((f) => [SC, kid(f.key), parent(f.key), 'registered']),
  ];
  const regId = (s, st) => uid(`registration:${s}:${st}`);

  // --- Volunteer (led by the front office)
  const opps = [
    { key: 'festival', title: 'Fall Festival booth helpers', on: sd(3), start: '16:00', end: '19:00', location: 'Front lawn', spots: 10, kind: 'help',
      description: 'Help run a game or treat booth at the Fall Festival.\n\nWhat you’ll do:\nGreet families, hand out tickets and keep the line moving.\n\nWhat to bring:\nA smile and comfortable shoes.',
      signups: [['rivera'], ['johnson'], ['chen'], ['thompson'], ['me']] },
    { key: 'library', title: 'Library book shelving', on: sd(6), start: '09:00', end: '11:00', location: 'Library', spots: 3, kind: 'help',
      description: 'Help our librarian shelve returns and set up the new book display.', signups: [['kim']] },
    { key: 'tissues', title: 'Tissues for every homeroom', on: sd(5), location: 'Front office', kind: 'items', item: 'boxes of tissues', quantity: 24,
      description: 'Cold season is here. Drop off boxes at the front office.', signups: [['patel', 6], ['bennett', 4], ['moore', 2]] },
    { key: 'food', title: 'Canned food drive', on: sd(8), location: 'Front office', kind: 'items', item: 'canned goods', quantity: 200,
      description: 'For the Huntsville food bank. Soups, vegetables and beans are most needed.', signups: [['wright', 24], ['adams', 12], ['chen', 30]] },
  ];
  ids.opps = opps.map((o) => uid(`opp:${o.key}`));

  // --- Marketplace
  const listings = [
    ['polos', 'rivera', 'Navy uniform polos, youth M', 'Worn one school year. Selling all three.', 800, 3, 'like_new'],
    ['jumper', 'patel', 'Plaid jumper, girls size 8', 'Hemmed once; the hem can be let out.', 1500, 1, 'good'],
    ['pants', 'johnson', 'Khaki uniform pants, boys 10', 'Two pairs, no holes or stains.', 1000, 2, 'good'],
    ['vest', 'bennett', 'KHPS sweater vest, youth L', 'Chapel day ready.', 1800, 1, 'like_new'],
    ['hatchet', 'kim', 'Hatchet paperback', 'From the 6th grade reading list.', 400, 1, 'good'],
    ['calculator', 'wright', 'TI-84 Plus calculator', 'Works great, new batteries.', 4500, 1, 'good'],
    ['shoes', 'moore', 'Youth basketball shoes, size 5', 'Plenty of tread left.', 2000, 1, 'fair'],
    ['kneepads', 'thompson', 'Volleyball knee pads, youth S', 'Used for half a season.', 600, 1, 'like_new'],
    ['helmet', 'adams', 'Kids bike helmet, size S', 'Purple, adjustable.', 1000, 1, 'good'],
    ['books', 'chen', 'Box of early reader books', 'About 20 books for 1st and 2nd graders. Free to a good home.', 0, 1, 'good'],
    ['boots', 'me', 'Girls rain boots, size 13', 'Outgrown, still in good shape.', 500, 1, 'good'],
  ];
  ids.listings = listings.map(([k]) => uid(`listing:${k}`));
  const who = (k) => (k === 'me' ? me : parent(k));

  // ----------------------------------------------------------------------------
  // Remove (the order keeps foreign keys happy), then add.
  out.push('begin;');
  out.push(`delete from public.forms where id in ${inList(['zoo', 'retreat', 'pumpkins', 'handbook'].map((k) => uid(`form:${k}`)))};`);
  out.push(`delete from public.teacher_threads where id in ${inList([uid('thread:taylor'), uid('thread:me')])};`);
  out.push(`delete from public.assignments where id in ${inList(ids.assignments)} or (owner_id = ${lit(student)} and id = ${lit(uid('assignment:own'))});`);
  out.push(`delete from public.rosters where id in ${inList(ids.rosters)};`);
  out.push(`delete from public.sport_events where id in ${inList([...ids.events, uid('event:vb1'), uid('event:vb2')])};`);
  out.push(`delete from public.sports where id in ${inList(ids.sports)};`);
  // On the school's real activities: only the rows added here (sign-ups and the parent's follow).
  out.push(`delete from public.sport_registrations where id in ${inList(registrations.map(([s, st]) => regId(s, st)))};`);
  if (basketball) out.push(`delete from public.sport_follows where sport_id = ${lit(basketball)} and user_id = ${lit(me)};`);
  out.push(`delete from public.volunteer_opportunities where id in ${inList(ids.opps)};`);
  out.push(`delete from public.market_listings where id in ${inList(ids.listings)};`);
  out.push(`delete from public.profiles where id in ${inList(ids.people)};`);
  if (remove) { out.push('commit;'); return out.join('\n'); }

  out.push(insert('profiles', ['id', 'first_name', 'last_name', 'school_role', 'grade', 'managed'],
    people.map((p) => [p.id, p.first, p.last, p.role, p.grade, true])));
  out.push(`update public.profiles set volunteer_lead = true where id = ${lit(staff('garcia'))};`);
  out.push(insert('guardians', ['guardian_id', 'student_id', 'relation'],
    FAMILIES.filter((f) => (f.set === 'a' ? older : younger)).map((f) => [parent(f.key), kid(f.key), f.relation])));
  if (student) out.push(`update public.profiles set school_role = 'student', grade = ${lit(older?.grade ?? 6)}, managed = false where id = ${lit(student)};`);

  out.push(insert('rosters', ['id', 'kind', 'name', 'lead_id'], classes.map((c) => [c.id, 'section', c.name, c.lead])));
  out.push(insert('roster_members', ['roster_id', 'profile_id'], classes.flatMap((c) => [[c.id, c.lead], ...c.kids.map((k) => [c.id, k])])));
  out.push(insert('assignments', ['id', 'roster_id', 'owner_id', 'title', 'details', 'due_on', 'created_at'],
    assignments.map((a) => [a.id, a.r, a.lead, a.title, a.details, a.due, at(sd(-3), '08:00')])));
  if (student) out.push(insert('assignment_done', ['assignment_id', 'student_id'], assignments.filter((a) => a.title.startsWith('Map of')).map((a) => [a.id, student])));

  for (const t of threads) {
    out.push(insert('teacher_threads', ['id', 'student_id', 'teacher_id', 'last_message_at', 'student_read_at', 'teacher_read_at', 'created_at'],
      [[t.id, student, t.teacher, t.messages.at(-1)[2], t.studentRead, t.teacherRead, t.messages[0][2]]]));
    out.push(insert('teacher_messages', ['id', 'thread_id', 'author_id', 'body', 'created_at'],
      t.messages.map(([a, body, when], i) => [uid(`message:${t.id}:${i}`), t.id, a, body, when])));
  }

  for (const f of forms) {
    const id = uid(`form:${f.key}`);
    out.push(insert('forms', ['id', 'author_id', 'title', 'details', 'link', 'due_on', 'audience', 'section_id', 'grades', 'questions', 'fee_cents', 'created_at'],
      [[id, f.author, f.title, f.details, f.link ?? null, f.due, f.audience, f.section ?? null, f.grades ?? null, { json: f.questions }, f.fee, at(sd(-2), '07:30')]]));
    out.push(insert('form_recipients', ['form_id', 'student_id'], [...new Set(f.to)].map((s) => [id, s])));
    out.push(insert('form_responses', ['form_id', 'student_id', 'signed_by', 'agreed', 'answers', 'signature', 'signed_at'],
      f.signed.filter((x) => f.to.includes(kid(x.f))).map((x) => {
        const fm = FAMILIES.find((y) => y.key === x.by);
        return [id, kid(x.f), parent(x.by), x.agreed, { json: x.answers }, `${fm.parent} ${fm.last}`, x.when];
      })));
    out.push(insert('form_payments', ['form_id', 'student_id', 'amount_cents', 'method', 'delivered_to', 'received_on', 'note', 'recorded_by'],
      f.paid.filter(([k]) => f.to.includes(kid(k))).map(([k, cents, method, where, on, note]) => [id, kid(k), cents, method, where, on, note, f.recorder])));
  }

  out.push(insert('sports', ['id', 'name', 'icon', 'description', 'category'], sports.map((s) => [s.id, s.name, s.icon, s.description, s.category])));
  out.push(insert('sport_coaches', ['sport_id', 'user_id'], sports.map((s) => [s.id, s.coach])));
  out.push(insert('sport_seasons', ['id', 'sport_id', 'name', 'starts_on', 'ends_on', 'signup_opens', 'signup_closes', 'min_grade', 'max_grade', 'details', 'signup_announced_at'],
    seasons.map((s) => [s.id, s.sport, s.name, s.starts, s.ends, addDays(day, -20), addDays(day, 10), s.min, s.max, s.details, at(addDays(day, -20), '08:00')])));
  out.push(insert('sport_registrations', ['id', 'season_id', 'student_id', 'requested_by', 'status', 'decided_by', 'decided_at'],
    registrations.map(([s, st, by, status]) => [regId(s, st), s, st, by, status,
      status === 'registered' ? sports.find((x) => uid(`season:${x.key}`) === s)?.coach ?? null : null, status === 'registered' ? at(sd(-5), '12:00') : null])));
  if (basketball) out.push(`insert into public.sport_follows (sport_id, user_id) values (${lit(basketball)}, ${lit(me)}) on conflict do nothing;`);
  out.push(insert('sport_events', ['id', 'season_id', 'kind', 'title', 'starts_at', 'ends_at', 'location', 'home', 'created_by'],
    events.map((e) => [e.id, e.season, e.kind, e.title, e.start, e.end, e.location, e.home, null])));

  out.push(insert('volunteer_opportunities', ['id', 'lead_id', 'title', 'description', 'starts_on', 'start_time', 'end_time', 'location', 'spots', 'kind', 'item', 'quantity', 'created_at'],
    opps.map((o) => [uid(`opp:${o.key}`), staff('garcia'), o.title, o.description, o.on, o.start ?? null, o.end ?? null, o.location, o.spots ?? null, o.kind, o.item ?? null, o.quantity ?? null, at(sd(-4), '09:00')])));
  out.push(insert('volunteer_signups', ['opportunity_id', 'user_id', 'quantity'],
    opps.flatMap((o) => o.signups.map(([k, n]) => [uid(`opp:${o.key}`), who(k), n ?? null]))));

  out.push(insert('market_listings', ['id', 'seller_id', 'title', 'description', 'price_cents', 'quantity', 'condition', 'created_at'],
    listings.map(([k, s, title, desc, cents, qty, cond], i) => [uid(`listing:${k}`), who(s), title, desc, cents, qty, cond, at(addDays(day, -1 - (i % 5)), `${8 + i}:15`)])));
  out.push(insert('market_responses', ['id', 'listing_id', 'buyer_id', 'kind', 'offer_cents', 'counter_cents', 'message', 'status', 'agreed_cents'], [
    [uid('response:jumper'), uid('listing:jumper'), parent('thompson'), 'dibs', null, null, 'Would love this for my daughter!', 'agreed', 1500],
    [uid('response:calculator'), uid('listing:calculator'), parent('bennett'), 'offer', 3500, 4000, 'Would you take $35?', 'countered', null],
    [uid('response:boots1'), uid('listing:boots'), parent('moore'), 'offer', 300, null, 'Could you do $3?', 'offered', null],
    [uid('response:boots2'), uid('listing:boots'), parent('adams'), 'dibs', null, null, null, 'agreed', 500],
  ]));
  out.push('commit;');
  return out.filter(Boolean).join('\n');
}

// ----------------------------------------------------------------------------
// Running it against the live project

async function main() {
  const args = process.argv.slice(2);
  const flag = (n) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : undefined; };
  const parentEmail = flag('--parent');
  if (!parentEmail) { console.error('Usage: node scripts/presentation_data.mjs --parent <email> [--student <email>] [--day YYYY-MM-DD] [--remove] [--print]'); process.exit(1); }
  const token = process.env.SUPABASE_ACCESS_TOKEN;
  if (!token) { console.error('Set SUPABASE_ACCESS_TOKEN (a Supabase personal access token).'); process.exit(1); }
  const app = JSON.parse(readFileSync(new URL('../app.json', import.meta.url)));
  const ref = new URL(app.expo.extra.supabaseUrl).hostname.split('.')[0];
  const q = async (query) => {
    const r = await fetch(`https://api.supabase.com/v1/projects/${ref}/database/query`, {
      method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ query }) });
    const text = await r.text();
    if (!r.ok) throw new Error(`${r.status}: ${text}`);
    return JSON.parse(text);
  };

  const [today] = await q(`select app.school_today()::text as d`);
  let day = flag('--day') ?? today.d;
  while (weekend(day)) day = addDays(day, 1);
  const [me] = await q(`select id from auth.users where lower(email) = lower(${lit(parentEmail)})`);
  if (!me) throw new Error(`No account for ${parentEmail}.`);
  const children = await q(`select p.id, p.grade from public.guardians g join public.profiles p on p.id = g.student_id
    where g.guardian_id = ${lit(me.id)} and p.grade is not null order by p.grade desc limit 2`);
  if (!children.length) throw new Error(`${parentEmail} has no children with a grade.`);
  const studentEmail = flag('--student');
  const [student] = studentEmail ? await q(`select id from auth.users where lower(email) = lower(${lit(studentEmail)})`) : [];
  if (studentEmail && !student) console.warn(`No account for ${studentEmail} yet: sign in with it once in the app, then run this again. Going on without it.`);
  const [vb] = await q(`select se.id from public.sport_seasons se join public.sports s on s.id = se.sport_id
    where s.name = 'Volleyball' and se.ends_on >= ${lit(day)} order by se.starts_on limit 1`);
  const [cheer] = await q(`select se.id from public.sport_seasons se join public.sports s on s.id = se.sport_id
    where s.name = 'Royals Cheer' and se.ends_on >= ${lit(day)} order by se.starts_on limit 1`);
  const [basketball] = await q(`select id from public.sports where name = 'Basketball' and id <> ${lit(uid('sport:basketball'))}`);

  const sql = buildSql({ day, me: me.id, children, student: student?.id ?? null, volleyball: vb?.id ?? null,
    cheer: cheer?.id ?? null, basketball: basketball?.id ?? null, remove: args.includes('--remove') });
  if (args.includes('--print')) { console.log(sql); return; }
  await q(sql);
  if (args.includes('--remove')) { console.log('Removed the presentation data.'); return; }
  const [n] = await q(`select (select count(*) from public.profiles where id in ${inList([...STAFF.map((s) => staff(s.key)), ...FAMILIES.flatMap((f) => [parent(f.key), kid(f.key)])])}) as people,
    (select count(*) from public.assignments where id::text like '%') as assignments,
    (select count(*) from public.forms) as forms, (select count(*) from public.market_listings where status = 'open') as listings,
    (select count(*) from public.sports) as activities, (select count(*) from public.volunteer_opportunities where status = 'open') as volunteer`);
  console.log(`Loaded for ${pretty(day)}${student ? ', with the student login' : ''}: ${JSON.stringify(n)}`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main().catch((e) => { console.error(e.message); process.exit(1); });
