/**
 * Admin tools require a session verified with an authenticator app (Google
 * Authenticator, Microsoft Authenticator, Authy, 1Password…). Free, and the
 * database enforces it too. First visit links the app; later visits ask for a code.
 */
import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { Alert, Image, Linking, Platform, Text, TextInput, View } from 'react-native';
import { mfaEnroll, mfaStatus, mfaVerify, myAccess, type Access } from '../api/connect';
import { Button, C, Card, H, Loading, P, s } from '../ui';

export function MfaGate({ children }: { children: (access: Access) => ReactNode }) {
  const [access, setAccess] = useState<Access | null>(null);
  const [state, setState] = useState<'loading' | 'none' | 'needs-code' | 'ok' | 'not-admin'>('loading');
  const [factorId, setFactorId] = useState<string>();
  const [enroll, setEnroll] = useState<{ secret: string; uri: string; qr: string } | null>(null);
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);

  const check = useCallback(async () => {
    const a = await myAccess();
    setAccess(a);
    if (!a || (!a.tier && a.granted.length === 0)) return setState('not-admin');
    if (!a.mfaRequired || a.mfaVerified) return setState('ok');
    const m = await mfaStatus();
    setFactorId(m.factorId);
    setState(m.state === 'verified' ? 'ok' : m.state);
  }, []);
  useEffect(() => { check().catch((e) => Alert.alert('Admin portal', e.message)); }, [check]);

  const start = async () => {
    setBusy(true);
    try { const r = await mfaEnroll(); setFactorId(r.factorId); setEnroll(r); } catch (e: any) { Alert.alert('Authenticator', e.message); }
    setBusy(false);
  };
  const verify = async () => {
    setBusy(true);
    try { await mfaVerify(factorId!, code); setCode(''); setEnroll(null); await check(); } catch (e: any) { Alert.alert('That code didn\'t work', e.message); }
    setBusy(false);
  };

  if (state === 'loading') return <Loading />;
  if (state === 'not-admin') return <View style={s.center}><P>The admin portal is for school administrators.</P></View>;
  if (state === 'ok' && access) return <>{children(access)}</>;

  const codeBox = (
    <>
      <TextInput style={[s.input, { fontSize: 22, letterSpacing: 6, textAlign: 'center' }]} placeholder="123456" keyboardType="number-pad"
        maxLength={6} value={code} onChangeText={setCode} autoComplete="one-time-code" />
      <Button label={busy ? 'Checking…' : 'Verify'} onPress={verify} disabled={busy || code.length !== 6} />
    </>
  );

  return (
    <View style={[s.screen, s.pad]}>
      {state === 'needs-code' ? (
        <Card>
          <H>Verify it's you</H>
          <P>Enter the 6-digit code from your authenticator app for Royals Connect.</P>
          {codeBox}
        </Card>
      ) : !enroll ? (
        <Card>
          <H>Protect your admin account</H>
          <P>Admin tools need a second step: a code from a free authenticator app such as Google Authenticator, Microsoft Authenticator or Authy.</P>
          <Button label={busy ? 'Please wait…' : 'Set up authenticator app'} onPress={start} disabled={busy} />
        </Card>
      ) : (
        <Card>
          <H>Link your authenticator app</H>
          {Platform.OS === 'web'
            ? <><P>Scan this with your authenticator app:</P><Image source={{ uri: enroll.qr }} style={{ width: 200, height: 200, alignSelf: 'center' }} /></>
            : <Button kind="ghost" label="Open in authenticator app" onPress={() => Linking.openURL(enroll.uri).catch(() => Alert.alert('No authenticator app found', 'Install one, or enter the key below by hand.'))} />}
          <P muted>Or add it by hand with this key:</P>
          <Text selectable style={{ fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace', fontSize: 16, color: C.ink, textAlign: 'center' }}>
            {enroll.secret.replace(/(.{4})/g, '$1 ').trim()}
          </Text>
          <P>Then enter the 6-digit code it shows:</P>
          {codeBox}
        </Card>
      )}
    </View>
  );
}
