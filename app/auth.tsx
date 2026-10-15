/**
 * Landing page for email sign-in links. On phones the link is handled in
 * app/+native-intent.tsx before this screen shows; on the web portal the
 * tokens are in this page's URL. Either way, end up on Connect.
 */
import { useEffect, useState } from 'react';
import { Platform, View } from 'react-native';
import { router } from 'expo-router';
import { completeSignInFromUrl, session } from '../src/api/connect';
import { Button, Loading, P, s } from '../src/ui';

export default function AuthLanding() {
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    const href = Platform.OS === 'web' && typeof window !== 'undefined' ? window.location.href : null;
    completeSignInFromUrl(href)
      .then(() => session())
      .then(() => router.replace('/connect'))
      .catch((e) => setError(e.message));
  }, []);
  if (!error) return <Loading />;
  return (
    <View style={s.center}>
      <P>That sign-in link didn't work: {error}</P>
      <P muted>Links work once and expire after a few minutes. Request a new one.</P>
      <Button label="Back to sign-in" onPress={() => router.replace('/connect')} />
    </View>
  );
}
