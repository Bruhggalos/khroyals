/**
 * Gives a child their own login: { studentId, email }. student_login_request checks, as the
 * signed-in caller, that they're the child's parent or the office and that the email is free;
 * then the login is created with the child's own profile id (so their parents, classes and
 * activities carry over) and app.handle_new_user emails the child how to sign in.
 * Deployed with JWT verification on (scripts/supabase_setup.mjs).
 */
import { createClient } from 'npm:@supabase/supabase-js@2';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const reply = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });

const URL_ = Deno.env.get('SUPABASE_URL')!;
const admin = createClient(URL_, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } });

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  const auth = req.headers.get('Authorization');
  const apikey = req.headers.get('apikey') ?? Deno.env.get('SUPABASE_ANON_KEY');
  if (!auth || !apikey) return reply(401, { error: 'Sign in first.' });
  let body: { studentId?: string; email?: string } = {};
  try { body = await req.json(); } catch { /* checked below */ }
  if (!body.studentId || !body.email) return reply(400, { error: 'Which child, and which email?' });

  // As the caller: the database decides whether they may.
  const caller = createClient(URL_, apikey, { auth: { persistSession: false }, global: { headers: { Authorization: auth } } });
  const { data: kid, error } = await caller.rpc('student_login_request', { p_student: body.studentId, p_email: body.email });
  if (error) return reply(400, { error: error.message });

  const { error: made } = await admin.auth.admin.createUser({
    id: kid.studentId, email: kid.email, email_confirm: true,
    user_metadata: { first_name: kid.firstName, last_name: kid.lastName, student: true },
  });
  if (made) {
    await admin.from('student_logins').delete().eq('student_id', kid.studentId);
    return reply(400, { error: `The login couldn't be made: ${made.message}` });
  }
  return reply(200, { email: kid.email });
});
