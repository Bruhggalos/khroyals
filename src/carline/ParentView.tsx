/**
 * Parent side of the car line: each child's pickup number, the vehicle you're
 * arriving in, then "I'm here" once you're at school. The app sends your location
 * and the school checks you're within the pickup radius.
 */
import { useState } from 'react';
import { Alert, Linking, Platform, Pressable, Text, View } from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { carlineAnnounce, carlineCancel, type CarlineConfig, type Person, type Pickup, type Vehicle } from '../api/connect';
import { Button, C, Card, H, P, s } from '../ui';
import { VehicleIcon } from './VehicleIcon';
import { vehicleLabel } from './vehicles';
import { AutoCheckInCard } from './AutoCheckInCard';
import { clock, gradeLabel, hoursLabel } from './format';
import { LocationError, currentSpot, distanceLabel } from './location';

/** The vehicle you're arriving in (your default is the last one used), with a way to switch or add one. */
function ArrivingIn({ vehicles, value, onChange }: { vehicles: Vehicle[]; value: Vehicle | null; onChange: (v: Vehicle) => void }) {
  const [picking, setPicking] = useState(false);
  if (!value) return (
    <Card style={{ gap: 10 }}>
      <View style={[s.row, { gap: 12 }]}>
        <VehicleIcon kind="car" color="silver" />
        <View style={{ flex: 1 }}>
          <Text style={{ fontWeight: '700', color: C.ink }}>Add your vehicle</Text>
          <P muted>Staff see its make, type and color on the car line board, so they can spot you.</P>
        </View>
      </View>
      <Button kind="ghost" label="Add a vehicle" onPress={() => router.push('/vehicle')} />
    </Card>
  );
  return (
    <Card style={{ gap: 10 }}>
      <View style={[s.row, { gap: 12 }]}>
        <VehicleIcon kind={value.kind} color={value.color} />
        <View style={{ flex: 1 }}>
          <P muted>Arriving in</P>
          <Text style={{ fontSize: 17, fontWeight: '700', color: C.ink }}>{vehicleLabel(value)}</Text>
        </View>
        <Text style={{ color: C.primary, fontWeight: '700' }} onPress={() => setPicking(!picking)} accessibilityRole="button">
          {picking ? 'Done' : 'Change'}
        </Text>
      </View>
      {picking && (
        <View style={{ gap: 8 }}>
          {vehicles.map((v) => {
            const on = v.id === value.id;
            return (
              <Pressable key={v.id} onPress={() => { onChange(v); setPicking(false); }} accessibilityRole="button" accessibilityState={{ selected: on }}
                style={[s.row, { gap: 10, padding: 8, borderRadius: 10, borderWidth: 1, borderColor: on ? C.primary : C.line }]}>
                <VehicleIcon kind={v.kind} color={v.color} size={28} />
                <Text style={{ flex: 1, color: C.ink, fontWeight: on ? '700' : '400' }}>{vehicleLabel(v)}</Text>
                {on && <Ionicons name="checkmark" size={20} color={C.primary} />}
              </Pressable>
            );
          })}
          <Text style={{ color: C.primary, fontWeight: '700' }} onPress={() => router.push('/vehicle')}>+ Add a vehicle</Text>
        </View>
      )}
    </Card>
  );
}

export function ParentView({ kids, family, vehicles, pickups, numbers, config, onChange }: {
  /** `family`: a Family account, whose children only the school office links. */
  kids: Person[]; family?: boolean; vehicles: Vehicle[]; pickups: Pickup[]; numbers: Record<string, string>;
  config: CarlineConfig | null; onChange: () => void;
}) {
  // The first vehicle is the default (the last one used) until you pick another.
  const [vehicleId, setVehicleId] = useState<string | null>(null);
  const vehicle = vehicles.find((v) => v.id === vehicleId) ?? vehicles[0] ?? null;
  const [skip, setSkip] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  // Each child's latest check-in today (cancelled ones don't count).
  const status = (id: string) => [...pickups].reverse().find((p) => p.studentId === id && p.status !== 'cancelled');
  const ready = kids.filter((k) => !status(k.id));
  const chosen = ready.filter((k) => !skip.has(k.id));
  const waiting = kids.filter((k) => status(k.id)?.status === 'waiting');
  const closed = config?.line.state === 'closed';

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
        <H>{waiting.length ? "You're in the car line" : closed ? 'The car line is closed' : 'Picking up?'}</H>
        <P muted>{waiting.length
          ? 'Staff can see you and your pickup numbers. Pull forward when you\'re waved up.'
          : closed
            ? `It's open on school days${config ? `, ${hoursLabel(config.start, config.end)}` : ''}.`
            : `When you get to school${config ? ` (within ${distanceLabel(config.radius)} of the pickup spot)` : ''}, choose who you're picking up and tap I'm here. Staff see it right away.`}</P>
      </Card>

      {kids.map((k) => {
        const p = status(k.id);
        const selectable = !p;
        const on = selectable && !skip.has(k.id);
        return (
          <Card key={k.id} onPress={selectable ? () => toggle(k.id) : undefined} style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
            {selectable
              ? <Ionicons name={on ? 'checkmark-circle' : 'ellipse-outline'} size={28} color={on ? C.primary : C.muted} />
              : <Ionicons name={p.status === 'picked_up' ? 'checkmark-done-circle' : 'car'} size={28} color={p.status === 'picked_up' ? '#15803D' : C.accent} />}
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
            </View>
            <View style={{ alignItems: 'center', minWidth: 64, paddingVertical: 6, paddingHorizontal: 8, borderRadius: 10, backgroundColor: C.primary }}
              accessibilityLabel={`Pickup number ${numbers[k.id] ?? 'not set'}`}>
              <Text style={{ color: '#fff', fontSize: 10, fontWeight: '700' }}>PICKUP #</Text>
              <Text style={{ color: '#fff', fontSize: 22, fontWeight: '800' }}>{numbers[k.id] ?? '—'}</Text>
            </View>
          </Card>
        );
      })}

      {ready.length > 0 && !closed && <ArrivingIn vehicles={vehicles} value={vehicle} onChange={(v) => setVehicleId(v.id)} />}
      {ready.length > 0 && !closed && (
        <Pressable disabled={busy || chosen.length === 0} onPress={announce} accessibilityRole="button"
          style={({ pressed }) => [s.btn, { paddingVertical: 18, flexDirection: 'row', justifyContent: 'center', gap: 10 },
            (busy || chosen.length === 0) && { opacity: 0.4 }, pressed && { opacity: 0.8 }]}>
          <Ionicons name="car" size={22} color="#fff" />
          <Text style={[s.btnT, { fontSize: 18 }]}>{busy ? 'Checking your location…' : "I'm here"}</Text>
        </Pressable>
      )}
      {problem && <Text style={{ color: C.danger, fontWeight: '600' }}>{problem}</Text>}
      {ready.length > 0 && chosen.length === 0 && <P muted>Choose at least one child.</P>}
      <P muted>Show your pickup number in your windshield. Uses your location only when you tap I'm here.</P>
      <AutoCheckInCard />
    </View>
  );
}
