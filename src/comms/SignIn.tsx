import { useState } from 'react';
import { Alert, ScrollView, Text, TextInput, View } from 'react-native';
import { signIn, signUp } from '../api/connect';
import { demoEmail, demoPassword } from '../api/supabase';
import { Button, C, Card, H, P, s } from '../ui';

/** Seeded demo accounts for testing each role (only when a demo password is configured). */
const DEMO = [
  ['u-admin', 'Admin'], ['u-eng', 'Teacher'], ['u-vbcoach', 'Coach'], ['u-ap', 'Asst. principal'],
  ['u-s01', 'Student'], ['u-s08', 'Silenced student'], ['u-p01', 'Parent'],
] as const;

export function SignIn({ onDone }: { onDone: () => void }) {
  const [mode, setMode] = useState<'in' | 'up'>('in');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [first, setFirst] = useState('');
  const [last, setLast] = useState('');
  const [busy, setBusy] = useState(false);

  const go = async (fn: () => Promise<unknown>) => {
    setBusy(true);
    try { await fn(); onDone(); } catch (e: any) { Alert.alert('Sign-in problem', e.message); } finally { setBusy(false); }
  };
  const submit = () => go(async () => {
    if (mode === 'in') return signIn(email, password);
    const p = await signUp(email, password, first, last);
    if (!p) Alert.alert('Check your email', 'Confirm your address, then sign in. A school admin will approve your account.');
  });

  return (
    <ScrollView style={s.screen} contentContainerStyle={s.pad} keyboardShouldPersistTaps="handled">
      <Card>
        <H>{mode === 'in' ? 'Sign in to Royals Connect' : 'Create an account'}</H>
        <P muted>Group chats, class boards, announcements and calendars for Kingdom Heights families and staff.</P>
        {mode === 'up' && (
          <View style={[s.row]}>
            <TextInput style={[s.input, { flex: 1 }]} placeholder="First name" value={first} onChangeText={setFirst} />
            <TextInput style={[s.input, { flex: 1 }]} placeholder="Last name" value={last} onChangeText={setLast} />
          </View>
        )}
        <TextInput style={s.input} placeholder="Email" autoCapitalize="none" keyboardType="email-address" value={email} onChangeText={setEmail} />
        <TextInput style={s.input} placeholder="Password" secureTextEntry value={password} onChangeText={setPassword} />
        <Button label={busy ? 'Please wait…' : mode === 'in' ? 'Sign in' : 'Create account'} onPress={submit} disabled={busy || !email || password.length < 6} />
        <Text style={{ color: C.primary, fontWeight: '600', textAlign: 'center' }} onPress={() => setMode(mode === 'in' ? 'up' : 'in')}>
          {mode === 'in' ? 'New here? Create an account' : 'Have an account? Sign in'}
        </Text>
        {mode === 'up' && <P muted>New accounts are approved by a school administrator before groups appear.</P>}
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
