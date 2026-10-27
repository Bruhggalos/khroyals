/**
 * Car line board for a big screen (a TV or monitor in the office or at the door, or an iPad on a
 * stand): every car that has announced today, live. Cars still waiting are on top in the order
 * they arrived, new ones marked; once staff confirm a pickup on their phones, the row greys out
 * and drops below the line. Each new car sends yellow ripples out from the shield; on a child's
 * birthday a crown hangs off their name and a fanfare plays when they're announced. Staff only
 * (carline_board). Dark, full width, no header, and it keeps the screen awake; the X goes back to
 * the car line.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Animated, Easing, Image, Platform, Pressable, ScrollView, Text, View, useWindowDimensions } from 'react-native';
import { Stack, router, useFocusEffect } from 'expo-router';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { useKeepAwake } from 'expo-keep-awake';
import {
  carlineBoard, carlineConfig, errorText, isSchoolStaff, live, session, subscribeCarline,
  type BoardRow, type CarlineConfig, type Person,
} from '../src/api/connect';
import { LONG_WAIT_MINUTES, boardOrder, boardTextSize, isNew, newArrivals, splitInitial } from '../src/carline/board';
import { Fanfare } from '../src/carline/Fanfare';
import { clock, gradeLabel, hoursLabel, minutesSince } from '../src/carline/format';
import { VehicleIcon } from '../src/carline/VehicleIcon';
import { C } from '../src/ui';

const BG = '#0A1030';
const SOFT = '#AEB6D0';       // labels on the dark background
const DONE_BG = '#262C44';    // picked up: greyed out
const DONE_INK = '#8F98B0';
const GREEN = '#22C55E';
const AMBER = '#F59E0B';
const NEW = '#FACC15';
const GOLD = '#F5B800';

type Cols = { grade: boolean; vehicle: boolean; arrived: boolean; driver: boolean };

/** Back to the car line it was opened from; opened straight from its web address, to the car line instead of the tabs. */
const exit = () => router.dismissTo('/carline');

