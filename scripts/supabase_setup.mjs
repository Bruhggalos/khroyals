#!/usr/bin/env node
/**
 * Set up (or refresh) the Supabase backend for Royals Connect.
 *
 *   SUPABASE_URL=… SUPABASE_SERVICE_ROLE_KEY=… \
 *   SUPABASE_ACCESS_TOKEN=… SUPABASE_PROJECT_REF=… \
 *   DEMO_PASSWORD=… node scripts/supabase_setup.mjs [--no-seed]
 *
 * 1. Applies supabase/migrations/*.sql that haven't run yet (needs a personal
 *    access token for the Management API — the service key can't change schema).
 * 2. Creates the demo accounts through the Auth admin API (service key).
 * 3. Loads supabase/seed.sql (demo groups, posts and the school calendar).
 *
 * Without SUPABASE_ACCESS_TOKEN, steps 1 and 3 print the SQL files to paste
 * into the dashboard's SQL editor instead.
 */
import { readFileSync, readdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const env = (k, required = true) => {
  const v = process.env[k];
  if (!v && required) { console.error(`Missing ${k}`); process.exit(1); }
  return v;
};
const URL = env('SUPABASE_URL').replace(/\/$/, '');
const SERVICE = env('SUPABASE_SERVICE_ROLE_KEY');
const TOKEN = env('SUPABASE_ACCESS_TOKEN', false);
const REF = env('SUPABASE_PROJECT_REF', false) ?? new globalThis.URL(URL).hostname.split('.')[0];
const PASSWORD = env('DEMO_PASSWORD');
const seed = !process.argv.includes('--no-seed');

/** Same mapping as app.seed_id(): md5('khroyals:' || id)::uuid */
const seedId = (legacy) => {
  const h = createHash('md5').update(`khroyals:${legacy}`).digest('hex');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
};

async function sql(query) {
  const r = await fetch(`https://api.supabase.com/v1/projects/${REF}/database/query`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query }),
  });
  const body = await r.text();
  if (!r.ok) throw new Error(`SQL failed (${r.status}): ${body}`);
  return body ? JSON.parse(body) : [];
}

async function migrate() {
  const files = readdirSync(join(ROOT, 'supabase/migrations')).filter((f) => f.endsWith('.sql')).sort();
  if (!TOKEN) {
    console.log('\nNo SUPABASE_ACCESS_TOKEN: paste these into the SQL editor, in order:');
    files.forEach((f) => console.log(`  supabase/migrations/${f}`));
    return false;
  }
  await sql('create schema if not exists app; create table if not exists app.applied_migrations (name text primary key, at timestamptz default now());');
  const done = new Set((await sql('select name from app.applied_migrations')).map((r) => r.name));
  for (const f of files) {
    if (done.has(f)) { console.log(`✓ ${f} (already applied)`); continue; }
    const body = readFileSync(join(ROOT, 'supabase/migrations', f), 'utf8');
    await sql(`begin;\n${body}\ninsert into app.applied_migrations (name) values ('${f}');\ncommit;`);
    console.log(`✓ applied ${f}`);
  }
  return true;
}

async function createDemoUsers() {
  const { users } = JSON.parse(readFileSync(join(ROOT, 'mock-db/comms/users.json'), 'utf8'));
  for (const u of users) {
    const r = await fetch(`${URL}/auth/v1/admin/users`, {
      method: 'POST',
      headers: { apikey: SERVICE, Authorization: `Bearer ${SERVICE}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id: seedId(u.id), email: `${u.id}@demo.khroyals.test`, password: PASSWORD, email_confirm: true,
        user_metadata: { first_name: u.firstName, last_name: u.lastName, demo: true },
      }),
    });
    if (r.ok) console.log(`✓ account ${u.id}@demo.khroyals.test`);
    else if (r.status === 422 || r.status === 409) console.log(`· account ${u.id} exists`);
    else throw new Error(`Creating ${u.id} failed (${r.status}): ${await r.text()}`);
  }
}

const migrated = await migrate();
if (seed) {
  await createDemoUsers();
  if (migrated) { await sql(readFileSync(join(ROOT, 'supabase/seed.sql'), 'utf8')); console.log('✓ seed loaded'); }
  else console.log('Then paste supabase/seed.sql into the SQL editor.');
}
console.log('Done.');
