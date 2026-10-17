/** Ask the School screens render inside this: signed in with an approved account. */
import { useEffect, useState } from 'react';
import { View } from 'react-native';
import { Stack, router } from 'expo-router';
import { live, session, type Person } from '../api/connect';
import { Button, Card, H, Loading, P, s } from '../ui';

export function QuestionsGate({ title, children }: { title: string; children: (me: Person) => React.ReactNode }) {
  const [me, setMe] = useState<Person | null | undefined>();
  useEffect(() => { session().then(setMe).catch(() => setMe(null)); }, []);

  const header = <Stack.Screen options={{ title }} />;
  const box = (body: React.ReactNode) => <View style={[s.screen, s.pad]}>{header}{body}</View>;
  if (!live) return box(<Card><H>Ask the School needs the school server</H><P muted>This build is running on demo data.</P></Card>);
  if (me === undefined) return <>{header}<Loading /></>;
  if (!me) return box(
    <Card>
      <H>Sign in to ask the school</H>
      <P muted>Send a question, and come back here for the answer.</P>
      <Button label="Sign in" onPress={() => router.navigate('/connect')} />
    </Card>,
  );
  if (me.pending) return box(<Card><H>Waiting for approval</H><P muted>You can ask the school once the office approves your account.</P></Card>);
  return <>{header}{children(me)}</>;
}
