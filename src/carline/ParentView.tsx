/**
 * Parent side of the car line: each child's pickup number, then Check In once you're at
 * school. The app sends your location and the school checks you're within the pickup
 * radius. The traffic flow card says which line to follow (blue for K2–K4, red for K–12th)
 * and opens the map. The button never hides: it's greyed out outside pickup hours and turns
 * green ("Checked In!") once you're in line (src/carline/checkInButton.ts). Under it, the
 * vehicle you're using today, a tap away from switching or adding one, and Transfer pickup
 * (src/carline/Transfers.tsx): a child handed to someone else today is theirs to check in.
 */
import { useEffect, useRef, useState } from 'react';
import { Alert, Animated, Linking, Modal, Platform, Pressable, ScrollView, Text, View } from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import {
  carlineAnnounce, carlineCancel, chooseVehicle, errorText, me, type CarlineConfig, type Person, type Pickup, type PickupTransfer, type Vehicle,
} from '../api/connect';
import { schoolToday } from '../calendar/past';
import { C, Card, H, P, s, useBottomInset } from '../ui';
import { VehicleIcon } from './VehicleIcon';
import { vehicleLabel } from './vehicles';
import { AutoCheckInCard } from './AutoCheckInCard';
import { checkInButton } from './checkInButton';
import { TrafficFlow } from './TrafficFlow';
import { TransferPickup, cancelTransfer } from './Transfers';
import { clock, gradeLabel, hoursLabel } from './format';
import { LocationError, currentSpot, distanceLabel } from './location';

const VEHICLE_BOX = { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12, borderRadius: 14, borderWidth: 1,
  borderColor: C.line, backgroundColor: '#fff' } as const;

/**
 * Today's vehicle, under Check In: tap it to switch to another of yours (it becomes your default, and
 * if you're already in line staff see the new one, `vehicle_use`) or to add one.
 */
function VehicleButton({ vehicles, value, inLine, onChoose }: {
  vehicles: Vehicle[]; value: Vehicle | null; inLine: boolean; onChoose: (v: Vehicle) => void;
}) {
  const [open, setOpen] = useState(false);
  const bottom = useBottomInset();
  if (!value) return (
    <Pressable onPress={() => router.push('/vehicle')} accessibilityRole="button" accessibilityLabel="Add your vehicle"
      style={({ pressed }) => [VEHICLE_BOX, pressed && { opacity: 0.7 }]}>
      <VehicleIcon kind="car" color="silver" />
      <View style={{ flex: 1 }}>
        <Text style={{ fontWeight: '700', color: C.ink }}>Add your vehicle</Text>
        <P muted>Staff see it on the car line board, so they can spot you.</P>
      </View>
      <Ionicons name="add-circle" size={26} color={C.primary} />
    </Pressable>
  );
  const add = () => { setOpen(false); router.push('/vehicle'); };
  return (
    <>
      <Pressable onPress={() => setOpen(true)} accessibilityRole="button" accessibilityLabel={`Today's vehicle: ${vehicleLabel(value)}. Change`}
        style={({ pressed }) => [VEHICLE_BOX, pressed && { opacity: 0.7 }]}>
        <VehicleIcon kind={value.kind} color={value.color} />
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: 12, fontWeight: '700', color: C.muted }}>TODAY'S VEHICLE</Text>
          <Text style={{ fontSize: 17, fontWeight: '700', color: C.ink }}>{vehicleLabel(value)}</Text>
        </View>
        <Text style={{ color: C.primary, fontWeight: '700' }}>Change</Text>
        <Ionicons name="chevron-forward" size={18} color={C.primary} />
      </Pressable>
      <Modal visible={open} transparent animationType="slide" onRequestClose={() => setOpen(false)}>
        <Pressable style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.35)' }} onPress={() => setOpen(false)} accessibilityLabel="Close" />
        <View style={[s.sheet, { backgroundColor: '#fff', borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 20,
          paddingBottom: 20 + Math.max(bottom, 16), gap: 14 }]}>
          <View style={{ gap: 2 }}>
            <Text style={{ fontSize: 20, fontWeight: '800', color: C.ink }}>Which vehicle today?</Text>
            <P muted>{inLine ? "Staff see the change on the board right away. You keep your place in line." : 'Staff look for it on the car line board.'}</P>
          </View>
          <ScrollView style={{ maxHeight: 320 }} contentContainerStyle={{ gap: 8 }}>
            {vehicles.map((v) => {
              const on = v.id === value.id;
              return (
                <Pressable key={v.id} onPress={() => { setOpen(false); if (!on) onChoose(v); }} accessibilityRole="button"
                  accessibilityState={{ selected: on }} accessibilityLabel={vehicleLabel(v)}
                  style={({ pressed }) => [s.row, { gap: 12, padding: 10, borderRadius: 12, borderWidth: on ? 2 : 1,
                    borderColor: on ? C.primary : C.line }, pressed && { opacity: 0.7 }]}>
                  <VehicleIcon kind={v.kind} color={v.color} size={34} />
                  <Text style={{ flex: 1, fontSize: 16, color: C.ink, fontWeight: on ? '700' : '500' }}>{vehicleLabel(v)}</Text>
                  {on && <Ionicons name="checkmark-circle" size={24} color={C.primary} />}
                </Pressable>
              );
            })}
          </ScrollView>
          <Pressable onPress={add} accessibilityRole="button" style={({ pressed }) => [s.row, { gap: 8, paddingVertical: 4 }, pressed && { opacity: 0.6 }]}>
            <Ionicons name="add-circle-outline" size={22} color={C.primary} />
            <Text style={{ color: C.primary, fontWeight: '700', fontSize: 16 }}>Add a vehicle</Text>
          </Pressable>
        </View>
      </Modal>
    </>
  );
}

