/**
 * Buy tickets for an event (?event=): how many of each kind (with what's left), the total, and Pay,
 * which holds the tickets and opens Stripe's payment page (card, Apple Pay or Google Pay). Back in the
 * app it waits for the payment to be confirmed, then shows them in My Tickets. Free tickets are issued
 * straight away.
 */
import { useCallback, useEffect, useState } from 'react';
import { Alert, Platform, Pressable, ScrollView, Text, View } from 'react-native';
import { Stack, router, useLocalSearchParams } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { Ionicons } from '@expo/vector-icons';
import { cancelTicketOrder, errorText, startTicketCheckout, ticketEvent, ticketOrderStatus, type TicketEvent } from '../../src/api/connect';
import { NAVY, GOLD, Place, when } from '../../src/sports/ui';
import { money, ticketCount } from '../../src/tickets/labels';
import { Button, C, Card, Loading, P, s } from '../../src/ui';

const APP_RETURN = 'khroyals://tickets';

export default function BuyTickets() {
  const { event } = useLocalSearchParams<{ event: string }>();
  const [ev, setEv] = useState<TicketEvent | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [count, setCount] = useState<Record<string, number>>({});
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(() => { ticketEvent(event).then((e) => { setEv(e); setError(null); }).catch((e) => setError(errorText(e))); }, [event]);
  useEffect(() => { load(); }, [load]);

  const header = <Stack.Screen options={{ title: 'Tickets' }} />;
  if (error && !ev) return <View style={[s.screen, s.pad]}>{header}<Card><P>{error}</P></Card></View>;
  if (!ev) return <>{header}<Loading /></>;

  const total = ev.types.reduce((sum, t) => sum + (count[t.id] ?? 0) * t.priceCents, 0);
  const n = Object.values(count).reduce((a, b) => a + b, 0);
  const step = (id: string, by: 1 | -1, left: number | null) => setCount((c) => {
    const next = Math.max(0, (c[id] ?? 0) + by);
    if (by > 0 && (n >= ev.maxPerOrder || (left != null && next > left))) return c;
    return { ...c, [id]: next };
  });

  /** After Stripe: wait for its webhook to mark the order paid, then show the tickets. */
  const confirm = async (orderId: string) => {
    setBusy('Confirming your payment…');
    for (let i = 0; i < 14; i++) {
      const st = await ticketOrderStatus(orderId).catch(() => null);
      if (st?.status === 'paid') { router.replace('/tickets'); return; }
      if (st?.status === 'cancelled') break;
      await new Promise((r) => setTimeout(r, 1500));
    }
    setBusy(null);
    Alert.alert('Almost there', 'Your payment is still being confirmed. Your tickets will appear in My Tickets in a minute.',
      [{ text: 'Open My Tickets', onPress: () => router.replace('/tickets') }]);
  };

  const pay = async () => {
    setBusy(total ? 'Opening the payment page…' : 'Getting your tickets…');
    try {
      const items = ev.types.map((t) => ({ typeId: t.id, quantity: count[t.id] ?? 0 })).filter((x) => x.quantity > 0);
      const r = await startTicketCheckout(ev.eventId, items, Platform.OS === 'web' ? 'web' : 'app');
      if (r.free || !r.url) { router.replace('/tickets'); return; }
      if (Platform.OS === 'web') { window.location.assign(r.url); return; }   // Stripe sends them back to My Tickets
      const done = await WebBrowser.openAuthSessionAsync(r.url, APP_RETURN);
      if (done.type === 'success' && done.url.includes('result=paid')) return confirm(r.orderId);
      // Closed or cancelled: unless the payment went through anyway, let the hold go.
      const st = await ticketOrderStatus(r.orderId).catch(() => null);
      if (st?.status === 'paid') { router.replace('/tickets'); return; }
      await cancelTicketOrder(r.orderId).catch(() => {});
      setBusy(null);
      load();
    } catch (e) { setBusy(null); Alert.alert('Tickets', errorText(e)); load(); }
  };

  return (
    <ScrollView style={s.screen} contentContainerStyle={s.pad}>
      {header}
      <View style={{ padding: 16, borderRadius: 16, backgroundColor: NAVY, gap: 4 }}>
        <Text style={{ color: GOLD, fontSize: 12, fontWeight: '900', letterSpacing: 1 }}>TICKETS</Text>
        <Text style={{ color: '#fff', fontSize: 20, fontWeight: '900' }}>{ev.title}</Text>
        <Text style={{ color: '#fff', opacity: 0.9 }}>{when(ev.startsAt)}</Text>
      </View>
      <Place e={ev} />
      {ev.mine > 0 && (
        <Card onPress={() => router.push('/tickets')} style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          <Ionicons name="ticket" size={20} color={C.primary} />
          <Text style={{ flex: 1, color: C.ink, fontWeight: '700' }}>You have {ticketCount(ev.mine)} for this event</Text>
          <Ionicons name="chevron-forward" size={18} color={C.muted} />
        </Card>
      )}

      {!ev.open ? <Card><P>{ev.cancelled ? 'This event was cancelled.' : 'Tickets for this event aren’t on sale right now.'}</P></Card>
        : !ev.canBuy ? <Card><P>Tickets are bought by parents, staff and family.</P></Card> : (
          <>
            {ev.types.map((t) => {
              const c = count[t.id] ?? 0;
              const soldOut = t.left === 0;
              return (
                <View key={t.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, borderRadius: 14, backgroundColor: '#fff',
                  borderWidth: 1, borderColor: c ? C.primary : C.line, opacity: soldOut ? 0.5 : 1 }}>
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 17, fontWeight: '800', color: C.ink }}>{t.name}</Text>
                    <Text style={{ color: C.muted }}>{money(t.priceCents)}{soldOut ? ' · Sold out' : t.left != null && t.left <= 20 ? ` · ${t.left} left` : ''}</Text>
                  </View>
                  <Stepper label={t.name} value={c} onMinus={() => step(t.id, -1, t.left)} onPlus={() => step(t.id, 1, t.left)}
                    plusOff={soldOut || n >= ev.maxPerOrder || (t.left != null && c >= t.left)} />
                </View>
              );
            })}
            {n >= ev.maxPerOrder && <P muted>Up to {ev.maxPerOrder} tickets at a time.</P>}
            <View style={[s.row, { justifyContent: 'space-between', paddingHorizontal: 4 }]}>
              <Text style={{ fontSize: 16, color: C.muted }}>{ticketCount(n)}</Text>
              <Text style={{ fontSize: 22, fontWeight: '900', color: C.ink }}>{n === 0 ? '$0' : money(total)}</Text>
            </View>
            <Button label={busy ?? (n === 0 ? 'Choose your tickets' : total ? `Pay ${money(total)}` : 'Get my tickets')} disabled={!!busy || n === 0} onPress={pay} />
            {total > 0 && <P muted>You pay on Stripe's secure page with a card, Apple Pay or Google Pay. Your tickets are held for 30 minutes while you pay.</P>}
          </>
        )}
    </ScrollView>
  );
}

function Stepper({ label, value, onMinus, onPlus, plusOff }: { label: string; value: number; onMinus: () => void; onPlus: () => void; plusOff: boolean }) {
  const btn = (icon: 'remove' | 'add', onPress: () => void, off: boolean, a11y: string) => (
    <Pressable onPress={onPress} disabled={off} accessibilityRole="button" accessibilityLabel={a11y} hitSlop={6}
      style={{ width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center', backgroundColor: off ? C.line : C.primary }}>
      <Ionicons name={icon} size={20} color="#fff" />
    </Pressable>
  );
  return (
    <View style={[s.row, { gap: 10 }]}>
      {btn('remove', onMinus, value === 0, `One fewer ${label}`)}
      <Text style={{ minWidth: 22, textAlign: 'center', fontSize: 18, fontWeight: '800', color: C.ink }} accessibilityLabel={`${value} ${label}`}>{value}</Text>
      {btn('add', onPlus, plusOff, `One more ${label}`)}
    </View>
  );
}
