import type { RealtimeChannel } from '@supabase/supabase-js';
import { live, sb } from './client';
import type { Database } from './database.types';

type Change = { table: keyof Database['public']['Tables']; filter?: string; event?: '*' | 'INSERT' | 'UPDATE' | 'DELETE' };

/** Each subscriber owns its channel and cleanup; bursts trigger a single refresh. */
export function subscribeChanges(name: string, changes: Change[], onChange: () => void): () => void {
  if (!live) return () => {};
  let timer: ReturnType<typeof setTimeout> | undefined;
  const fire = () => { clearTimeout(timer); timer = setTimeout(onChange, 150); };
  let ch: RealtimeChannel = sb().channel(`${name}-${Math.random().toString(36).slice(2)}`);
  for (const c of changes) {
    ch = ch.on('postgres_changes', { event: c.event ?? '*', schema: 'public', table: c.table, filter: c.filter }, fire);
  }
  ch.subscribe();
  return () => { clearTimeout(timer); sb().removeChannel(ch); };
}
