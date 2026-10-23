/**
 * Supabase client. Configured from app.json `extra` (or EXPO_PUBLIC_* env vars);
 * when nothing is configured the app falls back to the bundled demo data.
 * The publishable key is meant to ship in apps — row-level security and the
 * database functions in supabase/migrations decide what each user can do.
 */
import 'react-native-url-polyfill/auto';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';
import type { Database } from './database.types';
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
    })
  : null;