export default function CarLineBoard() {
  useKeepAwake();
  const { width, height } = useWindowDimensions();
  const u = boardTextSize(width);
  // Narrower screens drop the less needed columns (a phone keeps number, name and minutes).
  const cols: Cols = { grade: width >= 700, vehicle: width >= 560, arrived: width >= 700, driver: width >= 1000 };
  const centered = width >= 700;  // room for the shield in the middle of the top bar
  const [person, setPerson] = useState<Person | null | undefined>(undefined);
  const [board, setBoard] = useState<BoardRow[]>([]);
  const [config, setConfig] = useState<CarlineConfig | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [stale, setStale] = useState(false);  // the last reload failed; the board stays up and says so
  const [error, setError] = useState<string | null>(null);
  const loaded = useRef(false);
  const seen = useRef<Set<string> | null>(null);  // ids on the board so far (null until the first load)
  const [ripples, setRipples] = useState(0);       // goes up whenever a new car checks in
  const [party, setParty] = useState<BoardRow[]>([]);  // birthday children announced, each getting a fanfare in turn
  const nextParty = useCallback(() => setParty((q) => q.slice(1)), []);

  /** Show the latest board, rippling the shield when a car checked in since the last look (and celebrating birthdays). */
  const take = useCallback((rows: BoardRow[]) => {
    const arrived = newArrivals(seen.current, rows);
    if (arrived.length) setRipples((n) => n + 1);
    const born = arrived.filter((r) => r.birthday);
    if (born.length) setParty((q) => [...q, ...born]);
    seen.current = new Set(rows.map((r) => r.id));
    setBoard(rows);
  }, []);
  const refresh = useCallback(async () => {
    try { take(await carlineBoard()); setStale(false); } catch { setStale(true); }
  }, [take]);
  const load = useCallback(async () => {
    try {
      const p = await session();
      setPerson(p);
      if (!isSchoolStaff(p)) return;
      const [b, c] = await Promise.all([carlineBoard(), carlineConfig()]);
      take(b); setConfig(c); setStale(false); setError(null);
      loaded.current = true;
    } catch (e) {
      if (loaded.current) setStale(true); else setError(errorText(e));
    }
  }, [take]);
  useFocusEffect(useCallback(() => {
    load();
    const unsubscribe = subscribeCarline(refresh);
    // Left on all day: reload every minute in case a live update was missed, and keep the clock and minutes current.
    const reload = setInterval(load, 60_000);
    const tick = setInterval(() => setNow(Date.now()), 15_000);
    return () => { unsubscribe(); clearInterval(reload); clearInterval(tick); };
  }, [load, refresh]));

  const screen = (body: React.ReactNode) => (
    <View style={{ flex: 1, backgroundColor: BG }}>
      <Stack.Screen options={{ title: 'Car line board', headerShown: false }} />
      {body}
    </View>
  );

  if (!live) return screen(<Message title="Car line needs the school server" text="This build is running on demo data without Royals Connect." />);
  if (error) return screen(<Message title="Couldn't load the car line" text={error} onRetry={() => { setError(null); load(); }} />);
  if (person === undefined) return screen(<View style={{ flex: 1, justifyContent: 'center' }}><ActivityIndicator color="#fff" size="large" /></View>);
  if (!isSchoolStaff(person)) return screen(<Message title="For school staff" text="Sign in with a teacher or staff account to show the car line on this screen." />);

  const { waiting, done } = boardOrder(board);
  const line = config?.line.state;
  const status = line === 'open' ? (config?.line.openedNow ? 'Open now (opened by staff)' : 'Open now')
    : line === 'early' ? `Opens at ${hoursLabel(config!.start, config!.end).split('–')[0]}` : 'Closed';

  return screen(
    <>
      {/* Title and line status, the shield in the middle, then counts, the time and the buttons. The two
          sides share the width equally so the shield sits in the center; a phone puts it on its own line. */}
      <View style={{ paddingHorizontal: u, paddingTop: u * 0.9, paddingBottom: u * 0.6, gap: u * 0.6, zIndex: 1 }}>
        {!centered && <View style={{ alignItems: 'center' }}><Shield size={u * 4.5} ripples={ripples} /></View>}
        <View style={{ flexDirection: 'row', alignItems: 'center', flexWrap: centered ? 'nowrap' : 'wrap', gap: u }}>
          <View style={{ flex: centered ? 1 : undefined, flexGrow: 1, flexShrink: 1, gap: 4 }}>
            <Text style={{ color: '#fff', fontSize: u * 1.6, fontWeight: '900' }}>Car Line</Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <View style={{ width: u * 0.55, height: u * 0.55, borderRadius: u, backgroundColor: stale ? AMBER : line === 'open' ? GREEN : SOFT }} />
              <Text style={{ color: SOFT, fontSize: u * 0.8, fontWeight: '600', flexShrink: 1 }}>
                {stale ? 'Reconnecting…' : status}{config ? `  ·  School days ${hoursLabel(config.start, config.end)}` : ''}
              </Text>
            </View>
          </View>
          {centered && <Shield size={u * 5.1} ripples={ripples} />}
          <View style={{ flex: centered ? 1 : undefined, flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', flexWrap: 'wrap', gap: u }}>
            <Count n={waiting.length} label="waiting" color="#fff" u={u} />
            <Count n={done.length} label="picked up" color={DONE_INK} u={u} />
            <Text style={{ color: '#fff', fontSize: u * 1.5, fontWeight: '800', fontVariant: ['tabular-nums'] }}>{clock(new Date(now).toISOString())}</Text>
            <View style={{ flexDirection: 'row', gap: 8 }}>
              {Platform.OS === 'web' && <FullScreenButton />}
              <BarButton icon="close" label="Close board" iconOnly onPress={exit} />
            </View>
          </View>
        </View>
      </View>

      <Header u={u} cols={cols} />
      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingHorizontal: u, paddingBottom: u * 2, gap: u * 0.4 }}>
        {waiting.length === 0 && (
          <View style={{ paddingVertical: u * 1.5, alignItems: 'center' }}>
            <Text style={{ color: SOFT, fontSize: u * 1.1, fontWeight: '600', textAlign: 'center' }}>No cars waiting. They show up here the moment a parent checks in.</Text>
          </View>
        )}
        {waiting.map((p) => <Line key={p.id} p={p} u={u} cols={cols} now={now} />)}
        {done.length > 0 && (
          <Text style={{ color: DONE_INK, fontSize: u * 0.75, fontWeight: '800', letterSpacing: 1, marginTop: u * 0.8 }}>PICKED UP TODAY ({done.length})</Text>
        )}
        {done.map((p) => <Line key={p.id} p={p} u={u} cols={cols} now={now} />)}
      </ScrollView>
      {party[0] && <Fanfare key={party[0].id} name={party[0].name} number={party[0].number} u={u} width={width} height={height} onDone={nextParty} />}
    </>,
  );
}

