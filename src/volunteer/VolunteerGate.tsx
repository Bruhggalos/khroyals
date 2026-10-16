/** Volunteer screens render inside this: signed in, approved, and a parent or staff member. */
import { useCallback, useEffect, useState } from 'react';
import { View } from 'react-native';
import { Stack, router } from 'expo-router';
import { canVolunteer, live, session, type Person } from '../api/connect';
import { Button, Card, H, Loading, P, s } from '../ui';

export function VolunteerGate({ title, children }: { title: string; children: (me: Person) => React.ReactNode }) {
  const [me, setMe] = useState<Person | null | undefined>();
  const [error, setError] = useState<string | null>(null);
  const load = useCallback(() => session().then((p) => { setMe(p); setError(null); }).catch((e) => setError(e.message ?? String(e))), []);
  useEffect(() => { load(); }, [load]);

  const header = <Stack.Screen options={{ title }} />;
  const box = (body: React.ReactNode) => <View style={[s.screen, s.pad]}>{header}{body}</View>;

  if (!live) return box(<Card><H>Volunteering needs the school server</H><P muted>This build is running on demo data.</P></Card>);
  if (error) return box(<Card><H>Couldn't load volunteering</H><P muted>{error}</P><Button label="Try again" onPress={load} /></Card>);
  if (me === undefined) return <>{header}<Loading /></>;
  if (!me) return box(
    <Card>
      <H>Sign in to volunteer</H>
      <P muted>See how you can help at Kingdom Heights and say yes in a tap.</P>
      <Button label="Sign in" onPress={() => router.navigate('/connect')} />
    </Card>,
  );
  if (me.pending) return box(<Card><H>Waiting for approval</H><P muted>Volunteering opens once the school office approves your account.</P></Card>);
  if (!canVolunteer(me)) return box(<Card><H>For parents and staff</H><P muted>Volunteer opportunities are for Kingdom Heights parents and staff.</P></Card>);
  return <>{header}{children(me)}</>;
}
