/**
 * Continue with Apple / Continue with Google, above the email sign-in, for the providers the school
 * has switched on (ssoProviders): Apple on iPhones (Apple's own button, as it requires), Google
 * everywhere. Nothing shows until one is on, so the email code stays the only way in until then.
 */
import { useEffect, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import * as AppleAuthentication from 'expo-apple-authentication';
import { Ionicons } from '@expo/vector-icons';
import { errorText, signInWithApple, signInWithGoogle, ssoProviders } from '../api/connect';
import { C, P } from '../ui';

export function SsoButtons({ creating, onDone, onError }: { creating: boolean; onDone: () => void; onError: (message: string | null) => void }) {
  const [providers, setProviders] = useState({ google: false, apple: false });
  const [busy, setBusy] = useState(false);
  useEffect(() => { ssoProviders().then(setProviders); }, []);
  if (!providers.google && !providers.apple) return null;

  const go = async (signIn: () => Promise<boolean>) => {
    setBusy(true); onError(null);
    try { if (await signIn()) onDone(); } catch (e) { onError(errorText(e)); } finally { setBusy(false); }
  };
  return (
    <View style={{ gap: 10 }}>
      {providers.apple && (
        <>
          <AppleAuthentication.AppleAuthenticationButton
            buttonType={creating ? AppleAuthentication.AppleAuthenticationButtonType.SIGN_UP : AppleAuthentication.AppleAuthenticationButtonType.CONTINUE}
            buttonStyle={AppleAuthentication.AppleAuthenticationButtonStyle.BLACK} cornerRadius={12}
            style={{ height: 48, opacity: busy ? 0.6 : 1 }} onPress={() => { if (!busy) go(signInWithApple); }} />
          <P muted>Already have an account? When Apple asks, choose Share My Email so we can find it.</P>
        </>
      )}
      {providers.google && (
        <Pressable disabled={busy} onPress={() => go(signInWithGoogle)} accessibilityRole="button" accessibilityLabel="Continue with Google"
          style={({ pressed }) => ({ height: 48, borderRadius: 12, borderWidth: 1, borderColor: '#747775', backgroundColor: '#fff',
            flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, opacity: pressed || busy ? 0.7 : 1 })}>
          <Ionicons name="logo-google" size={18} color="#1F1F1F" />
          <Text style={{ fontSize: 16, fontWeight: '600', color: '#1F1F1F' }}>Continue with Google</Text>
        </Pressable>
      )}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <View style={{ flex: 1, height: 1, backgroundColor: C.line }} />
        <Text style={{ color: C.muted, fontSize: 13 }}>or use your email</Text>
        <View style={{ flex: 1, height: 1, backgroundColor: C.line }} />
      </View>
    </View>
  );
}
