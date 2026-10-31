/**
 * Car Line app (like PikMyKid). Parents tap Check In from school (the
 * app checks they're within the pickup radius); all staff see the line live
 * with pickup numbers and confirm each pickup. That's the staff version, on the Main
 * Page's Staff view; staff who are also parents can switch to their children there, and
 * on Standard they see the parent version. Car line leads and the office open the settings.
 * Parents can transfer pickup to someone else for a day; the person asked answers at the top.
 */
import { useCallback, useRef, useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { Stack, router, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import {
  carlineBoard, carlineConfig, carlineToday, errorText, isFamily, live, myChildren, myPickupChildren, myVehicles, pickupNumbers, pickupTransfers,
  session, subscribeCarline, type BoardRow, type CarlineConfig, type Person, type Pickup, type PickupTransfers, type Vehicle,
} from '../src/api/connect';
import { DutyView } from '../src/carline/DutyView';
import { ParentView } from '../src/carline/ParentView';
import { TransferAsks } from '../src/carline/Transfers';
import { hoursLabel } from '../src/carline/format';
import { useStaffView } from '../src/staffView';
import { Button, C, Card, H, Loading, P, s } from '../src/ui';

const isStaff = (p: Person | null) => !!p && ['admin', 'teacher', 'staff'].includes(p.schoolRole) && !p.pending;
const NO_TRANSFERS: PickupTransfers = { children: [], asked: [] };

export default function CarLine() {
  const [person, setPerson] = useState<Person | null | undefined>(undefined);
  const [kids, setKids] = useState<Person[]>([]);
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [pickups, setPickups] = useState<Pickup[]>([]);
  const [board, setBoard] = useState<BoardRow[]>([]);
  const [numbers, setNumbers] = useState<Record<string, string>>({});
  const [config, setConfig] = useState<CarlineConfig | null>(null);
  const [transfers, setTransfers] = useState<PickupTransfers>(NO_TRANSFERS);
  // A parent (not Family, not only a pickup person) can transfer their children's pickup.
  const [parentOf, setParentOf] = useState(false);
  const [view, setView] = useState<'staff' | 'parent' | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Once the line is on screen, a failed reload keeps it there (the next change or visit tries again).
  const loaded = useRef(false);
  const numbersRef = useRef<Record<string, string>>({});
  const staffView = useStaffView(person);

  const refresh = useCallback(async () => {
    try {
      const p = await session();
      // A transfer accepted for today brings a child into the car line: their pickup number comes with them.
      const [today, b, k, t] = await Promise.all([carlineToday(), isStaff(p) ? carlineBoard() : Promise.resolve([]), myPickupChildren(),
        pickupTransfers().catch(() => NO_TRANSFERS)]);
      if (k.some((x) => !(x.id in numbersRef.current))) setNumbers(numbersRef.current = await pickupNumbers());
      setPickups(today); setBoard(b); setKids(k); setTransfers(t);
    } catch {
      // Keep what's on screen; the next change in the line loads it again.
    }
  }, []);
  const load = useCallback(async () => {
    try {
      const p = await session();
      const ok = !!p && !p.pending;
      const [k, today, b, n, c, v, t, own] = ok
        ? await Promise.all([myPickupChildren(), carlineToday(), isStaff(p) ? carlineBoard() : Promise.resolve([]), pickupNumbers(), carlineConfig(),
          myVehicles().catch(() => []), pickupTransfers().catch(() => NO_TRANSFERS), myChildren().catch(() => [])])
        : [[], [], [], {}, null, [], NO_TRANSFERS, []];
      numbersRef.current = n;
      setPerson(p); setKids(k); setVehicles(v); setPickups(today); setBoard(b); setNumbers(n); setConfig(c); setTransfers(t);
      setParentOf(!!p && !isFamily(p) && own.length > 0); setError(null);
      loaded.current = true;
    } catch (e) {
      if (!loaded.current) setError(errorText(e));
    }
  }, []);
  useFocusEffect(useCallback(() => { load(); return subscribeCarline(refresh); }, [load, refresh]));

  const header = <Stack.Screen options={{
    title: 'Car Line',
    // Car line leads who are staff get the settings in the staff version; leads who are parents always do.
    headerRight: config?.canEdit && (staffView || !isStaff(person ?? null)) ? () => (
      <Pressable onPress={() => router.push('/carline-settings')} hitSlop={8} accessibilityRole="button" accessibilityLabel="Car line settings" style={{ marginRight: 8 }}>
        <Ionicons name="settings-outline" size={22} color="#fff" />
      </Pressable>
    ) : undefined,
  }} />;
  const box = (body: React.ReactNode) => <View style={[s.screen, s.pad]}>{header}{body}</View>;

  if (!live) return box(<Card><H>Car line needs the school server</H><P muted>This build is running on demo data without Royals Connect.</P></Card>);
  if (error) return box(<Card><H>Couldn't load the car line</H><P muted>{error}</P><Button label="Try again" onPress={() => { setError(null); load(); }} /></Card>);
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
  const shown = view ?? (staffView ? 'staff' : 'parent');
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
      <TransferAsks asks={transfers.asked} onChange={refresh} />
      {staffView && parent && (
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
      {shown === 'staff' && staffView
        ? <DutyView board={board} onChange={refresh} />
        // Someone with no children of their own who was asked to pick up only needs the ask.
        : (parent || !transfers.asked.length) && (
          <ParentView kids={kids} family={isFamily(person)} vehicles={vehicles} numbers={numbers} config={config} onChange={refresh}
            transfers={transfers.children} canTransfer={parentOf}
            pickups={pickups.filter((p) => kids.some((k) => k.id === p.studentId))} />)}
    </ScrollView>
  );
}