function Message({ title, text, onRetry }: { title: string; text: string; onRetry?: () => void }) {
  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, gap: 12 }}>
      <Text style={{ color: '#fff', fontSize: 24, fontWeight: '800', textAlign: 'center' }}>{title}</Text>
      <Text style={{ color: SOFT, fontSize: 16, textAlign: 'center', maxWidth: 520 }}>{text}</Text>
      <View style={{ flexDirection: 'row', gap: 12, marginTop: 8 }}>
        {onRetry && <BarButton label="Try again" icon="refresh" onPress={onRetry} />}
        <BarButton label="Back to Car Line" icon="arrow-back" onPress={exit} />
      </View>
    </View>
  );
}

/**
 * The Kingdom Heights shield in a white circle with a blue ring, like the Home button in the middle of
 * the tab bar. Each time `ripples` goes up, yellow rings spread out from it and fade.
 */
function Shield({ size, ripples }: { size: number; ripples: number }) {
  return (
    <View style={{ width: size, height: size }}>
      <Ripples size={size} count={ripples} />
      <View accessibilityRole="image" accessibilityLabel="Kingdom Heights" style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: '#fff',
        borderWidth: Math.max(3, size * 0.045), borderColor: C.primary, alignItems: 'center', justifyContent: 'center' }}>
        <Image source={require('../assets/icon.png')} style={{ width: size * 0.88, height: size * 0.88, borderRadius: size * 0.44 }} />
      </View>
    </View>
  );
}

const RINGS = 3;

/** Three yellow rings, one after another, growing to three times the shield and fading out (about two seconds). */
function Ripples({ size, count }: { size: number; count: number }) {
  const [rings] = useState(() => Array.from({ length: RINGS }, () => new Animated.Value(0)));
  useEffect(() => {
    if (!count) return;
    rings.forEach((r) => r.setValue(0));
    const wave = Animated.stagger(300, rings.map((r) =>
      Animated.timing(r, { toValue: 1, duration: 1600, easing: Easing.out(Easing.quad), useNativeDriver: Platform.OS !== 'web' })));
    wave.start();
    return () => wave.stop();
  }, [count, rings]);
  return (
    <View pointerEvents="none" style={{ position: 'absolute', left: 0, top: 0, width: size, height: size }}>
      {rings.map((r, i) => (
        <Animated.View key={i} style={{
          position: 'absolute', left: 0, top: 0, width: size, height: size, borderRadius: size / 2,
          borderWidth: Math.max(3, size * 0.035), borderColor: NEW, backgroundColor: 'rgba(250, 204, 21, 0.12)',
          opacity: r.interpolate({ inputRange: [0, 0.08, 1], outputRange: [0, 0.95, 0] }),
          transform: [{ scale: r.interpolate({ inputRange: [0, 1], outputRange: [1, 3] }) }],
        }} />
      ))}
    </View>
  );
}

