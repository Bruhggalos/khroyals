/** Staff side of the car line: arrivals appear live with pickup numbers; tap when each child is in the car. */
import { useEffect, useState } from 'react';
import { Alert, Pressable, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { carlineConfirm, carlineReopen, type BoardRow } from '../api/connect';
import { C, Card, P, s } from '../ui';
import { clock, gradeLabel, minutesSince } from './format';
import { distanceLabel } from './location';

const GREEN = '#15803D';

export function DutyView({ board, onChange }: { board: BoardRow[]; onChange: () => void }) {
  const [now, setNow] = useState(Date.now());
  const [busy, setBusy] = useState<string | null>(null);
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 30_000); return () => clearInterval(t); }, []);

  const waiting = board.filter((p) => p.status === 'waiting');
  const done = board.filter((p) => p.status === 'picked_up').sort((a, b) => (b.pickedUpAt ?? '').localeCompare(a.pickedUpAt ?? ''));
  const run = (id: string, fn: () => Promise<void>) => {
    setBusy(id);
    fn().then(onChange).catch((e) => Alert.alert('Car line', e.message)).finally(() => setBusy(null));
  };

  return (
    <View style={{ gap: 12 }}>
      <View style={[s.row, { justifyContent: 'space-between' }]}>
        <Text style={{ fontSize: 22, fontWeight: '800', color: C.ink }}>{waiting.length} waiting</Text>
        <View style={s.row}>
          <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: GREEN }} />
          <Text style={{ color: C.muted, fontSize: 13 }}>Live</Text>
        </View>
      </View>

      {waiting.length === 0 && <Card><P muted>No one is waiting right now. Parents show up here as soon as they announce.</P></Card>}
      {waiting.map((p) => {
        const mins = minutesSince(p.arrivedAt, now);
        return (
          <Card key={p.id} style={{ gap: 10 }}>
            <View style={[s.row, { gap: 12, alignItems: 'center' }]}>
              <View style={{ minWidth: 76, alignItems: 'center', paddingVertical: 8, paddingHorizontal: 8, borderRadius: 12, backgroundColor: C.primary }}>
                <Text style={{ color: '#fff', fontSize: 10, fontWeight: '700' }}>PICKUP #</Text>
                <Text style={{ color: '#fff', fontSize: 30, fontWeight: '900' }}>{p.number ?? '—'}</Text>
              </View>
              <View style={{ flex: 1, gap: 2 }}>
                <Text style={{ fontSize: 20, fontWeight: '800', color: C.ink }}>{p.name}</Text>
                <P muted>{[gradeLabel(p.grade), p.parent && `Parent: ${p.parent}`].filter(Boolean).join(' · ')}</P>
                <P muted>
                  {clock(p.arrivedAt)}{p.via === 'arrival' ? ' (automatic)' : ''} · {mins < 1 ? 'just now' : `${mins} min`}
                  {p.distanceM != null ? ` · ${distanceLabel(p.distanceM)} away` : ''}
                </P>
              </View>
            </View>
            <Pressable disabled={busy === p.id} onPress={() => run(p.id, () => carlineConfirm(p.id))} accessibilityRole="button"
              style={({ pressed }) => [s.btn, { backgroundColor: GREEN, paddingVertical: 14, flexDirection: 'row', justifyContent: 'center', gap: 8 },
                (pressed || busy === p.id) && { opacity: 0.7 }]}>
              <Ionicons name="checkmark-circle" size={22} color="#fff" />
              <Text style={[s.btnT, { fontSize: 17 }]}>Picked up</Text>
            </Pressable>
          </Card>
        );
      })}

      {done.length > 0 && (
        <>
          <Text style={{ fontSize: 12, fontWeight: '700', color: C.muted, marginTop: 8 }}>PICKED UP TODAY ({done.length})</Text>
          {done.map((p) => (
            <Card key={p.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
              <Ionicons name="checkmark-done-circle" size={24} color={GREEN} />
              <View style={{ flex: 1 }}>
                <Text style={{ fontWeight: '700', color: C.ink }}>#{p.number ?? '—'} · {p.name}</Text>
                <P muted>{p.pickedUpAt ? clock(p.pickedUpAt) : ''}{p.pickedUpBy ? ` · by ${p.pickedUpBy}` : ''}</P>
              </View>
              <Text style={{ color: C.primary, fontWeight: '600' }} onPress={() => run(p.id, () => carlineReopen(p.id))}>Undo</Text>
            </Card>
          ))}
        </>
      )}
    </View>
  );
}
