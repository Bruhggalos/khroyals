/**
 * Check-out lists for field trips, class events and Activities events (the lower part of the
 * Attendance app): the lists the teacher, coach or director runs, and starting one for an Activities
 * event they coach or direct (its registered students) or for a field trip or class event (students
 * from their sections). Each child goes only to someone on their pickup list. Staff only.
 */
import { useCallback, useState } from 'react';
import { Alert, Pressable, Text, View } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { checkoutEventOptions, checkoutListForEvent, errorText, myCheckoutLists, type CheckoutListSummary } from '../api/connect';
import { schoolToday } from '../calendar/past';
import { clock } from '../carline/format';
import { Button, C, Card, H, Loading, P, s } from '../ui';
import { dayLabel, progressLine } from './labels';

const GREEN = '#15803D';

export function CheckoutLists() {
  const [lists, setLists] = useState<CheckoutListSummary[] | null>(null);
  const [events, setEvents] = useState<{ id: string; title: string; startsAt: string; listId: string | null }[]>([]);
  const [busy, setBusy] = useState(false);

  useFocusEffect(useCallback(() => {
    Promise.all([myCheckoutLists().catch(() => []), checkoutEventOptions().catch(() => [])]).then(([l, e]) => { setLists(l); setEvents(e); });
  }, []));

  const openEvent = async (eventId: string) => {
    setBusy(true);
    try { router.push(`/checkout/${await checkoutListForEvent(eventId)}`); } catch (e) { Alert.alert('Event check-out', errorText(e)); } finally { setBusy(false); }
  };

  if (!lists) return <Loading />;
  const today = schoolToday();
  const coming = lists.filter((l) => l.day >= today), earlier = lists.filter((l) => l.day < today).reverse();
  const card = (l: CheckoutListSummary) => {
    const all = l.students > 0 && l.released >= l.students;
    return (
      <Pressable key={l.id} onPress={() => router.push(`/checkout/${l.id}`)} accessibilityRole="button"
        style={({ pressed }) => [{ padding: 14, borderRadius: 14, backgroundColor: '#fff', borderWidth: 1, borderColor: C.line, gap: 6 }, pressed && { opacity: 0.85 }]}>
        <View style={[s.row, { justifyContent: 'space-between', gap: 8 }]}>
          <Text style={{ fontSize: 16, fontWeight: '800', color: C.ink, flexShrink: 1 }}>{l.title}</Text>
          <Text style={{ color: C.muted, fontWeight: '600' }}>{dayLabel(l.day)}</Text>
        </View>
        <View style={{ height: 8, borderRadius: 4, backgroundColor: C.line, overflow: 'hidden' }}>
          <View style={{ width: `${l.students ? Math.round((100 * l.released) / l.students) : 0}%`, height: 8, backgroundColor: all ? GREEN : C.primary }} />
        </View>
        <Text style={{ color: all ? GREEN : C.muted, fontWeight: all ? '700' : '400' }}>{progressLine(l.released, l.students)}</Text>
      </Pressable>
    );
  };
  const toStart = events.filter((e) => !e.listId);

  return (
    <>
      <H>Field trip & event check-out</H>
      <P muted>Before letting students go, check each one out to someone on their pickup list: their parents, linked family or an approved pickup person. Their parents get a notification.</P>
      {coming.map(card)}
      {toStart.map((e) => (
        <Card key={e.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          <Ionicons name="trophy-outline" size={22} color={C.primary} />
          <View style={{ flex: 1 }}>
            <Text style={{ fontWeight: '700', color: C.ink }}>{e.title}</Text>
            <P muted>{dayLabel(schoolToday(new Date(e.startsAt)))} · {clock(e.startsAt)} · its registered students</P>
          </View>
          <Text style={{ color: C.primary, fontWeight: '700' }} accessibilityRole="button" onPress={() => { if (!busy) openEvent(e.id); }}>Start</Text>
        </Card>
      ))}
      <Button kind="ghost" label="+ Field trip or class event" onPress={() => router.push('/checkout/new')} />
      {earlier.length > 0 && (<><Text style={{ fontSize: 12, fontWeight: '700', color: C.muted, marginTop: 6 }}>EARLIER THIS WEEK</Text>{earlier.map(card)}</>)}
    </>
  );
}
