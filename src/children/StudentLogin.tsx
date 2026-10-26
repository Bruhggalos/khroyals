/**
 * A child's own login, on their card (parents) and in Admin → Students (the office). Children
 * start without one; when the family decides they're ready, add the email they'll use and they get
 * an email telling them how to sign in. The login can be taken away again; the child stays listed.
 */
import { useCallback, useEffect, useState } from 'react';
import { Alert, Platform, Text, View } from 'react-native';
import { errorText, giveStudentLogin, removeStudentLogin, studentLoginStatus, type StudentLogin as Login } from '../api/connect';
import { Button, C, Field, P, s } from '../ui';

const when = (iso: string) => new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
const confirm = (title: string, msg: string, onYes: () => void) => {
  if (Platform.OS === 'web') { if (globalThis.confirm?.(`${title}\n\n${msg}`)) onYes(); return; }
  Alert.alert(title, msg, [{ text: 'Cancel', style: 'cancel' }, { text: 'Turn off', style: 'destructive', onPress: onYes }]);
};

export function StudentLogin({ studentId, childName, onChange }: { studentId: string; childName: string; onChange?: () => void }) {
  const [login, setLogin] = useState<Login | null | undefined>(undefined);
  const [adding, setAdding] = useState(false);
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const load = useCallback(() => { studentLoginStatus(studentId).then(setLogin).catch(() => setLogin(null)); }, [studentId]);
  useEffect(load, [load]);
  if (login === undefined) return null;

  const give = async () => {
    setBusy(true);
    try {
      await giveStudentLogin(studentId, email);
      setAdding(false); setEmail('');
      Alert.alert('Login ready', `${childName} can now sign in with ${email.trim()}. We emailed them how.`);
      load(); onChange?.();
    } catch (e) { Alert.alert('Not set up', errorText(e)); }
    setBusy(false);
  };
  const remove = () => confirm(`Turn off ${childName}'s login?`, `${childName} won't be able to sign in. They stay on the class lists, with you as their parent.`,
    () => removeStudentLogin(studentId).then(() => { load(); onChange?.(); }).catch((e) => Alert.alert('Not changed', errorText(e))));

  return (
    <View style={{ gap: 6, borderTopWidth: 1, borderTopColor: C.line, paddingTop: 10 }}>
      <Text style={{ fontWeight: '700', color: C.ink }}>🔑 {childName}'s own login</Text>
      {login?.hasLogin ? (
        <>
          <P muted>Signs in with {login.email}. {login.signedInAt ? `Last signed in ${when(login.signedInAt)}.` : 'Hasn\'t signed in yet.'}</P>
          <View style={[s.row, { gap: 18 }]}>
            <Text style={{ color: C.danger, fontWeight: '600' }} accessibilityRole="button" onPress={remove}>Turn off login</Text>
          </View>
        </>
      ) : adding ? (
        <>
          <Field label={`${childName}'s email`} placeholder="name@example.com" keyboardType="email-address" autoCapitalize="none"
            autoCorrect={false} autoComplete="off" value={email} onChangeText={setEmail} />
          <Button label={busy ? 'Setting up…' : 'Give login and email them'} onPress={give} disabled={busy || !email.trim()} />
          <Text style={{ color: C.muted, textAlign: 'center' }} onPress={() => setAdding(false)}>Cancel</Text>
        </>
      ) : (
        <>
          <P muted>{childName} uses the app through you for now. When they're ready, add the email they'll sign in with; they'll see their own classes, assignments and activities.</P>
          <Text style={{ color: C.primary, fontWeight: '700' }} accessibilityRole="button" onPress={() => setAdding(true)}>Give {childName} a login</Text>
        </>
      )}
    </View>
  );
}
