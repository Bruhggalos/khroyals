/** Landing page for email sign-in links (khroyals://auth on phones, /auth on the web portal). */
import { useEffect, useState } from 'react';
import { View } from 'react-native';
import * as Linking from 'expo-linking';
import { router } from 'expo-router';
import { completeSignInFromUrl } from '../src/api/connect';
import { Button, Loading, P, s } from '../src/ui';

export default function AuthLanding() {
  const url = Linking.useURL();
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    const href = typeof window !== 'undefined' && window.location?.href ? window.location.href : url;
    completeSignInFromUrl(href ?? null)
      .then((done) => { if (done) router.replace('/connect'); })
      .catch((e) => setError(e.message));
  }, [url]);
  if (!error) return <Loading />;
  return (
    <View style={s.center}>
      <P>That sign-in link didn't work: {error}</P>
      <Button label="Back to sign-in" onPress={() => router.replace('/connect')} />
    </View>
  );
}
