import { useState } from 'react';
import { Alert, ScrollView, Text, TextInput, View } from 'react-native';
import { sendEmailCode, sendPasswordReset, signIn, signUp, verifyEmailCode } from '../api/connect';
import { demoEmail, demoPassword } from '../api/supabase';
import { Button, C, Card, H, P, s } from '../ui';

/** Seeded demo accounts for testing each role (only when a demo password is configured). */
const DEMO = [
  ['u-eng', 'Teacher'], ['u-vbcoach', 'Coach'],
  ['u-s01', 'Student'], ['u-s08', 'Silenced student'], ['u-p01', 'Parent'],
] as const;

type Mode = 'signin' | 'signup' | 'link' | 'forgot' | 'link-sent';

const tab = (label: string, on: boolean, onPress: () => void) => (
  <Text onPress={onPress} accessibilityRole="tab" accessibilityState={{ selected: on }}
    style={{ flex: 1, textAlign: 'center', paddingVertical: 10, fontWeight: '700', borderBottomWidth: 2,
      borderBottomColor: on ? C.primary : C.line, color: on ? C.primary : C.muted }}>{label}</Text>
);

/**
 * Sign in or create an account. Accounts use email + password; signing in by
 * an emailed link and "forgot password" are available too. New accounts are
 * approved by a school admin before groups appear.
 */
export function SignIn({ onDone }: { onDone: () => void }) {
  const [mode, setMode] = useState<Mode>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [password2, setPassword2] = useState('');
  const [first, setFirst] = useState('');
  const [last, setLast] = useState('');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);

  const go = async (fn: () => Promise<unknown>, after?: () => void) => {
    setBusy(true);
    try { await fn(); after ? after() : onDone(); } catch (e: any) { Alert.alert('Sign-in problem', e.message); } finally { setBusy(false); }
  };
  const emailOk = /^\S+@\S+\.\S+$/.test(email.trim());
  const signupProblem = !first.trim() || !last.trim() ? 'Enter your first and last name.'
    : !emailOk ? 'Enter a valid email.'
    : password.length < 8 ? 'Choose a password with at least 8 characters.'
    : password !== password2 ? 'The passwords don\'t match.' : null;

  const emailInput = (
    <TextInput style={s.input} placeholder="Email" autoCapitalize="none" autoComplete="email" keyboardType="email-address"
      value={email} onChangeText={setEmail} />
  );

  return (
    <ScrollView style={s.screen} contentContainerStyle={s.pad} keyboardShouldPersistTaps="handled">
      <Card>
        <H>Royals Connect</H>
        {(mode === 'signin' || mode === 'signup') && (
          <View style={{ flexDirection: 'row' }}>
            {tab('Sign in', mode === 'signin', () => setMode('signin'))}
            {tab('Create account', mode === 'signup', () => setMode('signup'))}
          </View>
        )}

        {mode === 'signin' && (
          <>
            {emailInput}
            <TextInput style={s.input} placeholder="Password" secureTextEntry autoComplete="current-password" value={password} onChangeText={setPassword} />
            <Button label={busy ? 'Signing in…' : 'Sign in'} disabled={busy || !emailOk || !password} onPress={() => go(() => signIn(email, password))} />
            <View style={[s.row, { justifyContent: 'space-between' }]}>
              <Text style={{ color: C.primary }} onPress={() => setMode('forgot')}>Forgot password?</Text>
              <Text style={{ color: C.primary }} onPress={() => setMode('link')}>Email me a sign-in link</Text>
            </View>
          </>
        )}

        {mode === 'signup' && (
          <>
            <View style={s.row}>
              <TextInput style={[s.input, { flex: 1, minWidth: 0 }]} placeholder="First name" autoComplete="given-name" value={first} onChangeText={setFirst} />
              <TextInput style={[s.input, { flex: 1, minWidth: 0 }]} placeholder="Last name" autoComplete="family-name" value={last} onChangeText={setLast} />
            </View>
            {emailInput}
            <TextInput style={s.input} placeholder="Password (8+ characters)" secureTextEntry autoComplete="new-password" value={password} onChangeText={setPassword} />
            <TextInput style={s.input} placeholder="Repeat password" secureTextEntry autoComplete="new-password" value={password2} onChangeText={setPassword2} />
            {(first || email || password) && signupProblem ? <P muted>{signupProblem}</P> : null}
            <Button label={busy ? 'Creating account…' : 'Create account'} disabled={busy || !!signupProblem}
              onPress={() => go(async () => {
                const p = await signUp(email, password, first, last);
                if (!p) Alert.alert('Confirm your email', `We sent a link to ${email.trim()}. Open it on this device to finish signing up.`);
              })} />
            <P muted>A school administrator approves new accounts and adds you to your groups.</P>
          </>
        )}

        {mode === 'forgot' && (
          <>
            <P>Enter your email and we'll send a link to set a new password. Open it on this device.</P>
            {emailInput}
            <Button label={busy ? 'Sending…' : 'Send reset link'} disabled={busy || !emailOk}
              onPress={() => go(() => sendPasswordReset(email), () => { Alert.alert('Check your email', 'Tap the link in the email to set a new password.'); setMode('signin'); })} />
            <Text style={{ color: C.primary }} onPress={() => setMode('signin')}>Back to sign in</Text>
          </>
        )}

        {mode === 'link' && (
          <>
            <P>We'll email you a link that signs you in, with no password needed. Open it on this device.</P>
            {emailInput}
            <Button label={busy ? 'Sending…' : 'Email me a sign-in link'} disabled={busy || !emailOk}
              onPress={() => go(() => sendEmailCode(email), () => setMode('link-sent'))} />
            <Text style={{ color: C.primary }} onPress={() => setMode('signin')}>Back to sign in</Text>
          </>
        )}

        {mode === 'link-sent' && (
          <>
            <P>Check {email.trim()} and tap <Text style={{ fontWeight: '700' }}>the sign-in link on this device</Text>. It opens Royals Connect and signs you in.</P>
            <P muted>If your email shows a 6-digit code instead, enter it here:</P>
            <TextInput style={[s.input, { fontSize: 22, letterSpacing: 6, textAlign: 'center' }]} placeholder="123456" keyboardType="number-pad"
              autoComplete="one-time-code" maxLength={8} value={code} onChangeText={setCode} />
            <Button label={busy ? 'Checking…' : 'Sign in'} disabled={busy || code.trim().length < 6} onPress={() => go(() => verifyEmailCode(email, code))} />
            <Text style={{ color: C.primary }} onPress={() => { setMode('signin'); setCode(''); }}>Back to sign in</Text>
          </>
        )}
      </Card>

      {demoPassword && (mode === 'signin' || mode === 'signup') && (
        <Card>
          <Text style={{ fontSize: 12, fontWeight: '700', color: C.muted }}>DEMO ACCOUNTS (TEST DATA)</Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
            {DEMO.map(([id, label]) => (
              <Text key={id} onPress={() => !busy && go(() => signIn(demoEmail(id), demoPassword!))}
                style={{ paddingHorizontal: 10, paddingVertical: 6, borderRadius: 999, overflow: 'hidden', borderWidth: 1, borderColor: C.line, color: C.ink, backgroundColor: '#fff' }}>
                {label}
              </Text>
            ))}
          </View>
        </Card>
      )}
    </ScrollView>
  );
}
