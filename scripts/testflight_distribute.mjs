#!/usr/bin/env node
/**
 * Hand an uploaded iPhone build to the TestFlight testers.
 *
 *   ASC_KEY_ID=… ASC_ISSUER_ID=… ASC_KEY_PATH=…/AuthKey_….p8 \
 *   node scripts/testflight_distribute.mjs <build number> [--note "What to test"] [--groups "Core 4,Teachers"]
 *
 * Uses an App Store Connect API key (App Store Connect → Users and Access →
 * Integrations; App Manager access is enough). The key file stays outside the repo.
 * scripts/testflight.sh runs this after each upload when those three variables are set.
 *
 * 1. Waits for Apple to finish processing the build (up to an hour).
 * 2. Sets its "What to Test" note, if one is given (without emoji, which Apple turns down).
 * 3. Adds it to the external tester groups (all of them, or the ones named). Internal
 *    groups that get every build need nothing.
 * 4. Submits it for Beta App Review if Apple wants that; external testers get it once
 *    it's approved, usually right away for a new build of a version already approved.
 */
import { Buffer } from 'node:buffer';
import { readFileSync } from 'node:fs';
import { createPrivateKey, sign } from 'node:crypto';

const BUNDLE_ID = 'com.khroyals.app';
const args = process.argv.slice(2);
const flag = (name) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : undefined; };
const build = args.find((a, i) => !a.startsWith('--') && !['--note', '--groups'].includes(args[i - 1]));
/** Apple turns "What to Test" notes with emoji away (409, "invalid characters"), so they're left out. */
const plain = (s) => s
  .replace(/[\p{Extended_Pictographic}\p{Regional_Indicator}\u{FE0F}\u{200D}\u{20E3}\u{1F3FB}-\u{1F3FF}]/gu, '')
  .replace(/\(\s*\)/g, '').replace(/[ \t]+([.,;:!?)])/g, '$1').replace(/[ \t]{2,}/g, ' ');
const given = flag('--note') ?? process.env.WHAT_TO_TEST;
const note = given && plain(given);
if (given && note !== given) console.warn('Left the emoji out of the What to Test note (Apple doesn\'t accept them).');
const only = (flag('--groups') ?? process.env.TESTFLIGHT_GROUPS)?.split(',').map((g) => g.trim()).filter(Boolean);

const need = (k) => process.env[k] || (console.error(`Set ${k} (App Store Connect API key; see the top of this file).`), process.exit(1));
const [keyId, issuer, keyPath] = [need('ASC_KEY_ID'), need('ASC_ISSUER_ID'), need('ASC_KEY_PATH')];
if (!build) { console.error('Usage: node scripts/testflight_distribute.mjs <build number> [--note "…"] [--groups "…"]'); process.exit(1); }
const key = createPrivateKey(readFileSync(keyPath));

const b64 = (x) => Buffer.from(JSON.stringify(x)).toString('base64url');
function token() {
  const now = Math.floor(Date.now() / 1000);
  const unsigned = `${b64({ alg: 'ES256', kid: keyId, typ: 'JWT' })}.${b64({ iss: issuer, iat: now, exp: now + 900, aud: 'appstoreconnect-v1' })}`;
  return `${unsigned}.${sign('sha256', Buffer.from(unsigned), { key, dsaEncoding: 'ieee-p1363' }).toString('base64url')}`;
}
async function asc(method, path, body) {
  const r = await fetch(`https://api.appstoreconnect.apple.com${path}`, {
    method, headers: { Authorization: `Bearer ${token()}`, 'Content-Type': 'application/json' }, body: body && JSON.stringify(body) });
  const text = await r.text();
  const json = text ? JSON.parse(text) : null;
  if (!r.ok) {
    const err = new Error(`${method} ${path} failed (${r.status}): ${json?.errors?.map((e) => e.detail ?? e.title).join('; ') ?? text}`);
    err.status = r.status;
    throw err;
  }
  return json;
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const app = (await asc('GET', `/v1/apps?filter[bundleId]=${BUNDLE_ID}`)).data[0];
if (!app) { console.error(`No app ${BUNDLE_ID} in App Store Connect for this key.`); process.exit(1); }

// 1. Wait for processing.
let b;
for (let i = 0; ; i++) {
  b = (await asc('GET', `/v1/builds?filter[app]=${app.id}&filter[version]=${encodeURIComponent(build)}&limit=1`)).data[0];
  const state = b?.attributes.processingState;
  if (state === 'VALID') break;
  if (state === 'FAILED' || state === 'INVALID') { console.error(`Build ${build} is ${state} in App Store Connect; see the email from Apple.`); process.exit(1); }
  if (i >= 120) { console.error(`Build ${build} still isn't ready after an hour; run this again later.`); process.exit(1); }
  if (i === 0) console.log(`Waiting for Apple to process build ${build}…`);
  await sleep(30_000);
}
console.log(`Build ${build} is processed.`);

// 2. What to Test.
if (note) {
  const locs = (await asc('GET', `/v1/builds/${b.id}/betaBuildLocalizations`)).data;
  const en = locs.find((l) => l.attributes.locale === 'en-US');
  if (en) await asc('PATCH', `/v1/betaBuildLocalizations/${en.id}`, { data: { type: 'betaBuildLocalizations', id: en.id, attributes: { whatsNew: note } } });
  else await asc('POST', '/v1/betaBuildLocalizations', { data: { type: 'betaBuildLocalizations', attributes: { locale: 'en-US', whatsNew: note },
    relationships: { build: { data: { type: 'builds', id: b.id } } } } });
  console.log('What to Test note set.');
}

// 3. External groups.
const groups = (await asc('GET', `/v1/apps/${app.id}/betaGroups?limit=200`)).data
  .filter((g) => !g.attributes.isInternalGroup && (!only || only.includes(g.attributes.name)));
if (only) for (const name of only) if (!groups.some((g) => g.attributes.name === name)) console.warn(`No external group named "${name}".`);
for (const g of groups) {
  await asc('POST', `/v1/betaGroups/${g.id}/relationships/builds`, { data: [{ type: 'builds', id: b.id }] });
  console.log(`Added to "${g.attributes.name}".`);
}

// 4. Beta App Review, when Apple asks for it.
if (groups.length) {
  const state = (await asc('GET', `/v1/builds/${b.id}/buildBetaDetail`)).data.attributes.externalBuildState;
  if (state === 'READY_FOR_BETA_SUBMISSION') {
    try {
      await asc('POST', '/v1/betaAppReviewSubmissions', { data: { type: 'betaAppReviewSubmissions', relationships: { build: { data: { type: 'builds', id: b.id } } } } });
      console.log('Submitted for Beta App Review; external testers get it once Apple approves it.');
    } catch (e) {
      if (e.status !== 409) throw e;
      console.log('Already submitted for Beta App Review.');
    }
  } else {
    console.log(`External testing: ${state.toLowerCase().replaceAll('_', ' ')}.`);
  }
}
console.log('Done. Testers with automatic updates get it on their own; others tap Update in TestFlight.');