function Count({ n, label, color, u }: { n: number; label: string; color: string; u: number }) {
  return (
    <View style={{ alignItems: 'center' }}>
      <Text style={{ color, fontSize: u * 2, fontWeight: '900', lineHeight: u * 2.2 }}>{n}</Text>
      <Text style={{ color: SOFT, fontSize: u * 0.7, fontWeight: '700', letterSpacing: 0.5 }}>{label.toUpperCase()}</Text>
    </View>
  );
}

/** Column widths, shared by the header and every row so they line up. */
const W = { student: 3, grade: 1.6, vehicle: 3, driver: 2, arrived: 1.4, wait: 1.6 };

function Header({ u, cols }: { u: number; cols: Cols }) {
  const h = (label: string, flex: number, right = false) => (
    <Text style={{ flex, minWidth: 0, color: SOFT, fontSize: u * 0.65, fontWeight: '800', letterSpacing: 1, textAlign: right ? 'right' : 'left' }} numberOfLines={1}>{label}</Text>
  );
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: u * 0.75, marginHorizontal: u, paddingHorizontal: u * 0.75, paddingBottom: u * 0.4, borderLeftWidth: u * 0.3, borderColor: 'transparent' }}>
      <Text style={{ width: u * 4.2, color: SOFT, fontSize: u * 0.65, fontWeight: '800', letterSpacing: 1, textAlign: 'center' }}>PICKUP #</Text>
      {h('STUDENT', W.student)}
      {cols.grade && h('GRADE', W.grade)}
      {cols.vehicle && h('VEHICLE', W.vehicle)}
      {cols.driver && h('DRIVER', W.driver)}
      {cols.arrived && h('ARRIVED', W.arrived)}
      {h('WAITING', W.wait, true)}
    </View>
  );
}

