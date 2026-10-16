/**
 * Car Line app. Parents check in when they join the afternoon car line; staff
 * on car line duty see arrivals live and confirm each pickup. Staff who are
 * also parents can switch between the two.
 */
import { useCallback, useState } from 'react';
import { ScrollView, Text, View } from 'react-native';
import { Stack, router, useFocusEffect } from 'expo-router';
import {
  carlineToday, live, myChildren, onCarlineDuty, session, subscribeCarline, type Person, type Pickup,
} from '../src/api/connect';
import { DutyView } from '../src/carline/DutyView';
import { ParentView } from '../src/carline/ParentView';
import { Button, C, Card, H, Loading, P, s } from '../src/ui';

export default function CarLine() {
  const [person, setPerson] = useState<Person | null | undefined>(undefined);
  const [kids, setKids] = useState<Person[]>([]);
  const [pickups, setPickups] = useState<Pickup[]>([]);
  const [view, setView] = useState<'duty' | 'parent' | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(() => carlineToday().then(setPickups).catch((e) => setError(e.message)), []);
  const load = useCallback(async () => {
    try {
      const p = await session();
      const ok = !!p && !p.pending;
      const [k, today] = ok ? await Promise.all([myChildren(), carlineToday()]) : [[], []];
      setPerson(p); setKids(k); setPickups(today); setError(null);
    } catch (e: any) {
      setError(e.message ?? String(e));
    }
  }, []);
  useFocusEffect(useCallback(() => { load(); return subscribeCarline(refresh); }, [load, refresh]));

  const header = <Stack.Screen options={{ title: 'Car Line' }} />;
  const box = (body: React.ReactNode) => <View style={[s.screen, s.pad]}>{header}{body}</View>;

  if (!live) return box(<Card><H>Car line needs the school server</H><P muted>This build is running on demo data without Royals Connect.</P></Card>);
  if (error) return box(<Card><H>Couldn't load the car line</H><P muted>{error}</P><Button label="Try again" onPress={load} /></Card>);
  if (person === undefined) return <>{header}<Loading /></>;
  if (!person) return box(
    <Card>
      <H>Sign in to use the car line</H>
      <P muted>Parents check in here when they join the car line, and staff on duty see who's waiting.</P>
      <Button label="Sign in" onPress={() => router.navigate('/connect')} />
    </Card>,
  );
  if (person.pending) return box(<Card><H>Waiting for approval</H><P muted>The car line opens once the school office approves your account.</P></Card>);

  const duty = onCarlineDuty(person);
  const parent = kids.length > 0;
  const shown = view ?? (duty ? 'duty' : 'parent');
  if (!duty && !parent && person.schoolRole !== 'parent') return box(
    <Card><H>For parents and car line staff</H><P muted>Parents check in here at pickup. Staff on car line duty see the line; the school office decides who's on duty.</P></Card>,
  );

  return (
    <ScrollView style={s.screen} contentContainerStyle={s.pad}>
      {header}
      {duty && parent && (
        <View style={[s.row, { alignSelf: 'center' }]}>
          {(['duty', 'parent'] as const).map((v) => (
            <Text key={v} onPress={() => setView(v)}
              style={{ paddingHorizontal: 14, paddingVertical: 7, borderRadius: 999, overflow: 'hidden', borderWidth: 1, borderColor: C.line,
                backgroundColor: shown === v ? C.primary : '#fff', color: shown === v ? '#fff' : C.ink, fontWeight: '600' }}>
              {v === 'duty' ? 'Car line duty' : 'My children'}
            </Text>
          ))}
        </View>
      )}
      {shown === 'duty' && duty
        ? <DutyView pickups={pickups} onChange={refresh} />
        : <ParentView kids={kids} pickups={pickups.filter((p) => kids.some((k) => k.id === p.studentId))} onChange={refresh} />}
    </ScrollView>
  );
}
