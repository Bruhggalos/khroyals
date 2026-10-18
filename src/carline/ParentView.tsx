/**
 * Parent side of the car line: each child's pickup number, then "I'm here"
 * once you're at school. The app sends your location and the school checks
 * you're within the pickup radius.
 */
import { useState } from 'react';
import { Alert, Linking, Platform, Pressable, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { carlineAnnounce, carlineCancel, type CarlineConfig, type Person, type Pickup } from '../api/connect';
import { C, Card, H, P, s } from '../ui';
import { AutoCheckInCard } from './AutoCheckInCard';
import { clock, gradeLabel, hoursLabel } from './format';
import { LocationError, currentSpot, distanceLabel } from './location';

export function ParentView({ kids, pickups, numbers, config, onChange }: {
  kids: Person[]; pickups: Pickup[]; numbers: Record<string, string>; config: CarlineConfig | null; onChange: () => void;
}) {
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
      await carlineAnnounce(chosen.map((k) => k.id), at);
      onChange();
    } catch (e: any) {
      setProblem(e.message);
      if (e instanceof LocationError && Platform.OS !== 'web') {
        Alert.alert('Location needed', e.message, [{ text: 'Not now', style: 'cancel' }, { text: 'Open settings', onPress: () => Linking.openSettings() }]);
      }
    } finally { setBusy(false); }
  };

  if (kids.length === 0) return (
    <Card><H>No children linked yet</H><P muted>Add your children under My profile → My children, or ask the school office to link them.</P></Card>
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
