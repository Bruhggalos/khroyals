/**
 * Ask Leo, the Kingdom Heights assistant: answers questions from the Student /
 * Parent Handbook, the upcoming events the person can see, and the staff
 * directory, using Claude.
 *
 * The app posts { messages: [{ role, content }, …] } with the person's session
 * (JWT verification on). Approved accounts only; each question counts against a
 * daily limit (app.settings: assistant_daily_limit, assistant_model). Needs the
 * ANTHROPIC_API_KEY secret; until it's set the function answers 503
 * not_configured. Deployed by scripts/supabase_setup.mjs.
 */
import Anthropic from 'npm:@anthropic-ai/sdk@0.135.0';
import { createClient } from 'npm:@supabase/supabase-js@2';
import { HANDBOOK } from './handbook.ts';
import { dailyContext, FRONT_OFFICE, schoolToday, stableSystem, trimHistory, type Contact, type EventItem } from './prompt.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;
const admin = createClient(SUPABASE_URL, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } });
const SYSTEM = stableSystem(HANDBOOK);

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const reply = (status: number, body: Record<string, unknown>) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return reply(405, { error: 'method', message: 'Use POST.' });

  // Who's asking, read with their own permissions.
  const jwt = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '');
  const db = createClient(SUPABASE_URL, ANON_KEY, {
    global: { headers: { Authorization: `Bearer ${jwt}` } }, auth: { persistSession: false },
  });
  const { data: auth } = await db.auth.getUser(jwt);
  const user = auth?.user;
  if (!user) return reply(401, { error: 'signed_out', message: 'Sign in to ask Leo.' });
  const { data: me } = await db.from('profiles').select('first_name, school_role, grade').eq('id', user.id).maybeSingle();
  if (!me?.school_role) return reply(403, { error: 'pending', message: 'Leo can help once the school office approves your account.' });

  const history = trimHistory((await req.json().catch(() => null))?.messages);
  if (!history) return reply(400, { error: 'bad_request', message: 'Type a question first.' });

  const apiKey = Deno.env.get('ANTHROPIC_API_KEY');
  if (!apiKey) {
    return reply(503, { error: 'not_configured', message: `Leo isn't switched on yet. Until then, you can reach ${FRONT_OFFICE}.` });
  }

  // Count the question against today's limit (rolled back if over it).
  const { data: quota, error: limitError } = await admin.rpc('assistant_take_question', { p_user: user.id });
  if (limitError) return reply(429, { error: 'limit', message: limitError.message });
  const { remaining, model } = quota as { remaining: number | null; model: string };

  // Context: the staff directory, events this person can see, and (for parents) their children's grades.
  const today = schoolToday();
  const [contacts, events, children] = await Promise.all([
    db.from('assistant_contacts').select('name, title, helps_with, email, phone').eq('active', true).order('sort'),
    db.from('events').select('title, starts_on, ends_on, start_time, end_time, location, category, groups(name)')
      .gte('starts_on', new Date(Date.parse(today) - 30 * 86_400_000).toISOString().slice(0, 10)).order('starts_on'),
    me.school_role === 'parent' ? db.from('guardians').select('student_id').eq('guardian_id', user.id) : Promise.resolve({ data: [] }),
  ]);
  const childIds = (children.data ?? []).map((g: { student_id: string }) => g.student_id);
  const grades = me.school_role === 'student' ? [me.grade]
    : childIds.length ? ((await db.from('profiles').select('grade').in('id', childIds)).data ?? []).map((p: { grade: number | null }) => p.grade)
    : [];

  const context = dailyContext({
    today,
    asker: { firstName: me.first_name ?? '', role: me.school_role, grades: grades.filter((g): g is number => typeof g === 'number') },
    contacts: (contacts.data ?? []).map((c: any): Contact => ({ name: c.name, title: c.title, helpsWith: c.helps_with, email: c.email, phone: c.phone })),
    events: (events.data ?? []).map((e: any): EventItem => ({
      title: e.title, startsOn: e.starts_on, endsOn: e.ends_on, startTime: e.start_time?.slice(0, 5) ?? null,
      endTime: e.end_time?.slice(0, 5) ?? null, location: e.location, category: e.category, group: e.groups?.name ?? null,
    })),
  });

  const client = new Anthropic({ apiKey });
  try {
    const message = await client.messages.stream({
      model,
      max_tokens: 8000,
      output_config: { effort: 'medium' },
      system: [
        { type: 'text', text: SYSTEM, cache_control: { type: 'ephemeral', ttl: '1h' } },
        { type: 'text', text: context },
      ],
      messages: history,
    }).finalMessage();

    const u = message.usage;
    await admin.rpc('assistant_finish', {
      p_user: user.id, p_answered: true, p_input: u.input_tokens, p_output: u.output_tokens,
      p_cache_read: u.cache_read_input_tokens ?? 0, p_cache_write: u.cache_creation_input_tokens ?? 0,
    });
    console.log(JSON.stringify({ model, stop: message.stop_reason, input: u.input_tokens, output: u.output_tokens,
      cacheRead: u.cache_read_input_tokens, cacheWrite: u.cache_creation_input_tokens }));

    const text = message.content.flatMap((b) => (b.type === 'text' ? [b.text] : [])).join('\n').trim();
    if (message.stop_reason === 'refusal' || !text) {
      return reply(200, { answer: `I can't help with that one. For school questions, you can reach ${FRONT_OFFICE}.`, remaining });
    }
    return reply(200, { answer: text, remaining });
  } catch (e) {
    await admin.rpc('assistant_finish', { p_user: user.id, p_answered: false });  // give the question back
    if (e instanceof Anthropic.AuthenticationError || e instanceof Anthropic.PermissionDeniedError) {
      console.error('assistant: Anthropic key rejected');
      return reply(503, { error: 'not_configured', message: `Leo isn't working right now. You can reach ${FRONT_OFFICE}.` });
    }
    if (e instanceof Anthropic.RateLimitError || (e instanceof Anthropic.APIError && (e.status ?? 0) >= 500)) {
      return reply(503, { error: 'busy', message: 'Leo is busy right now. Please try again in a minute.' });
    }
    console.error('assistant failed', e instanceof Anthropic.APIError ? `${e.status} ${e.message}` : String(e));
    return reply(502, { error: 'failed', message: "Leo couldn't answer right now. Please try again." });
  }
});
