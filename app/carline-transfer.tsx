/**
 * Car Line → Transfer pickup: a parent asks someone else with an approved account to pick their
 * children up, today or a day ahead. They choose the children and the day, find the person by name,
 * and send; the person accepts or declines in their Car Line. Until they accept, the parent keeps pickup.
 */
import { useCallback, useEffect, useState } from 'react';
import { Alert, Pressable, ScrollView, Text, View } from 'react-native';
import { Stack, router, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import {
  errorText, isFamily, live, me, myChildren, pickupTransferPeople, pickupTransfers, transferPickup, type Person, type PickupTransfer,
} from '../src/api/connect';
import { schoolToday } from '../src/calendar/past';
import { addDays, dayWords } from '../src/carline/Transfers';
import { DateField } from '../src/forms/DateTimeField';
import { Button, C, Card, Field, H, Loading, P, s } from '../src/ui';

type When = 'today' | 'tomorrow' | 'other';

const pill = (label: string, on: boolean, onPress: () => void) => (
  <Text key={label} onPress={onPress} accessibilityRole="button" accessibilityState={{ selected: on }}
    style={{ paddingHorizontal: 14, paddingVertical: 8, borderRadius: 999, overflow: 'hidden', borderWidth: 1, borderColor: on ? C.primary : C.line,
      backgroundColor: on ? C.primary : '#fff', color: on ? '#fff' : C.ink, fontWeight: '700' }}>{label}</Text>
);
const label = (text: string) => <Text style={{ fontSize: 13, fontWeight: '800', color: C.muted, letterSpacing: 0.5 }}>{text}</Text>;

/** Names found as you type, a moment after you stop. */
function usePeople(query: string) {
  const [found, setFound] = useState<{ id: string; name: string }[]>([]);
  const [searching, setSearching] = useState(false);
  useEffect(() => {
    if (query.trim().length < 2) { setFound([]); return; }
    let gone = false;
    setSearching(true);
    const t = setTimeout(() => {
      pickupTransferPeople(query).then((f) => { if (!gone) setFound(f); }).catch(() => { if (!gone) setFound([]); })
        .finally(() => { if (!gone) setSearching(false); });
    }, 300);
    return () => { gone = true; clearTimeout(t); };
  }, [query]);
  return { found, searching };
}

export default function TransferPickup() {
  const today = schoolToday();
  const [kids, setKids] = useState<Person[] | null>(null);
  const [handed, setHanded] = useState<PickupTransfer[]>([]);
  const [skip, setSkip] = useState<Set<string>>(new Set());
  const [when, setWhen] = useState<When>('today');
  const [other, setOther] = useState('');
  const [query, setQuery] = useState('');
  const [to, setTo] = useState<{ id: string; name: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const { found, searching } = usePeople(to ? '' : query);

  useFocusEffect(useCallback(() => {
    const p = me();
    if (!live || !p || isFamily(p)) { setKids([]); return; }
    Promise.all([myChildren(), pickupTransfers()])
      .then(([k, t]) => { setKids(k); setHanded(t.children); })
      .catch((e) => { setKids([]); Alert.alert('Transfer pickup', errorText(e)); });
  }, []));

  const day = when === 'today' ? today : when === 'tomorrow' ? addDays(today, 1) : other;
  // A child already handed to someone for that day (waiting for an answer or accepted) can't be asked again.
  const takenBy = (id: string) => handed.find((t) => t.studentId === id && t.day === day && t.status !== 'declined');
  const chosen = (kids ?? []).filter((k) => !skip.has(k.id) && !takenBy(k.id));
  const toggle = (id: string) => setSkip((cur) => { const n = new Set(cur); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const ready = chosen.length > 0 && !!to && !!day && !busy;

  const send = async () => {
    if (!to || !day) return;
    setBusy(true);
    try {
      await transferPickup(chosen.map((k) => k.id), to.id, day);
      const first = to.name.split(' ')[0];
      Alert.alert('Request sent', `${to.name} will get a notification to accept or decline picking up `
        + `${chosen.map((k) => k.firstName).join(' and ')} ${dayWords(day, today)}. You keep pickup until ${first} accepts.`);
      router.back();
    } catch (e) {
      Alert.alert('Transfer pickup', errorText(e));
    } finally { setBusy(false); }
  };

  const header = <Stack.Screen options={{ title: 'Transfer pickup' }} />;
  if (!kids) return <>{header}<Loading /></>;
  if (!kids.length) return (
    <View style={[s.screen, s.pad]}>{header}
      <Card><H>For parents</H><P muted>Parents can transfer their children's pickup to someone else from here.</P></Card>
    </View>
  );

  return (
    <ScrollView style={s.screen} contentContainerStyle={s.pad} keyboardShouldPersistTaps="handled">
      {header}
      <P muted>Ask someone with an approved Royals Connect account to pick up from the car line. They accept or decline in their Car Line.</P>

      {label('WHEN')}
      <View style={[s.row, { flexWrap: 'wrap', gap: 8 }]}>
        {pill('Today', when === 'today', () => setWhen('today'))}
        {pill('Tomorrow', when === 'tomorrow', () => setWhen('tomorrow'))}
        {pill('Another day', when === 'other', () => setWhen('other'))}
      </View>
      {when === 'other' && <DateField label="Day" value={other} onChange={setOther} min={addDays(today, 2)} max={addDays(today, 60)} />}

      {label("WHO'S BEING PICKED UP")}
      <View style={{ gap: 8 }}>
        {kids.map((k) => {
          const taken = takenBy(k.id);
          const on = !taken && !skip.has(k.id);
          return (
            <Card key={k.id} onPress={taken ? undefined : () => toggle(k.id)} style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
              <Ionicons name={taken ? 'swap-horizontal' : on ? 'checkmark-circle' : 'ellipse-outline'} size={26} color={on ? C.primary : C.muted} />
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 16, fontWeight: '700', color: taken ? C.muted : C.ink }}>{k.firstName} {k.lastName}</Text>
                {taken && <P muted>{taken.status === 'accepted' ? `${taken.to} is picking up` : `Waiting for ${taken.to} to answer`} {dayWords(day, today)}</P>}
              </View>
            </Card>
          );
        })}
      </View>

      {label("WHO'S PICKING UP")}
      {to ? (
        <Card style={{ flexDirection: 'row', alignItems: 'center', gap: 12, borderWidth: 2, borderColor: C.primary }}>
          <Ionicons name="person-circle" size={32} color={C.primary} />
          <Text style={{ flex: 1, fontSize: 16, fontWeight: '700', color: C.ink }}>{to.name}</Text>
          <Text style={{ color: C.primary, fontWeight: '700' }} accessibilityRole="button" onPress={() => { setTo(null); setQuery(''); }}>Change</Text>
        </Card>
      ) : (
        <View style={{ gap: 8 }}>
          <Field label="Search by name" placeholder="First or last name" value={query} onChangeText={setQuery} autoCapitalize="words"
            autoCorrect={false} hint="Only people with an approved account in the app show up." />
          {found.map((f) => (
            <Pressable key={f.id} onPress={() => setTo(f)} accessibilityRole="button" accessibilityLabel={`Choose ${f.name}`}
              style={({ pressed }) => [s.row, { gap: 10, padding: 12, borderRadius: 12, borderWidth: 1, borderColor: C.line, backgroundColor: '#fff' },
                pressed && { opacity: 0.7 }]}>
              <Ionicons name="person-circle-outline" size={26} color={C.muted} />
              <Text style={{ flex: 1, fontSize: 16, color: C.ink }}>{f.name}</Text>
              <Ionicons name="chevron-forward" size={18} color={C.muted} />
            </Pressable>
          ))}
          {query.trim().length >= 2 && !searching && !found.length && (
            <P muted>No one by that name. They need their own approved account in KH Royals.</P>
          )}
        </View>
      )}

      <P muted>Once they accept, only they can check {chosen.length === 1 ? chosen[0].firstName : 'your children'} in that day. You can cancel the transfer in the Car Line any time before pickup.</P>
      <Button label={busy ? 'Sending…' : 'Send request'} disabled={!ready} onPress={send} />
    </ScrollView>
  );
}
