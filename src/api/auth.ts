/** auth: internal API implementation. Screens import the connect facade. */
import appJson from '../../app.json';
import { Platform } from 'react-native';
import * as Linking from 'expo-linking';
import { live, run, sb } from './client';
import { askForCode } from './retryFetch';
import { session } from './session';

/** Email a 6-digit sign-in code (creates the account on first use; admins approve new people). */
export class NoAccountError extends Error {}

/**
 * Email a one-time sign-in code. Signing in (`create` false) refuses unknown
 * emails with NoAccountError so the app can offer sign-up instead; signing up
 * (`create` true) creates the account (awaiting admin approval) and emails the
 * code to confirm the address.
 */
export async function sendEmailCode(email: string, opts: { create: boolean; firstName?: string; lastName?: string }) {
  const error = await askForCode(() => sb().auth.signInWithOtp({
    email: email.trim().toLowerCase(),
    options: {
      shouldCreateUser: opts.create,
      emailRedirectTo: authRedirectUrl(),
      data: opts.create ? { first_name: opts.firstName?.trim() ?? '', last_name: opts.lastName?.trim() ?? '' } : undefined,
    },
  }));
  if (!error) return;
  if (!opts.create && /signups? not allowed|user not found/i.test(error.message)) throw new NoAccountError('No account uses this email yet.');
  if (/rate limit|too many/i.test(error.message)) throw new Error('Too many codes were sent recently. Wait a few minutes and try again.');
  throw new Error(error.message);
}

/** Where sign-in links return to: this web page, or the app's khroyals://auth link. */
export function authRedirectUrl() {
  const base = (appJson.expo?.experiments?.baseUrl ?? '').replace(/\/$/, '');
  return Platform.OS === 'web' && typeof window !== 'undefined' ? `${window.location.origin}${base}/auth` : Linking.createURL('auth');
}

/**
 * Finish signing in from an emailed link (tokens in the URL fragment or query),
 * for emails that carry a button rather than a code. Returns whether it did.
 */
export async function completeSignInFromUrl(url: string | null): Promise<boolean> {
  if (!live || !url || !/access_token|refresh_token|[?&]code=|error_description/.test(url)) return false;
  const params = new URLSearchParams((url.split('#')[1] ?? '') + '&' + (url.split('?')[1]?.split('#')[0] ?? ''));
  const err = params.get('error_description');
  if (err) throw new Error(err.replace(/\+/g, ' '));
  const access = params.get('access_token'), refresh = params.get('refresh_token'), code = params.get('code');
  if (access && refresh) await sb().auth.setSession({ access_token: access, refresh_token: refresh }).then((r) => { if (r.error) throw r.error; });
  else if (code) await sb().auth.exchangeCodeForSession(code).then((r) => { if (r.error) throw r.error; });
  else return false;
  await session();
  return true;
}

/** Check the emailed one-time code and sign in. */
export async function verifyEmailCode(email: string, code: string) {
  const { error } = await sb().auth.verifyOtp({ email: email.trim().toLowerCase(), token: code.replace(/\D/g, ''), type: 'email' });
  if (error) throw new Error(/expired|invalid/i.test(error.message) ? 'That code is wrong or has expired. Check the latest email, or send a new code.' : error.message);
  return session();
}

/** Where the session stands: 'none' (no app enrolled), 'needs-code', or 'verified'. */
export async function mfaStatus(): Promise<{ state: 'none' | 'needs-code' | 'verified'; factorId?: string }> {
  const factors = await run(sb().auth.mfa.listFactors());
  const totp = (factors.totp ?? []).find((f) => f.status === 'verified');
  if (!totp) return { state: 'none' };
  const aal = await run(sb().auth.mfa.getAuthenticatorAssuranceLevel());
  return { state: aal.currentLevel === 'aal2' ? 'verified' : 'needs-code', factorId: totp.id };
}

/** Start linking an authenticator app: returns the secret, an otpauth:// link and a QR (SVG data URI). */
export async function mfaEnroll() {
  const factors = await run(sb().auth.mfa.listFactors());
  for (const f of factors.all ?? []) if (f.status !== 'verified') await sb().auth.mfa.unenroll({ factorId: f.id });
  const r = await run(sb().auth.mfa.enroll({ factorType: 'totp', friendlyName: 'Royals Connect' }));
  return { factorId: r.id as string, secret: r.totp.secret as string, uri: r.totp.uri as string, qr: r.totp.qr_code as string };
}

/** Verify a 6-digit authenticator code (finishes enrollment, or upgrades this session to aal2). */
export async function mfaVerify(factorId: string, code: string) {
  await run(sb().auth.mfa.challengeAndVerify({ factorId, code: code.trim() }));
  return session();
}