/** One child: white while waiting (yellow edge and New for the first minute); grey once picked up. */
function Line({ p, u, cols, now }: { p: BoardRow; u: number; cols: Cols; now: number }) {
  const done = p.status === 'picked_up';
  const fresh = !done && isNew(p.arrivedAt, now);
  const mins = minutesSince(p.arrivedAt, now);
  const ink = done ? DONE_INK : C.ink;
  const sub = done ? DONE_INK : C.muted;
  const said = done
    ? `${p.name}, picked up${p.pickedUpAt ? ` at ${clock(p.pickedUpAt)}` : ''}`
    : `Pickup number ${p.number ?? 'none'}, ${p.name}${p.birthday ? ' (birthday today)' : ''}${p.vehicle ? `, ${p.vehicle}` : ''}, waiting ${mins} minutes`;
  return (
    <View accessible accessibilityLabel={said}
      style={{ flexDirection: 'row', alignItems: 'center', gap: u * 0.75, backgroundColor: done ? DONE_BG : '#fff', borderRadius: u * 0.5,
        paddingVertical: u * (done ? 0.35 : 0.5), paddingHorizontal: u * 0.75, borderLeftWidth: u * 0.3, borderLeftColor: fresh ? NEW : done ? DONE_BG : '#fff' }}>
      <View style={{ width: u * 4.2, alignItems: 'center', borderRadius: u * 0.4, paddingVertical: u * 0.15, backgroundColor: done ? '#3A4160' : C.primary }}>
        <Text style={{ color: done ? DONE_INK : '#fff', fontSize: u * (done ? 1.2 : 1.7), fontWeight: '900' }}>{p.number ?? '—'}</Text>
      </View>
      <View style={{ flex: W.student, minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <Name name={p.name} birthday={!!p.birthday} size={u * 1.2} color={ink} faded={done} />
        {fresh && (
          <Text style={{ backgroundColor: NEW, color: '#3D2E00', fontSize: u * 0.6, fontWeight: '900', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4, overflow: 'hidden' }}>NEW</Text>
        )}
      </View>
      {cols.grade && <Text style={{ flex: W.grade, minWidth: 0, color: sub, fontSize: u, fontWeight: '600' }} numberOfLines={1}>{gradeLabel(p.grade)}</Text>}
      {cols.vehicle && (
        <View style={{ flex: W.vehicle, minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: 8, opacity: done ? 0.5 : 1 }}>
          {p.vehicle ? (
            <>
              <VehicleIcon kind={p.vehicleKind} color={p.vehicleColor} size={u * 1.6} />
              <Text style={{ color: ink, fontSize: u, fontWeight: '700', flexShrink: 1 }}>{p.vehicle}</Text>
            </>
          ) : <Text style={{ color: sub, fontSize: u }}>—</Text>}
        </View>
      )}
      {cols.driver && <Text style={{ flex: W.driver, minWidth: 0, color: ink, fontSize: u }} numberOfLines={1}>{p.parent}</Text>}
      {cols.arrived && (
        <Text style={{ flex: W.arrived, minWidth: 0, color: sub, fontSize: u, fontVariant: ['tabular-nums'] }}>
          {clock(p.arrivedAt)}{p.via === 'arrival' ? <Text style={{ fontSize: u * 0.7 }}> auto</Text> : null}
        </Text>
      )}
      <View style={{ flex: W.wait, minWidth: 0, alignItems: 'flex-end' }}>
        {done ? (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <Ionicons name="checkmark-circle" size={u * 1.1} color={DONE_INK} />
            <Text style={{ color: DONE_INK, fontSize: u * 0.85, fontWeight: '700', fontVariant: ['tabular-nums'] }}>
              {p.pickedUpAt ? clock(p.pickedUpAt) : 'Picked up'}
            </Text>
          </View>
        ) : (
          <Text style={{ color: mins >= LONG_WAIT_MINUTES ? '#B45309' : C.ink, fontSize: u * 1.3, fontWeight: '900', fontVariant: ['tabular-nums'] }} numberOfLines={1}>
            {mins < 1 ? 'Now' : `${mins} min`}
          </Text>
        )}
      </View>
    </View>
  );
}

/** A child's name; on their birthday a gold crown hangs at an angle off the first letter. */
function Name({ name, birthday, size, color, faded }: { name: string; birthday: boolean; size: number; color: string; faded: boolean }) {
  const style = { color, fontSize: size, fontWeight: '800' as const };
  if (!birthday) return <Text style={[style, { flexShrink: 1 }]}>{name}</Text>;
  const [first, rest] = splitInitial(name);
  return (
    <View style={{ flexDirection: 'row', flexShrink: 1 }}>
      <View>
        <Text style={style}>{first}</Text>
        <MaterialCommunityIcons name="crown" size={size} color={GOLD}
          style={{ position: 'absolute', top: -size * 0.6, left: -size * 0.4, opacity: faded ? 0.6 : 1, transform: [{ rotate: '-30deg' }],
            textShadowColor: 'rgba(0, 0, 0, 0.25)', textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 2 }} />
      </View>
      <Text style={[style, { flexShrink: 1 }]}>{rest}</Text>
    </View>
  );
}

function BarButton({ label, icon, onPress, iconOnly }: { label: string; icon: keyof typeof Ionicons.glyphMap; onPress: () => void; iconOnly?: boolean }) {
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={label} hitSlop={8}
      style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: iconOnly ? 10 : 16, paddingVertical: 10,
        borderRadius: 999, borderWidth: 1, borderColor: '#3A4160', backgroundColor: pressed ? '#1E2650' : 'transparent' })}>
      <Ionicons name={icon} size={20} color="#fff" />
      {!iconOnly && <Text style={{ color: '#fff', fontWeight: '700' }}>{label}</Text>}
    </Pressable>
  );
}

/** Web only: fill the whole monitor or TV (Esc leaves). */
function FullScreenButton() {
  const [full, setFull] = useState(false);
  useEffect(() => {
    const on = () => setFull(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', on);
    return () => document.removeEventListener('fullscreenchange', on);
  }, []);
  if (!document.fullscreenEnabled) return null;
  return (
    <BarButton icon={full ? 'contract' : 'expand'} label={full ? 'Leave full screen' : 'Full screen'} iconOnly
      onPress={() => { (full ? document.exitFullscreen() : document.documentElement.requestFullscreen()).catch(() => {}); }} />
  );
}
