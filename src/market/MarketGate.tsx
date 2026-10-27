/**
 * Marketplace screens render inside this: it checks the person is signed in,
 * approved and a parent or staff member, and shows the Marketplace terms to
 * accept first (the database enforces the same).
 */
import { useCallback, useEffect, useState } from 'react';
import { ScrollView, View } from 'react-native';
import { Stack, router } from 'expo-router';
import { acceptMarketTerms, errorText, live, marketTerms, session, type MarketTerms, type Person } from '../api/connect';
import { Button, Card, H, Loading, P, s } from '../ui';

export function MarketGate({ title, children }: { title: string; children: (me: Person) => React.ReactNode }) {
  const [state, setState] = useState<{ me: Person | null; terms: MarketTerms | null } | undefined>();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const me = await session();
      setState({ me, terms: me && !me.pending ? await marketTerms() : null });
      setError(null);
    } catch (e: any) {
      setError(e.message ?? String(e));
    }
  }, []);
  useEffect(() => { load(); }, [load]);

  const header = <Stack.Screen options={{ title }} />;
  const box = (body: React.ReactNode) => <View style={[s.screen, s.pad]}>{header}{body}</View>;

  if (!live) return box(<Card><H>The Marketplace needs the school server</H><P muted>This build is running on demo data.</P></Card>);
  if (error) return box(<Card><H>Couldn't open the Marketplace</H><P muted>{error}</P><Button label="Try again" onPress={load} /></Card>);
  if (!state) return <>{header}<Loading /></>;
  const { me, terms } = state;
  if (!me) return box(
    <Card>
      <H>Sign in to use the Marketplace</H>
      <P muted>Buy and sell uniforms and school items with other Kingdom Heights families and staff.</P>
      <Button label="Sign in" onPress={() => router.navigate('/connect')} />
    </Card>,
  );
  if (me.pending) return box(<Card><H>Waiting for approval</H><P muted>The Marketplace opens once the school office approves your account.</P></Card>);
  if (!terms?.eligible) return box(<Card><H>For parents and staff</H><P muted>The Marketplace is for Kingdom Heights parents and staff.</P></Card>);
  if (!terms.accepted) return (
    <ScrollView style={s.screen} contentContainerStyle={s.pad}>
      {header}
      <Card>
        <H>Marketplace terms</H>
        <P>{terms.text}</P>
      </Card>
      <Button label="I agree" disabled={busy}
        onPress={() => { setBusy(true); acceptMarketTerms(terms.version).then(load).catch((e) => setError(errorText(e))).finally(() => setBusy(false)); }} />
      <Button kind="ghost" label="Not now" onPress={() => router.back()} />
    </ScrollView>
  );
  return <>{header}{children(me)}</>;
}
