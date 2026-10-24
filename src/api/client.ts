/** client: internal API implementation. Screens import the connect facade. */
import { supabase } from './supabase';
import type { Database } from './database.types';

export const live = supabase !== null;

export const sb = () => {
  if (!supabase) throw new Error('This feature needs the school server.');
  return supabase;
};

export async function run<T>(p: PromiseLike<{ data: T; error: { message: string } | null }>): Promise<NonNullable<T>> {
  const { data, error } = await p;
  if (error) throw new Error(error.message);
  return data as NonNullable<T>;
}

type Functions = Database['public']['Functions'];
// Postgres accepts null for optional RPC parameters; generated Supabase arguments omit it.
type Args<F extends keyof Functions> = { [K in keyof Functions[F]['Args']]: Functions[F]['Args'][K] | null };
export function rpc<F extends keyof Functions>(fn: F, ...input: {} extends Args<F> ? [args?: Args<F>] : [args: Args<F>]) {
  return run(sb().rpc(fn, (input[0] ?? {}) as Functions[F]['Args']));
}
