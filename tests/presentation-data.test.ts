/**
 * scripts/presentation_data.mjs: the sample data loads into the real schema (every
 * migration, in PGlite), shows up for the test parent, their children, the class they
 * teach and the student login, loads again over itself, and comes out completely.
 */
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { PGlite } from '@electric-sql/pglite';
import { buildSql, schoolDay } from '../scripts/presentation_data.mjs';

const ROOT = join(__dirname, '..');
const db = new PGlite();
const ME = '11111111-1111-4111-8111-111111111111';
const STUDENT = '22222222-2222-4222-8222-222222222222';
const OLDER = '33333333-3333-4333-8333-333333333333';
const YOUNGER = '44444444-4444-4444-8444-444444444444';
const VB_SEASON = '55555555-5555-4555-8555-555555555555';
const DAY = '2026-10-27';

async function as(who: string) {
  await db.exec(`reset role; select set_config('request.jwt.claim.sub', '${who}', false),
    set_config('request.jwt.claims', json_build_object('sub', '${who}', 'aal', 'aal1')::text, false); set role authenticated;`);
}
const one = async (q: string) => (await db.query<any>(q)).rows[0];
const count = async (q: string) => Number((await one(`select count(*) as n from (${q}) x`)).n);
const load = (remove = false) => db.exec(buildSql({
  day: DAY, me: ME, children: [{ id: OLDER, grade: 6 }, { id: YOUNGER, grade: 2 }], student: STUDENT, volleyball: VB_SEASON, remove,
}));

before(async () => {
  await db.exec(readFileSync(join(ROOT, 'supabase/tests/supabase_stubs.sql'), 'utf8'));
  for (const f of readdirSync(join(ROOT, 'supabase/migrations')).sort()) await db.exec(readFileSync(join(ROOT, 'supabase/migrations', f), 'utf8'));
  // The test parent (a director who also has two children) and the student login, as on live.
  await db.query(`insert into auth.users (id, email, raw_user_meta_data) values ($1, 'me@example.test', '{"first_name":"Ben","last_name":"Nelson"}'),
    ($2, 'me+student@example.test', '{"first_name":"Sam","last_name":"Student"}')`, [ME, STUDENT]);
  await db.exec(`update profiles set school_role = 'admin' where id = '${ME}';
    insert into profiles (id, first_name, last_name, school_role, grade, managed) values
      ('${OLDER}', 'Alaythea', 'Nelson', 'student', 6, true), ('${YOUNGER}', 'Lexi Kate', 'Nelson', 'student', 2, true);
    insert into guardians (guardian_id, student_id, relation) values ('${ME}', '${OLDER}', 'father'), ('${ME}', '${YOUNGER}', 'father');
    insert into sports (id, name, icon, description, category) values ('66666666-6666-4666-8666-666666666666', 'Volleyball', '🏐', '', 'sports');
    insert into sport_seasons (id, sport_id, name, starts_on, ends_on) values ('${VB_SEASON}', '66666666-6666-4666-8666-666666666666', 'Fall 2026', '2026-08-03', '2026-10-31');`);
});

test('school days skip the weekend', () => {
  assert.equal(schoolDay('2026-10-30', 1), '2026-11-02');
  assert.equal(schoolDay('2026-10-26', -1), '2026-10-23');
  assert.equal(schoolDay(DAY, 0), DAY);
});

test('loads, shows up for the parent, their class and the student, loads again, and comes out', async () => {
  await load();
  await load(); // again, over itself
  await db.exec('reset role');
  const people = await count(`select 1 from profiles where managed and id not in ('${OLDER}', '${YOUNGER}')`);
  assert.equal(people, 25, '5 staff, 10 parents and 10 students');
  assert.equal(await count(`select 1 from forms`), 4);
  assert.equal(await count(`select 1 from market_listings`), 11);
  assert.equal(await count(`select 1 from sports`), 5, 'Volleyball and four new ones');
  assert.equal(await count(`select 1 from volunteer_opportunities`), 4);
  assert.equal((await one(`select school_role, grade from profiles where id = '${STUDENT}'`)).school_role, 'student');

  // The parent: forms for both children (none signed yet), and the children's class assignments.
  await as(ME);
  const mine = (await one(`select my_forms() as f`)).f;
  assert.deepEqual(mine.map((f: any) => f.title).sort(),
    ['Bible class retreat permission', 'Handbook acknowledgment 2026–2027', 'Pumpkin patch field trip', 'Zoo field trip permission']);
  assert.ok(mine.every((f: any) => f.children.every((c: any) => c.response === null)), 'left for the parent to sign');
  assert.ok((await count(`select * from child_assignments('${DAY}', '${schoolDay(DAY, 9)}')`)) >= 8);
  // …the class they teach: signatures and payments from the made-up families.
  const retreat = mine.find((f: any) => f.title.startsWith('Bible'));
  const status = (await one(`select form_status('${retreat.id}') as s`)).s;
  assert.deepEqual([status.students.filter((s: any) => s.response).length, status.students.filter((s: any) => s.payment).length], [4, 3]);
  assert.equal((await one(`select sent_forms() as f`)).f.length, 1, 'their own form (all of them only with Send forms)');
  assert.ok((await count(`select * from teacher_conversations()`)) >= 1, 'a question from the student');

  // The student: two teachers, assignments (one of their own), a reply waiting.
  await as(STUDENT);
  assert.equal(await count(`select * from my_teachers()`), 2);
  assert.ok((await count(`select 1 from assignments`)) >= 8);
  assert.equal(await count(`select 1 from assignments where roster_id is null`), 1);

  // Out it comes; the parent, their children, the student login and Volleyball stay.
  await db.exec('reset role');
  await load(true);
  assert.equal(await count(`select 1 from profiles where managed and id not in ('${OLDER}', '${YOUNGER}')`), 0);
  for (const t of ['forms', 'market_listings', 'volunteer_opportunities', 'assignments', 'rosters', 'teacher_threads', 'sport_events', 'sport_registrations']) {
    assert.equal(await count(`select 1 from ${t}`), 0, t);
  }
  assert.equal(await count(`select 1 from sports`), 1);
  assert.equal(await count(`select 1 from profiles where id in ('${ME}', '${STUDENT}', '${OLDER}', '${YOUNGER}')`), 4);
});
