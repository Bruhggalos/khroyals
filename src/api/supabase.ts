/**
 * Supabase client. Configured from app.json `extra` (or EXPO_PUBLIC_* env vars);
 * when nothing is configured the app falls back to the bundled demo data.
 * The publishable key is meant to ship in apps — row-level security and the
 * database functions in supabase/migrations decide what each user can do.
 */
import 'react-native-url-polyfill/auto';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const extra = (Constants.expoConfig?.extra ?? {}) as { supabaseUrl?: string; supabaseKey?: string; demoPassword?: string };
const url = process.env.EXPO_PUBLIC_SUPABASE_URL || extra.supabaseUrl;
const key = process.env.EXPO_PUBLIC_SUPABASE_KEY || extra.supabaseKey;

export const supabase: SupabaseClient | null = url && key
  ? createClient(url, key, {
      auth: { storage: AsyncStorage, persistSession: true, autoRefreshToken: true, detectSessionInUrl: false },
    })
  : null;

/** Shared password of the seeded demo accounts; enables one-tap test logins. */
export const demoPassword = process.env.EXPO_PUBLIC_DEMO_PASSWORD || extra.demoPassword;
export const demoEmail = (legacyId: string) => `${legacyId}@demo.khroyals.test`;
