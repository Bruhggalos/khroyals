/** Parent side of the car line: pick the children you're collecting and tell the staff on duty you're here. */
import { useState } from 'react';
import { Alert, Pressable, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { carlineCancel, carlineCheckIn, type Person, type Pickup } from '../api/connect';
import { C, Card, H, P, s } from '../ui';
import { AutoCheckInCard } from './AutoCheckInCard';
import { clock, gradeLabel } from './format';

export function ParentView({ kids, pickups, onChange }: { kids: Person[]; pickups: Pickup[]; onChange: () => void }) {
  const [skip, setSkip] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);

  // Each child's latest check-in today (cancelled ones don't count).
  const status = (id: string) => [...pickups].reverse().find((p) => p.studentId === id && p.status !== 'cancelled');
  const ready = kids.filter((k) => !status(k.id));
  const chosen = ready.filter((k) => !skip.has(k.id));
  const waiting = kids.filter((k) => status(k.id)?.status === 'waiting');

  const toggle = (id: string) => setSkip((cur) => { const n = new Set(cur); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const run = (fn: () => Promise<void>) => { setBusy(true); fn().then(onChange).catch((e) => Alert.alert('Car line', e.message)).finally(() => setBusy(false)); };

  if (kids.length === 0) return (
    <Card><H>No children linked yet</H><P muted>The school office links parents to their students. Once yours are linked, they'll show up here.</P></Card>
  );

  return (
    <View style={{ gap: 12 }}>
      <Card>
        <H>{waiting.length ? "You're in the car line" : 'Picking up?'}</H>
        <P muted>{waiting.length
          ? 'The staff on duty can see you. Pull forward when you\'re waved up.'
          : 'When you join the car line, choose who you\'re picking up and tap the button. The staff on duty see it right away.'}</P>
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
            </View>
            {p?.status === 'waiting' && (
              <Text style={{ color: C.danger, fontWeight: '600' }} onPress={() => run(() => carlineCancel(p.id))}>Cancel</Text>
            )}
          </Card>
        );
      })}

      {ready.length > 0 && (
        <Pressable disabled={busy || chosen.length === 0} onPress={() => run(() => carlineCheckIn(chosen.map((k) => k.id)))}
          accessibilityRole="button"
          style={({ pressed }) => [s.btn, { paddingVertical: 18, flexDirection: 'row', justifyContent: 'center', gap: 10 },
            (busy || chosen.length === 0) && { opacity: 0.4 }, pressed && { opacity: 0.8 }]}>
          <Ionicons name="car" size={22} color="#fff" />
          <Text style={[s.btnT, { fontSize: 18 }]}>I'm in the car line</Text>
        </Pressable>
      )}
      {ready.length > 0 && chosen.length === 0 && <P muted>Choose at least one child.</P>}
      <AutoCheckInCard />
    </View>
  );
}
