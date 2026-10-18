/**
 * Car Line app (like PikMyKid). Parents announce "I'm here" from school (the
 * app checks they're within the pickup radius); all staff see the line live
 * with pickup numbers and confirm each pickup. Staff who are also parents can
 * switch between the two. Car line leads and the office open the settings.
 */
import { useCallback, useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { Stack, router, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import {
  carlineBoard, carlineConfig, carlineToday, live, myChildren, pickupNumbers, session, subscribeCarline,
  type BoardRow, type CarlineConfig, type Person, type Pickup,
} from '../src/api/connect';
import { DutyView } from '../src/carline/DutyView';
import { ParentView } from '../src/carline/ParentView';
import { hoursLabel } from '../src/carline/format';
import { Button, C, Card, H, Loading, P, s } from '../src/ui';

const isStaff = (p: Person | null) => !!p && ['admin', 'teacher', 'staff'].includes(p.schoolRole) && !p.pending;

export default function CarLine() {
  const [person, setPerson] = useState<Person | null | undefined>(undefined);
  const [kids, setKids] = useState<Person[]>([]);
  const [pickups, setPickups] = useState<Pickup[]>([]);
  const [board, setBoard] = useState<BoardRow[]>([]);
  const [numbers, setNumbers] = useState<Record<string, string>>({});
  const [config, setConfig] = useState<CarlineConfig | null>(null);
  const [view, setView] = useState<'staff' | 'parent' | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const p = await session();
      const [today, b] = await Promise.all([carlineToday(), isStaff(p) ? carlineBoard() : Promise.resolve([])]);
      setPickups(today); setBoard(b);
    } catch (e: any) { setError(e.message); }
  }, []);
  const load = useCallback(async () => {
    try {
      const p = await session();
      const ok = !!p && !p.pending;
      const [k, today, b, n, c] = ok
        ? await Promise.all([myChildren(), carlineToday(), isStaff(p) ? carlineBoard() : Promise.resolve([]), pickupNumbers(), carlineConfig()])
        : [[], [], [], {}, null];
      setPerson(p); setKids(k); setPickups(today); setBoard(b); setNumbers(n); setConfig(c); setError(null);
    } catch (e: any) {
      setError(e.message ?? String(e));
    }
  }, []);
  useFocusEffect(useCallback(() => { load(); return subscribeCarline(refresh); }, [load, refresh]));

  const header = <Stack.Screen options={{
    title: 'Car Line',
    headerRight: config?.canEdit ? () => (
      <Pressable onPress={() => router.push('/carline-settings')} hitSlop={8} accessibilityRole="button" accessibilityLabel="Car line settings" style={{ marginRight: 8 }}>
        <Ionicons name="settings-outline" size={22} color="#fff" />
      </Pressable>
    ) : undefined,
  }} />;
  const box = (body: React.ReactNode) => <View style={[s.screen, s.pad]}>{header}{body}</View>;

  if (!live) return box(<Card><H>Car line needs the school server</H><P muted>This build is running on demo data without Royals Connect.</P></Card>);
  if (error) return box(<Card><H>Couldn't load the car line</H><P muted>{error}</P><Button label="Try again" onPress={load} /></Card>);
  if (person === undefined) return <>{header}<Loading /></>;
  if (!person) return box(
    <Card>
      <H>Sign in to use the car line</H>
      <P muted>Parents announce here when they arrive for pickup, and staff see who's waiting.</P>
      <Button label="Sign in" onPress={() => router.navigate('/connect')} />
    </Card>,
  );
  if (person.pending) return box(<Card><H>Waiting for approval</H><P muted>The car line opens once the school office approves your account.</P></Card>);

  const staff = isStaff(person);
  const parent = kids.length > 0;
  const shown = view ?? (staff ? 'staff' : 'parent');
  if (!staff && !parent && person.schoolRole === 'student') return box(
    <Card><H>For parents and staff</H><P muted>Parents announce pickup here, and school staff see the car line.</P></Card>,
  );
  const line = config?.line.state;

  return (
    <ScrollView style={s.screen} contentContainerStyle={s.pad}>
      {header}
      {config && (
        <View style={[s.row, { gap: 8 }]}>
          <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: line === 'open' ? '#15803D' : line === 'early' ? '#B45309' : C.muted }} />
          <Text style={{ color: C.ink, fontWeight: '600' }}>
            {line === 'open' ? (config.line.openedNow ? 'Open now (opened by staff)' : 'Open now')
              : line === 'early' ? `Opens at ${hoursLabel(config.start, config.end).split('–')[0]}` : 'Closed'}
            <Text style={{ color: C.muted, fontWeight: '400' }}>  ·  School days {hoursLabel(config.start, config.end)}</Text>
          </Text>
        </View>
      )}
      {staff && parent && (
        <View style={[s.row, { alignSelf: 'center' }]}>
          {(['staff', 'parent'] as const).map((v) => (
            <Text key={v} onPress={() => setView(v)}
              style={{ paddingHorizontal: 14, paddingVertical: 7, borderRadius: 999, overflow: 'hidden', borderWidth: 1, borderColor: C.line,
                backgroundColor: shown === v ? C.primary : '#fff', color: shown === v ? '#fff' : C.ink, fontWeight: '600' }}>
              {v === 'staff' ? 'Car line' : 'My children'}
            </Text>
          ))}
        </View>
      )}
      {shown === 'staff' && staff
        ? <DutyView board={board} onChange={refresh} />
        : <ParentView kids={kids} numbers={numbers} config={config} onChange={refresh}
            pickups={pickups.filter((p) => kids.some((k) => k.id === p.studentId))} />}
    </ScrollView>
  );
}