export function ParentView({ kids, family, vehicles, pickups, numbers, config, transfers, canTransfer, onChange }: {
  /** `family`: a Family account, whose children only the school office links. */
  kids: Person[]; family?: boolean; vehicles: Vehicle[]; pickups: Pickup[]; numbers: Record<string, string>;
  config: CarlineConfig | null;
  /** Pickup transfers of your children; `canTransfer`: you're a parent, so you can hand pickup to someone. */
  transfers: PickupTransfer[]; canTransfer: boolean; onChange: () => void;
}) {
  // The first vehicle is the default (the last one used). Picking another saves it as the default
  // too, so a fresh list (back from adding one) has it first again: the pick only bridges the wait.
  const [vehicleId, setVehicleId] = useState<string | null>(null);
  useEffect(() => { setVehicleId(null); }, [vehicles]);
  const vehicle = vehicles.find((v) => v.id === vehicleId) ?? vehicles[0] ?? null;
  const chooseToday = (v: Vehicle) => {
    const was = vehicleId;
    setVehicleId(v.id);
    chooseVehicle(v.id).then(onChange).catch((e) => { setVehicleId(was); Alert.alert('Vehicle', errorText(e)); });
  };
  const [skip, setSkip] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  // Each child's latest check-in today (cancelled ones don't count).
  const status = (id: string) => [...pickups].reverse().find((p) => p.studentId === id && p.status !== 'cancelled');
  // Each child's latest pickup transfer today. Once someone else accepts, the child is theirs to check in.
  const today = schoolToday();
  const myId = me()?.id;
  const transferOf = (id: string) => [...transfers].reverse().find((t) => t.studentId === id && t.day === today && t.toId !== myId);
  const handedAway = (id: string) => transferOf(id)?.status === 'accepted';
  const ready = kids.filter((k) => !status(k.id) && !handedAway(k.id));
  const handedOff = kids.filter((k) => !status(k.id) && handedAway(k.id)).length;
  const chosen = ready.filter((k) => !skip.has(k.id));
  const waiting = kids.filter((k) => status(k.id)?.status === 'waiting');
  const closed = config?.line.state === 'closed';
  const button = checkInButton(config?.line, waiting.length, ready.length, handedOff);
  const canCheckIn = button.kind === 'ready';

  // A little pop when the button turns into "Checked In!".
  const pop = useRef(new Animated.Value(1)).current;
  const checkedIn = button.kind === 'checked-in';
  useEffect(() => {
    if (!checkedIn) return;
    pop.setValue(0.88);
    Animated.spring(pop, { toValue: 1, friction: 4, tension: 160, useNativeDriver: Platform.OS !== 'web' }).start();
  }, [checkedIn, pop]);

  const toggle = (id: string) => setSkip((cur) => { const n = new Set(cur); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const announce = async () => {
    setBusy(true); setProblem(null);
    try {
      const at = await currentSpot();
      await carlineAnnounce(chosen.map((k) => k.id), at, vehicle?.id);
      onChange();
    } catch (e: any) {
      setProblem(e.message);
      if (e instanceof LocationError && Platform.OS !== 'web') {
        Alert.alert('Location needed', e.message, [{ text: 'Not now', style: 'cancel' }, { text: 'Open settings', onPress: () => Linking.openSettings() }]);
      }
    } finally { setBusy(false); }
  };

  if (kids.length === 0) return (
    <Card><H>No children linked yet</H><P muted>{family
      ? 'Ask the school office to link the children you pick up.'
      : 'Add your children under My profile → My children, or ask the school office to link them.'}</P></Card>
  );

  return (
    <View style={{ gap: 12 }}>
      <Card>
        <H>{waiting.length ? "You're in the car line" : closed ? 'The car line is closed' : button.kind === 'transferred' ? 'Pickup transferred' : 'Picking up?'}</H>
        <P muted>{waiting.length
          ? 'Staff can see you and your pickup numbers. Pull forward when you\'re waved up.'
          : closed
            ? `It's open on school days${config ? `, ${hoursLabel(config.start, config.end)}` : ''}.`
            : button.kind === 'transferred'
              ? 'Someone else is checking your children in today. Cancel the transfer below to pick up yourself.'
              : `When you get to school${config ? ` (within ${distanceLabel(config.radius)} of the pickup spot)` : ''}, choose who you're picking up and tap Check In. Staff see it right away.`}</P>
      </Card>

      <TrafficFlow grades={kids.map((k) => k.grade)} />

      {kids.map((k) => {
        const p = status(k.id);
        const t = p ? undefined : transferOf(k.id);
        const away = t?.status === 'accepted';
        const selectable = !p && !away;
        const on = selectable && !skip.has(k.id);
        return (
          <Card key={k.id} onPress={selectable ? () => toggle(k.id) : undefined} style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
            {p ? <Ionicons name={p.status === 'picked_up' ? 'checkmark-done-circle' : 'car'} size={28} color={p.status === 'picked_up' ? '#15803D' : C.accent} />
              : away ? <Ionicons name="swap-horizontal" size={28} color={C.muted} />
              : <Ionicons name={on ? 'checkmark-circle' : 'ellipse-outline'} size={28} color={on ? C.primary : C.muted} />}
            <View style={{ flex: 1, gap: 2 }}>
              <Text style={{ fontSize: 17, fontWeight: '700', color: C.ink }}>{k.firstName} {k.lastName}</Text>
              <P muted>
                {[gradeLabel(k.grade),
                  p?.status === 'waiting' && `In line since ${clock(p.arrivedAt)}${p.via === 'arrival' ? ' (automatic)' : ''}`,
                  p?.status === 'waiting' && p.vehicle?.label,
                  p?.status === 'picked_up' && p.pickedUpAt && `Picked up at ${clock(p.pickedUpAt)}`].filter(Boolean).join(' · ')}
              </P>
              {p?.status === 'waiting' && (
                <Text style={{ color: C.danger, fontWeight: '600' }} onPress={() => carlineCancel(p.id).then(onChange).catch((e) => Alert.alert('Car line', e.message))}>
                  Cancel
                </Text>
              )}
              {t && (
                <Text style={{ color: t.status === 'declined' ? C.muted : C.ink, fontWeight: '600' }}>
                  {t.status === 'accepted' ? `${t.to} is picking up today` : t.status === 'pending' ? `Waiting for ${t.to} to accept` : `${t.to} can't pick up today`}
                  {t.status !== 'declined' && (
                    <Text style={{ color: C.danger }} accessibilityRole="button"
                      onPress={(e) => { e.stopPropagation?.(); cancelTransfer(t, false, onChange); }}>{'   Cancel transfer'}</Text>
                  )}
                </Text>
              )}
            </View>
            <View style={{ alignItems: 'center', minWidth: 64, paddingVertical: 6, paddingHorizontal: 8, borderRadius: 10, backgroundColor: C.primary }}
              accessibilityLabel={`Pickup number ${numbers[k.id] ?? 'not set'}`}>
              <Text style={{ color: '#fff', fontSize: 10, fontWeight: '700' }}>PICKUP #</Text>
              <Text style={{ color: '#fff', fontSize: 22, fontWeight: '800' }}>{numbers[k.id] ?? '—'}</Text>
            </View>
          </Card>
        );
      })}

      <CheckInPressable button={button} busy={busy} none={chosen.length === 0} pop={pop} onPress={announce} />
      {problem && <Text style={{ color: C.danger, fontWeight: '600' }}>{problem}</Text>}
      {canCheckIn && chosen.length === 0 && <P muted>Choose at least one child.</P>}
      <VehicleButton vehicles={vehicles} value={vehicle} onChoose={chooseToday}
        inLine={pickups.some((p) => p.status === 'waiting' && p.guardianId === myId)} />
      {canTransfer && <TransferPickup transfers={transfers} onChange={onChange} />}
      <AutoCheckInCard />
    </View>
  );
}

const GREEN = '#15803D';
const GREY = '#DDE2EB';

/** The check-in button in each of its looks (see src/carline/checkInButton.ts). */
function CheckInPressable({ button, busy, none, pop, onPress }: {
  button: ReturnType<typeof checkInButton>; busy: boolean; none: boolean; pop: Animated.Value; onPress: () => void;
}) {
  const look = {
    ready: { label: busy ? 'Checking your location…' : 'Check In', icon: 'car', bg: C.primary, fg: '#fff' },
    'checked-in': { label: 'Checked In!', icon: 'checkmark-circle', bg: GREEN, fg: '#fff' },
    outside: { label: 'Check In', icon: 'car', bg: GREY, fg: C.muted },
    done: { label: 'All picked up', icon: 'checkmark-done', bg: GREY, fg: C.muted },
    transferred: { label: 'Pickup transferred', icon: 'swap-horizontal', bg: GREY, fg: C.muted },
  }[button.kind] as { label: string; icon: React.ComponentProps<typeof Ionicons>['name']; bg: string; fg: string };
  const ready = button.kind === 'ready';
  const disabled = !ready || busy || none;
  return (
    <Animated.View style={{ transform: [{ scale: pop }] }}>
      <Pressable disabled={disabled} onPress={onPress} accessibilityRole="button" accessibilityState={{ disabled }}
        accessibilityLabel={button.kind === 'outside' ? 'Check In, not available outside pickup hours' : look.label}
        style={({ pressed }) => [s.btn, { paddingVertical: 18, flexDirection: 'row', justifyContent: 'center', gap: 10, backgroundColor: look.bg },
          ready && (busy || none) && { opacity: 0.4 }, ready && pressed && { opacity: 0.8 }]}>
        <Ionicons name={look.icon} size={22} color={look.fg} />
        <Text style={[s.btnT, { fontSize: 18, color: look.fg }]}>{look.label}</Text>
      </Pressable>
    </Animated.View>
  );
}
