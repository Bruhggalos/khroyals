import { useEffect, useState } from 'react';
import { Alert, ScrollView, Text, View } from 'react-native';
import { NoAccountError, errorText, sendEmailCode, verifyEmailCode } from '../api/connect';
import { Button, C, Card, Field, H, P, s } from '../ui';

type Step = 'login' | 'signup' | 'code';
const RESEND_SECONDS = 60;

const tab = (label: string, on: boolean, onPress: () => void) => (
  <Text onPress={onPress} accessibilityRole="tab" accessibilityState={{ selected: on }}
    style={{ flex: 1, textAlign: 'center', paddingVertical: 10, fontWeight: '700', borderBottomWidth: 2,
      borderBottomColor: on ? C.primary : C.line, color: on ? C.primary : C.muted }}>{label}</Text>
);

/**
 * Passwordless sign-in with a one-time code:
 *   Log in         → email → we email a 6-digit code → enter it.
 *   Create account → name + email → code → account created (an admin approves it).
 * An email with no account on "Log in" moves to "Create account" with the email filled in.
 */
export function SignIn({ onDone }: { onDone: () => void }) {
  const [step, setStep] = useState<Step>('login');
  const [creating, setCreating] = useState(false);   // which flow the code step belongs to
  const [email, setEmail] = useState('');
  const [first, setFirst] = useState('');
  const [last, setLast] = useState('');
  const [code, setCode] = useState('');
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [wait, setWait] = useState(0);

  useEffect(() => {
    if (wait <= 0) return;
    const t = setTimeout(() => setWait(wait - 1), 1000);
    return () => clearTimeout(t);
  }, [wait]);

  const emailOk = /^\S+@\S+\.\S+$/.test(email.trim());
  const nameOk = first.trim().length > 0 && last.trim().length > 0;

  const send = async (create: boolean) => {
    setBusy(true); setError(null);
    try {
      await sendEmailCode(email, { create, firstName: first, lastName: last });
      setCreating(create); setCode(''); setWait(RESEND_SECONDS); setStep('code');
    } catch (e: any) {
      if (e instanceof NoAccountError) {
        setStep('signup');
        setNotice(`There's no account for ${email.trim()} yet. Add your name to create one.`);
      } else setError(errorText(e));
    } finally { setBusy(false); }
  };

  const verify = async () => {
    setBusy(true); setError(null);
    try { await verifyEmailCode(email, code); onDone(); } catch (e: any) { setError(errorText(e)); } finally { setBusy(false); }
  };

  const switchTo = (next: 'login' | 'signup') => { setStep(next); setNotice(null); setError(null); };

  return (
    <ScrollView style={s.screen} contentContainerStyle={s.pad} keyboardShouldPersistTaps="handled">
      <Card>
        <H>Royals Connect</H>
        {step !== 'code' && (
          <View style={{ flexDirection: 'row' }}>
            {tab('Log in', step === 'login', () => switchTo('login'))}
            {tab('Create account', step === 'signup', () => switchTo('signup'))}
          </View>
        )}
        {notice && step !== 'code' && <P>{notice}</P>}

        {step === 'login' && (
          <>
            <Field label="Email" placeholder="you@example.com" autoCapitalize="none" autoComplete="email" keyboardType="email-address"
              textContentType="emailAddress" value={email} onChangeText={setEmail} error={error} returnKeyType="send"
              onSubmitEditing={() => emailOk && send(false)} />
            <Button label={busy ? 'Sending code…' : 'Send me a code'} disabled={busy || !emailOk} onPress={() => send(false)} />
            <P muted>No password needed. We email you a 6-digit code each time you log in.</P>
          </>
        )}

        {step === 'signup' && (
          <>
            <View style={s.row}>
              <Field label="First name" placeholder="Jordan" autoComplete="given-name" textContentType="givenName"
                value={first} onChangeText={setFirst} style={{ flex: 1, minWidth: 0 }} />
              <Field label="Last name" placeholder="Smith" autoComplete="family-name" textContentType="familyName"
                value={last} onChangeText={setLast} style={{ flex: 1, minWidth: 0 }} />
            </View>
            <Field label="Email" placeholder="you@example.com" autoCapitalize="none" autoComplete="email" keyboardType="email-address"
              textContentType="emailAddress" value={email} onChangeText={setEmail} error={error} />
            <Button label={busy ? 'Sending code…' : 'Create account'} disabled={busy || !emailOk || !nameOk} onPress={() => send(true)} />
            <P muted>We'll email a code to confirm your address. A school administrator then approves your account and adds you to your groups.</P>
          </>
        )}

        {step === 'code' && (
          <>
            <P>We sent a 6-digit code to <Text style={{ fontWeight: '700' }}>{email.trim()}</Text>. Enter it below to {creating ? 'finish creating your account' : 'log in'}.</P>
            <Field label="Code" placeholder="123456" keyboardType="number-pad" autoComplete="one-time-code" textContentType="oneTimeCode"
              maxLength={8} value={code} onChangeText={(t) => setCode(t.replace(/\D/g, ''))} error={error}
              style={{ fontSize: 24, letterSpacing: 8, textAlign: 'center' }} returnKeyType="done"
              onSubmitEditing={() => code.length >= 6 && verify()} />
            <Button label={busy ? 'Checking…' : creating ? 'Create account' : 'Log in'} disabled={busy || code.length < 6} onPress={verify} />
            <View style={[s.row, { justifyContent: 'space-between', flexWrap: 'wrap' }]}>
              <Text style={{ color: C.primary }} onPress={() => { switchTo(creating ? 'signup' : 'login'); setCode(''); }}>Use a different email</Text>
              <Text style={{ color: wait > 0 ? C.muted : C.primary }}
                onPress={wait > 0 || busy ? undefined : () => send(creating).then(() => Alert.alert('Code sent', 'Check your email for the new code.'))}>
                {wait > 0 ? `Resend code in ${wait}s` : 'Resend code'}
              </Text>
            </View>
            <P muted>Codes expire after 10 minutes. Not in your inbox? Check spam. If the email has a Sign in button instead of a code, tap it on this device.</P>
          </>
        )}
      </Card>
    </ScrollView>
  );
}
