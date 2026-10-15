import { useState } from 'react';
import { Alert, ScrollView, Text, TextInput, View } from 'react-native';
import { sendEmailCode, signIn, verifyEmailCode } from '../api/connect';
import { demoEmail, demoPassword } from '../api/supabase';
import { Button, C, Card, H, P, s } from '../ui';

/** Seeded demo accounts for testing each role (only when a demo password is configured). */
const DEMO = [
  ['u-eng', 'Teacher'], ['u-vbcoach', 'Coach'],
  ['u-s01', 'Student'], ['u-s08', 'Silenced student'], ['u-p01', 'Parent'],
] as const;

/** Passwordless sign-in: we email a 6-digit code. First sign-in creates the account. */
export function SignIn({ onDone }: { onDone: () => void }) {
  const [step, setStep] = useState<'email' | 'code'>('email');
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [first, setFirst] = useState('');
  const [last, setLast] = useState('');
  const [busy, setBusy] = useState(false);

  const go = async (fn: () => Promise<unknown>, after?: () => void) => {
    setBusy(true);
    try { await fn(); after ? after() : onDone(); } catch (e: any) { Alert.alert('Sign-in problem', e.message); } finally { setBusy(false); }
  };
  const valid = /^\S+@\S+\.\S+$/.test(email.trim());

  return (
    <ScrollView style={s.screen} contentContainerStyle={s.pad} keyboardShouldPersistTaps="handled">
      <Card>
        <H>Sign in to Royals Connect</H>
        {step === 'email' ? (
          <>
            <P muted>Enter your email and we'll send you a sign-in link. No password needed.</P>
            <TextInput style={s.input} placeholder="Email" autoCapitalize="none" autoComplete="email" keyboardType="email-address"
              value={email} onChangeText={setEmail} />
            <View style={s.row}>
              <TextInput style={[s.input, { flex: 1, minWidth: 0 }]} placeholder="First name" value={first} onChangeText={setFirst} />
              <TextInput style={[s.input, { flex: 1, minWidth: 0 }]} placeholder="Last name" value={last} onChangeText={setLast} />
            </View>
            <P muted>Name only needed the first time.</P>
            <Button label={busy ? 'Sending…' : 'Email me a sign-in link'} disabled={busy || !valid}
              onPress={() => go(() => sendEmailCode(email, first || undefined, last || undefined), () => setStep('code'))} />
            <P muted>New here? Your account is approved by the school office before groups appear.</P>
          </>
        ) : (
          <>
            <P>Check {email.trim()} for an email from Royals Connect and tap <Text style={{ fontWeight: '700' }}>the sign-in link on this device</Text> — it opens Royals Connect and signs you in.</P>
            <P muted>If your email shows a 6-digit code instead, enter it here:</P>
            <TextInput style={[s.input, { fontSize: 22, letterSpacing: 6, textAlign: 'center' }]} placeholder="123456" keyboardType="number-pad"
              autoComplete="one-time-code" maxLength={8} value={code} onChangeText={setCode} />
            <Button label={busy ? 'Checking…' : 'Sign in'} disabled={busy || code.trim().length < 6} onPress={() => go(() => verifyEmailCode(email, code))} />
            <View style={[s.row, { justifyContent: 'space-between' }]}>
              <Text style={{ color: C.primary }} onPress={() => { setStep('email'); setCode(''); }}>Use a different email</Text>
              <Text style={{ color: C.primary }} onPress={() => go(() => sendEmailCode(email), () => Alert.alert('Sent', 'Check your email for a new code.'))}>Send again</Text>
            </View>
          </>
        )}
      </Card>

      {demoPassword && (
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
