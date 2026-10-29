/** session: internal API implementation. Screens import the connect facade. */
import * as mock from './mockApi';
import type { Person } from './types';
import { live, run, sb } from './client';
import { avatarUrl, signAvatars } from './storage';
import { toPerson } from './mappers';
import { AsyncCache } from './cache';
import { clearSignedUrls } from './storage';

export const directory = new Map<string, Person>();

export let current: Person | null = null;
const profiles = new AsyncCache<Person[]>(60_000);
let accountId: string | null = null;

function clearSession() {
  profiles.clear(); directory.clear(); clearSignedUrls(); current = null;
}

/** Signed-in person (null = signed out). Loads the directory for author names. */
export async function session(opts: { refresh?: boolean } = {}): Promise<Person | null> {
  if (!live) return mock.me();
  const { data, error } = await sb().auth.getSession();
  if (error) throw error;
  const uid = data.session?.user.id;
  if (!uid) { accountId = null; clearSession(); return null; }
  if (accountId !== uid || opts.refresh) { clearSession(); accountId = uid; }
  const people = await profiles.get(uid, async () => {
    const rows = [];
    for (let offset = 0; ; offset += 500) {
      const page = await run(sb().from('profiles').select('*').order('id').range(offset, offset + 499));
      rows.push(...page);
      if (page.length < 500) break;
    }
    await signAvatars(rows.map((p) => p.avatar_url)).catch(() => {});
    return rows.map((row) => toPerson(row, avatarUrl(row.avatar_url)));
  });
  if (accountId !== uid) return null;
  directory.clear();
  people.forEach((p) => directory.set(p.id, p));
  current = directory.get(uid) ?? null;
  if (!current) throw new Error('Your school profile could not be loaded.');
  current.email = data.session?.user.email;
  return current;
}

export const me = (): Person | null => (live ? current : mock.me());

export const getUser = (id: string): Person | undefined => (live ? directory.get(id) : mock.getUser(id));

export const listUsers = async (): Promise<Person[]> => (live ? [...directory.values()] : mock.listUsers());

/** Whether this device has a saved sign-in (no network needed): keeps someone in when their profile can't load offline. */
export async function hasSignIn(): Promise<boolean> {
  if (!live) return true;
  const { data } = await sb().auth.getSession();
  return !!data.session;
}

export async function signOut() {
  if (live) { const { error } = await sb().auth.signOut(); if (error) throw error; }
  accountId = null; clearSession();
}

export const onAuthChange = (cb: () => void) => {
  if (!live) return () => {};
  const { data } = sb().auth.onAuthStateChange((event, auth) => {
    if ((auth?.user.id ?? null) !== accountId || event === 'USER_UPDATED') {
      clearSession(); accountId = auth?.user.id ?? null;
    }
    // Supabase holds an auth lock during this callback; database reads run after it returns.
    setTimeout(cb, 0);
  });
  return () => data.subscription.unsubscribe();
};

/** Demo-data mode only: view the app as another person. */
export const setMockUser = mock.setCurrentUser;
