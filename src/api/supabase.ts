/**
 * Supabase client. Configured from app.json `extra` (or EXPO_PUBLIC_* env vars);
 * when nothing is configured the app falls back to the bundled demo data.
 * The publishable key is meant to ship in apps — row-level security and the
 * database functions in supabase/migrations decide what each user can do.
 */
import 'react-native-url-polyfill/auto';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
// Read straight from app.json so web, Android and iOS builds all get it.
import appJson from '../../app.json';

const extra = ((appJson as any).expo?.extra ?? {}) as { supabaseUrl?: string; supabaseKey?: string };
const url = process.env.EXPO_PUBLIC_SUPABASE_URL || extra.supabaseUrl;
const key = process.env.EXPO_PUBLIC_SUPABASE_KEY || extra.supabaseKey;
/** For native code that calls the database itself (the Android Auto car line screen). */
export const supabaseUrl = url ?? null;
export const supabaseKey = key ?? null;

export const supabase: SupabaseClient | null = url && key
  ? createClient(url, key, {
      auth: { storage: AsyncStorage, persistSession: true, autoRefreshToken: true, detectSessionInUrl: false },
    })
  : null;
