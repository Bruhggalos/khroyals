/**
 * fetch for the Supabase client that tries again when a phone briefly loses its
 * connection and no answer comes back (iOS: "The network connection was lost"): twice
 * more, after 0.4 and 1.2 seconds. Only requests that can't change anything are tried
 * again: table reads (GET/HEAD), the database functions in READ_ONLY_RPCS (declared
 * STABLE, which Postgres won't let write; tests/retry-fetch.test.ts checks), and
 * refreshing the sign-in (Supabase accepts the same refresh token again for a few
 * seconds). Answers from the server, errors included, are never retried. Sign-in codes
 * have their own rule (askForCode). No app imports, so tests run it.
 */
import { isNetworkError } from './errors';

/** The app's read-only database functions (all STABLE in supabase/migrations). */
export const READ_ONLY_RPCS = new Set([
  'admin_family_requests', 'admin_list_people', 'admin_list_sections', 'admin_section_students', 'admin_similar_students',
  'carline_board', 'carline_config', 'carline_today', 'child_assignments', 'child_pickup_people', 'critical_alert_status',
  'form_status', 'group_abilities', 'group_post_stats', 'market_terms', 'my_access', 'my_class_students', 'my_forms', 'my_groups', 'my_notifications',
  'my_pickup_children', 'my_sections', 'my_sport_schedule', 'my_sports', 'my_teachers', 'notification_open_counts',
  'permission_catalog', 'post_stats', 'sent_forms', 'sport_event_attendance', 'teacher_conversations', 'teacher_thread', 'teacher_thread_for',
]);

/** Whether sending this request twice can't change anything. */
export function isReadOnly(url: string, method = 'GET') {
  const m = method.toUpperCase();
  if (m === 'GET' || m === 'HEAD') return true;
  if (m !== 'POST') return false;
  const rpc = /\/rest\/v1\/rpc\/(\w+)/.exec(url);
  if (rpc) return READ_ONLY_RPCS.has(rpc[1]);
  return /\/auth\/v1\/token\?(?:.*&)?grant_type=refresh_token\b/.test(url);
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export function retryingFetch(base: typeof fetch, waits = [400, 1200], wait = sleep): typeof fetch {
  return async (input, init) => {
    const req = typeof input === 'object' && 'url' in input ? input : null;
    const url = req ? req.url : String(input);
    const again = isReadOnly(url, init?.method ?? req?.method ?? 'GET');
    for (let i = 0; ; i++) {
      try {
        return await base(input, init);
      } catch (e) {
        // No answer came back. Give up on writes, when out of tries, or when the caller cancelled.
        if (!again || i >= waits.length || init?.signal?.aborted || (e as Error)?.name === 'AbortError') throw e;
        await wait(waits[i]);
      }
    }
  };
}

/** Supabase's answer when that email was sent a code less than a minute ago. */
export const codeAlreadySent = (message: string) => /only request this after/i.test(message);

type CodeError = { message: string };

/**
 * Ask for an emailed sign-in code, asking again (after the same waits as reads) when the
 * connection drops. A dropped request usually never reached the server; if it did, Supabase
 * refuses another code for that email within a minute, so nobody gets two emails and the code
 * already sent is the one to enter. Returns Supabase's error, or null once a code is on its way.
 */
export async function askForCode(ask: () => Promise<{ error: CodeError | null }>, waits = [400, 1200], wait = sleep) {
  for (let i = 0; ; i++) {
    const { error } = await ask().catch((e: CodeError) => ({ error: e }));
    if (!error || codeAlreadySent(error.message)) return null;
    if (!isNetworkError(error) || i >= waits.length) return error;
    await wait(waits[i]);
  }
}
