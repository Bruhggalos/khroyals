/**
 * Sell tickets for an event (?event=), for the activity's coaches and directors: the kinds of ticket
 * with their prices and limits, on sale or not, when sales close and how many one order may hold; then
 * what's sold, who bought, what's come in, and Scan tickets for the door.
 */
import { useCallback, useEffect, useState } from 'react';
import { Alert, Pressable, ScrollView, Switch, Text, View } from 'react-native';
import { Stack, router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { errorText, saveTicketEvent, ticketEvent, ticketSales, ticketSetup, type TicketEvent, type TicketSale } from '../../src/api/connect';
import { DateField, TimeField, toTimeString } from '../../src/forms/DateTimeField';
import { NAVY, GOLD, when } from '../../src/sports/ui';
import { money, priceText, toCents } from '../../src/tickets/labels';
import { Button, C, Card, Field, H, Loading, P, s } from '../../src/ui';

type Row = { id?: string; name: string; price: string; limit: string };

const localDate = (iso: string) => { const d = new Date(iso); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };

export default function ManageTickets() {
  const { event } = useLocalSearchParams<{ event: string }>();
  const [ev, setEv] = useState<TicketEvent | null>(null);
  const [sales, setSales] = useState<TicketSale[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [stripe, setStripe] = useState(true);
  const [onSale, setOnSale] = useState(false);
  const [rows, setRows] = useState<Row[]>([]);
  const [closeDay, setCloseDay] = useState('');
  const [closeTime, setCloseTime] = useState('');
  const [max, setMax] = useState('10');
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    ticketEvent(event).then((e) => {
      setEv(e); setError(null);
      setOnSale(e.onSale); setMax(String(e.maxPerOrder));
      setRows(e.types.length ? e.types.map((t) => ({ id: t.id, name: t.name, price: priceText(t.priceCents), limit: t.capacity ? String(t.capacity) : '' }))
        : [{ name: 'Adult', price: '', limit: '' }, { name: 'Student', price: '', limit: '' }]);
      setCloseDay(e.closesAt ? localDate(e.closesAt) : ''); setCloseTime(e.closesAt ? toTimeString(new Date(e.closesAt)) : '');
    }).catch((e) => setError(errorText(e)));
    ticketSales(event).then(setSales).catch(() => setSales([]));
  }, [event]);
  useFocusEffect(useCallback(() => { load(); ticketSetup().then((x) => setStripe(x.stripe)); }, [load]));
  // Picking a closing day starts at the event's own start time.
  useEffect(() => { if (closeDay && !closeTime && ev) setCloseTime(toTimeString(new Date(ev.startsAt))); }, [closeDay, closeTime, ev]);

  const header = <Stack.Screen options={{ title: 'Sell tickets' }} />;
  if (error && !ev) return <View style={[s.screen, s.pad]}>{header}<Card><P>{error}</P></Card></View>;
  if (!ev) return <>{header}<Loading /></>;
  if (!ev.leader) return <View style={[s.screen, s.pad]}>{header}<Card><P>Selling tickets is for the activity's coaches and directors.</P></Card></View>;

  const set = (i: number, patch: Partial<Row>) => setRows((r) => r.map((x, j) => (j === i ? { ...x, ...patch } : x)));
  const save = async () => {
    const types = [];
    for (const r of rows.filter((x) => x.name.trim() || x.price.trim())) {
      const priceCents = toCents(r.price || '0');
      if (!r.name.trim()) return Alert.alert('Almost there', 'Give each kind of ticket a name, like Adult or Student.');
      if (priceCents == null) return Alert.alert('Almost there', `Type ${r.name}'s price in dollars, like 10 or 7.50 (0 for free).`);
      const capacity = r.limit.trim() ? Number(r.limit) : null;
      if (capacity != null && !(Number.isInteger(capacity) && capacity > 0)) return Alert.alert('Almost there', `${r.name}'s limit is a number of tickets, or leave it empty.`);
      types.push({ id: r.id, name: r.name.trim(), priceCents, capacity });
    }
    const closesAt = closeDay && closeTime ? (() => { const [y, m, d] = closeDay.split('-').map(Number); const [h, mi] = closeTime.split(':').map(Number); return new Date(y, m - 1, d, h, mi).toISOString(); })() : null;
    setBusy(true);
    try {
      await saveTicketEvent(ev.eventId, { onSale, closesAt, maxPerOrder: Number(max) || 10, types });
      load();
      Alert.alert('Saved', onSale ? 'Tickets are on sale. Families see a Tickets button on this event in Activities.' : 'Saved. Tickets aren’t on sale until you switch it on.');
    } catch (e) { Alert.alert('Tickets', errorText(e)); } finally { setBusy(false); }
  };

  const sold = ev.types.reduce((n, t) => n + (t.sold ?? 0), 0), admitted = ev.types.reduce((n, t) => n + (t.admitted ?? 0), 0);
  return (
    <ScrollView style={s.screen} contentContainerStyle={s.pad} keyboardShouldPersistTaps="handled">
      {header}
      <View style={{ padding: 16, borderRadius: 16, backgroundColor: NAVY, gap: 4 }}>
        <Text style={{ color: GOLD, fontSize: 12, fontWeight: '900', letterSpacing: 1 }}>{ev.open ? 'ON SALE' : 'NOT ON SALE'}</Text>
        <Text style={{ color: '#fff', fontSize: 20, fontWeight: '900' }}>{ev.title}</Text>
        <Text style={{ color: '#fff', opacity: 0.9 }}>{when(ev.startsAt)}</Text>
        <Text style={{ color: '#fff', fontWeight: '700', marginTop: 4 }}>{sold} sold · {admitted} in · {ev.takingsCents ? money(ev.takingsCents) : '$0'} taken</Text>
      </View>
      {sold > 0 && (
        <Pressable onPress={() => router.push({ pathname: '/tickets/scan', params: { event: ev.eventId } })} accessibilityRole="button"
          style={({ pressed }) => [{ flexDirection: 'row', alignItems: 'center', gap: 12, padding: 16, borderRadius: 14, backgroundColor: C.primary }, pressed && { opacity: 0.85 }]}>
          <Ionicons name="scan" size={26} color="#fff" />
          <View style={{ flex: 1 }}>
            <Text style={{ color: '#fff', fontSize: 17, fontWeight: '800' }}>Scan tickets at the door</Text>
            <Text style={{ color: '#fff', opacity: 0.85 }}>Each ticket lets one person in, once</Text>
          </View>
          <Ionicons name="chevron-forward" size={20} color="#fff" />
        </Pressable>
      )}
      {!stripe && (
        <Card style={{ borderColor: '#B45309', borderWidth: 1 }}>
          <P>{"Card payments aren't set up yet, so only free tickets can be issued. Paid tickets open once the school connects its Stripe account."}</P>
        </Card>
      )}

      <Card>
        <View style={[s.row, { justifyContent: 'space-between' }]}>
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 16, fontWeight: '800', color: C.ink }}>On sale</Text>
            <P muted>Families see a Tickets button on this event.</P>
          </View>
          <Switch value={onSale} onValueChange={setOnSale} accessibilityLabel="On sale" />
        </View>
      </Card>

      <H>Kinds of ticket</H>
      {rows.map((r, i) => {
        const t = ev.types.find((x) => x.id === r.id);
        return (
          <Card key={r.id ?? `new-${i}`}>
            <View style={[s.row, { gap: 8 }]}>
              <Field label="Name" value={r.name} onChangeText={(name) => set(i, { name })} placeholder="Adult" maxLength={60} style={{ flex: 2, minWidth: 0 }} />
              <Field label="Price ($)" value={r.price} onChangeText={(price) => set(i, { price })} placeholder="10" keyboardType="decimal-pad" style={{ flex: 1, minWidth: 0 }} />
              <Field label="Limit" value={r.limit} onChangeText={(limit) => set(i, { limit: limit.replace(/[^0-9]/g, '') })} placeholder="None" keyboardType="number-pad" style={{ flex: 1, minWidth: 0 }} />
            </View>
            <View style={[s.row, { justifyContent: 'space-between' }]}>
              <Text style={{ color: C.muted }}>{t ? `${t.sold ?? 0} sold · ${t.admitted ?? 0} in${t.left != null ? ` · ${t.left} left` : ''}` : 'New'}</Text>
              {/* A kind with tickets sold stays (the database refuses); lowering its limit stops sales. */}
              {!t?.sold && <Text style={{ color: C.danger, fontWeight: '600' }} accessibilityRole="button" onPress={() => setRows((x) => x.filter((_, j) => j !== i))}>Remove</Text>}
            </View>
          </Card>
        );
      })}
      <Button kind="ghost" label="+ Add a kind of ticket" onPress={() => setRows((r) => [...r, { name: '', price: '', limit: '' }])} />

      <H>Sales close</H>
      <P muted>Leave empty to close sales when the event starts.</P>
      <View style={[s.row, { gap: 10 }]}>
        <DateField label="Day" optional value={closeDay} onChange={setCloseDay} style={{ flex: 1 }} />
        <TimeField label="Time" optional value={closeTime} onChange={setCloseTime} style={{ flex: 1 }} />
      </View>
      <Field label="Most tickets in one order" value={max} onChangeText={(v) => setMax(v.replace(/[^0-9]/g, ''))} keyboardType="number-pad" maxLength={2} />
      <Button label={busy ? 'Saving…' : 'Save'} disabled={busy} onPress={save} />

      {sales.length > 0 && <H>Who bought ({sales.length})</H>}
      {sales.map((o) => (
        <Card key={o.id} style={{ gap: 2 }}>
          <View style={[s.row, { justifyContent: 'space-between' }]}>
            <Text style={{ fontWeight: '800', color: C.ink, flex: 1 }}>{o.buyer}</Text>
            <Text style={{ fontWeight: '800', color: C.ink }}>{money(o.totalCents)}</Text>
          </View>
          <P muted>{o.tickets} · {o.admitted} of {o.count} in · {new Date(o.paidAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</P>
        </Card>
      ))}
    </ScrollView>
  );
}
