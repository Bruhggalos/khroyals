/** Forms screens render inside this: signed in, approved, and a parent or a member of staff (never Family or students). */
import { useCallback, useEffect, useState } from 'react';
import { View } from 'react-native';
import { Stack, router } from 'expo-router';
import { errorText, isFamily, isSchoolStaff, live, session, type Person } from '../api/connect';
import { Button, Card, H, Loading, P, s } from '../ui';

/** Parents sign forms; faculty and staff send them (and sign for their own children). */
export const usesForms = (p: Person | null | undefined) => !!p && !p.pending && !isFamily(p) && (p.schoolRole === 'parent' || isSchoolStaff(p));

export function FormsGate({ title, children }: { title: string; children: (me: Person) => React.ReactNode }) {
  const [me, setMe] = useState<Person | null | undefined>();
  const [error, setError] = useState<string | null>(null);
  const load = useCallback(() => session().then((p) => { setMe(p); setError(null); }).catch((e) => setError(errorText(e))), []);
  useEffect(() => { load(); }, [load]);

  const header = <Stack.Screen options={{ title }} />;
  const box = (body: React.ReactNode) => <View style={[s.screen, s.pad]}>{header}{body}</View>;

  if (!live) return box(<Card><H>Forms need the school server</H><P muted>This build is running on demo data.</P></Card>);
  if (error) return box(<Card><H>Couldn’t load forms</H><P muted>{error}</P><Button label="Try again" onPress={load} /></Card>);
  if (me === undefined) return <>{header}<Loading /></>;
  if (!me) return box(
    <Card>
      <H>Sign in to see forms</H>
      <P muted>Permission slips, releases and acknowledgments from the school, signed in a tap.</P>
      <Button label="Sign in" onPress={() => router.navigate('/connect')} />
    </Card>,
  );
  if (me.pending) return box(<Card><H>Waiting for approval</H><P muted>Forms open once the school office approves your account.</P></Card>);
  if (!usesForms(me)) return box(<Card><H>For parents and staff</H><P muted>Forms go to the parents of Kingdom Heights students.</P></Card>);
  return <>{header}{children(me)}</>;
}
