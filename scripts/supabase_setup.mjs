#!/usr/bin/env node
/**
 * Set up (or refresh) the Supabase backend for Royals Connect.
 *
 *   SUPABASE_URL=… SUPABASE_SERVICE_ROLE_KEY=… \
 *   SUPABASE_ACCESS_TOKEN=… SUPABASE_PROJECT_REF=… \
 *   NODE_USE_ENV_PROXY=1 node scripts/supabase_setup.mjs [--demo] [--director=email]
 *
 * 1. Applies supabase/migrations/*.sql that haven't run yet (needs a personal
 *    access token for the Management API — the service key can't change schema).
 * 2. --demo only (DEMO_PASSWORD=…): creates the demo accounts through the Auth
 *    admin API and loads supabase/seed.sql (demo groups, posts, calendar).
 * 4. (token) Makes sign-in emails show a 6-digit code, deploys the send-push
 *    Edge Function, and optionally names the director (--director=email; that
 *    person must have signed in once).
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
const seed = process.argv.includes('--demo');
const PASSWORD = seed ? env('DEMO_PASSWORD') : null;

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

/** Deploy supabase/functions/send-push and point the database at it. */
async function deployPush() {
  const code = readFileSync(join(ROOT, 'supabase/functions/send-push/index.ts'), 'utf8');
  const form = new FormData();
  form.append('metadata', JSON.stringify({ name: 'send-push', entrypoint_path: 'index.ts', verify_jwt: false }));
  form.append('file', new Blob([code], { type: 'application/typescript' }), 'index.ts');
  const r = await fetch(`https://api.supabase.com/v1/projects/${REF}/functions/deploy?slug=send-push`, {
    method: 'POST', headers: { Authorization: `Bearer ${TOKEN}` }, body: form,
  });
  if (!r.ok) throw new Error(`Deploying send-push failed (${r.status}): ${await r.text()}`);
  await sql(`create extension if not exists pg_net with schema extensions;
             update app.settings set value = '${URL}/functions/v1' where key = 'functions_url';`);
  console.log('✓ send-push function deployed');
}

/** Sign-in emails show the 6-digit code the app asks for (instead of only a magic link). */
async function configureAuthEmail() {
  const r = await fetch(`https://api.supabase.com/v1/projects/${REF}/config/auth`, {
    method: 'PATCH',
    headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      mailer_otp_length: 6,
      mailer_subjects_magic_link: 'Your Royals Connect sign-in code',
      mailer_templates_magic_link_content:
        '<h2>Royals Connect</h2><p>Your sign-in code is:</p><p style="font-size:28px;font-weight:bold;letter-spacing:6px">{{ .Token }}</p><p>It expires in a few minutes. If you didn\'t ask for it, ignore this email.</p>',
      mailer_subjects_confirmation: 'Your Royals Connect sign-in code',
      mailer_templates_confirmation_content:
        '<h2>Welcome to Royals Connect</h2><p>Your sign-in code is:</p><p style="font-size:28px;font-weight:bold;letter-spacing:6px">{{ .Token }}</p>',
    }),
  });
  if (!r.ok) {
    // Free projects on Supabase's built-in email can't change templates; the
    // default email has a sign-in link, which the app also handles.
    console.log(`· sign-in email template unchanged (${r.status}): emails contain a sign-in link instead of a code`);
  } else console.log('✓ sign-in emails send a 6-digit code');
  // Where sign-in links may send people back to: the app (deep link) and the web portal.
  const r2 = await fetch(`https://api.supabase.com/v1/projects/${REF}/config/auth`, {
    method: 'PATCH',
    headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      site_url: 'khroyals://auth',
      mailer_otp_length: 6,
      mailer_otp_exp: 600,   // codes last 10 minutes
      // Sign-up without a confirmation email: Supabase's built-in email allows only
      // 2 emails/hour, and new accounts still need admin approval. Set to false once
      // the project uses its own email service (custom SMTP) to require confirmation.
      mailer_autoconfirm: process.env.REQUIRE_EMAIL_CONFIRMATION !== '1',
      uri_allow_list: ['khroyals://**', 'exp://**', 'http://localhost:8081/**', 'https://*.expo.app/**', 'https://bruhggalos.github.io/khroyals/**', ...(process.env.WEB_PORTAL_URL ? [`${process.env.WEB_PORTAL_URL}/**`] : [])].join(','),
    }),
  });
  if (!r2.ok) throw new Error(`Updating redirect URLs failed (${r2.status}): ${await r2.text()}`);
  console.log('✓ sign-in links open the app');
}

const migrated = await migrate();
if (seed) {
  await createDemoUsers();
  if (migrated) { await sql(readFileSync(join(ROOT, 'supabase/seed.sql'), 'utf8')); console.log('✓ seed loaded'); }
  else console.log('Then paste supabase/seed.sql into the SQL editor.');
}
if (TOKEN) {
  await configureAuthEmail();
  await deployPush();
  const director = process.argv.find((a) => a.startsWith('--director='))?.split('=')[1];
  if (director) {
    await sql(`select app.bootstrap_director('${director.replace(/'/g, "''")}')`);
    console.log(`✓ ${director} is the director`);
  }
}
console.log('Done.');
