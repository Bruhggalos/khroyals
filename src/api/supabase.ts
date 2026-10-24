/**
 * Supabase client. Configured from app.json `extra` (or EXPO_PUBLIC_* env vars);
 * when nothing is configured the app falls back to the bundled demo data.
 * The publishable key is meant to ship in apps — row-level security and the
 * database functions in supabase/migrations decide what each user can do.
 * Reads are tried again after a dropped connection (retryFetch.ts), and on phones the
 * sign-in is kept fresh only while the app is in front, as Supabase advises.
 */
import 'react-native-url-polyfill/auto';
import { AppState, Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';
import type { Database } from './database.types';
import { retryingFetch } from './retryFetch';
// Read straight from app.json so web, Android and iOS builds all get it.
import appJson from '../../app.json';

const extra = appJson.expo.extra;
const url = process.env.EXPO_PUBLIC_SUPABASE_URL || extra.supabaseUrl;
const key = process.env.EXPO_PUBLIC_SUPABASE_KEY || extra.supabaseKey;
/** For native code that calls the database itself (the Android Auto car line screen). */
export const supabaseUrl = url ?? null;
export const supabaseKey = key ?? null;

export const supabase = url && key
  ? createClient<Database>(url, key, {
      auth: { storage: AsyncStorage, persistSession: true, autoRefreshToken: true, detectSessionInUrl: false },
      global: { fetch: retryingFetch((input, init) => fetch(input, init)) },
    })
  : null;

// Timers don't run while a phone app is in the background, so a sign-in can expire
// there. Refresh it as soon as the app is back in front, before screens start loading.
if (supabase && Platform.OS !== 'web') {
  AppState.addEventListener('change', (state) => {
    if (state === 'active') supabase.auth.startAutoRefresh();
    else supabase.auth.stopAutoRefresh();
  });
}
