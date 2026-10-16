/** Set a new password: after a password-reset link, or to change it while signed in. */
import { useEffect, useState } from 'react';
import { Alert, ScrollView, TextInput } from 'react-native';
import { Stack, router } from 'expo-router';
import { me, session, updatePassword } from '../src/api/connect';
import { Button, Card, H, Loading, P, s } from '../src/ui';

export default function SetPassword() {
  const [ready, setReady] = useState(false);
  const [signedIn, setSignedIn] = useState(false);
  const [pw, setPw] = useState('');
  const [pw2, setPw2] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => { session().then((p) => { setSignedIn(!!p); setReady(true); }).catch(() => setReady(true)); }, []);

  if (!ready) return <Loading />;
  if (!signedIn) {
    return (
      <ScrollView style={s.screen} contentContainerStyle={s.pad}>
        <Stack.Screen options={{ title: 'Password' }} />
        <Card><P>That reset link has expired or was already used. Request a new one from the sign-in screen.</P>
          <Button label="Back to sign-in" onPress={() => router.replace('/connect')} /></Card>
      </ScrollView>
    );
  }
  const problem = pw.length < 8 ? 'Use at least 8 characters.' : pw !== pw2 ? 'The passwords don\'t match.' : null;
  const save = async () => {
    setBusy(true);
    try { await updatePassword(pw); Alert.alert('Password saved', 'Use it next time you sign in.'); router.replace('/connect'); }
    catch (e: any) { Alert.alert('Couldn\'t save the password', e.message); }
    setBusy(false);
  };

  return (
    <ScrollView style={s.screen} contentContainerStyle={s.pad} keyboardShouldPersistTaps="handled">
      <Stack.Screen options={{ title: 'Password' }} />
      <Card>
        <H>Set a new password</H>
        <P muted>For {me()?.email}</P>
        <TextInput style={s.input} placeholder="New password (8+ characters)" secureTextEntry autoComplete="new-password" value={pw} onChangeText={setPw} />
        <TextInput style={s.input} placeholder="Repeat new password" secureTextEntry autoComplete="new-password" value={pw2} onChangeText={setPw2} />
        {pw.length > 0 && problem && <P muted>{problem}</P>}
        <Button label={busy ? 'Saving…' : 'Save password'} onPress={save} disabled={busy || !!problem} />
      </Card>
    </ScrollView>
  );
}
