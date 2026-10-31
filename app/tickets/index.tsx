/**
 * My Tickets: every paid ticket for events from yesterday on, grouped by event, each with its QR code
 * (shown at the door; each admits once) and the short code under it. Add to Apple Wallet on iPhone and
 * Save to Google Wallet on Android, once the school has set them up. Coming back from Stripe
 * (?order=…&result=…), it waits for the payment to be confirmed.
 */
import { useCallback, useEffect, useState } from 'react';
import { Alert, Linking, Platform, Pressable, RefreshControl, ScrollView, Text, View } from 'react-native';
import { Stack, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import {
  cancelTicketOrder, errorText, myTickets, ticketOrderStatus, ticketSetup, walletLink, type MyTicket, type TicketSetup,
} from '../../src/api/connect';
import { PAST_STYLE } from '../../src/calendar/PastToggle';
import { clock } from '../../src/carline/format';
import { QrCode } from '../../src/share/QrCode';
import { when, NAVY, GOLD } from '../../src/sports/ui';
import { shortCode, ticketCount, ticketQr } from '../../src/tickets/labels';
import { C, Card, H, Loading, P, s } from '../../src/ui';

/** After Stripe: wait (up to 20 seconds) for its webhook to mark the order paid. */
export function useOrderConfirmation(order: string | undefined, result: string | undefined, onPaid: () => void) {
  const [state, setState] = useState<'waiting' | 'paid' | 'cancelled' | 'slow' | null>(order ? 'waiting' : null);
  useEffect(() => {
    if (!order) return;
    if (result !== 'paid') { setState('cancelled'); cancelTicketOrder(order).catch(() => {}); return; }
    let tries = 0;
    const t = setInterval(async () => {
      tries += 1;
      const st = await ticketOrderStatus(order).catch(() => null);
      if (st?.status === 'paid') { clearInterval(t); setState('paid'); onPaid(); }
      else if (st?.status === 'cancelled' || tries >= 14) { clearInterval(t); setState(st?.status === 'cancelled' ? 'cancelled' : 'slow'); }
    }, 1500);
    return () => clearInterval(t);
  }, [order, result, onPaid]);
  return state;
}

export default function MyTickets() {
  const { order, result } = useLocalSearchParams<{ order?: string; result?: string }>();
  const [tickets, setTickets] = useState<MyTicket[] | null>(null);
  const [setup, setSetup] = useState<TicketSetup>({ stripe: false, apple: false, google: false });
  const load = useCallback(() => { myTickets().then(setTickets).catch((e) => { setTickets([]); Alert.alert('My Tickets', errorText(e)); }); }, []);
  useFocusEffect(useCallback(() => { load(); ticketSetup().then(setSetup); }, [load]));
  const confirming = useOrderConfirmation(order, result, load);

  const header = <Stack.Screen options={{ title: 'My Tickets' }} />;
  if (!tickets) return <>{header}<Loading /></>;
  const key = (t: MyTicket) => t.eventId ?? t.title;
  const events = [...new Map(tickets.map((t) => [key(t), t])).values()];

  return (
    <ScrollView style={s.screen} contentContainerStyle={s.pad} refreshControl={<RefreshControl refreshing={false} onRefresh={load} />}>
      {header}
      {confirming === 'waiting' && <Banner color={C.primary} icon="hourglass" text="Confirming your payment…" />}
      {confirming === 'paid' && <Banner color="#15803D" icon="checkmark-circle" text="Paid. Your tickets are below, and we sent you a notification." />}
      {confirming === 'slow' && <Banner color={C.primary} icon="time" text="Your payment is still being confirmed. Your tickets appear here in a minute; pull down to refresh." />}
      {confirming === 'cancelled' && <Banner color={C.muted} icon="close-circle" text="Payment cancelled. You weren't charged." />}

      {tickets.length === 0 && (
        <Card>
          <H>No tickets yet</H>
          <P muted>Tickets you buy for plays, games and concerts show here. Look for the Tickets button on an event in Activities.</P>
        </Card>
      )}
      {events.map((first) => {
        const mine = tickets.filter((t) => key(t) === key(first));
        return (
          <View key={key(first)} style={{ gap: 10 }}>
            <View style={{ padding: 14, borderRadius: 14, backgroundColor: NAVY, gap: 2 }}>
              <Text style={{ color: GOLD, fontSize: 12, fontWeight: '900', letterSpacing: 1 }}>{ticketCount(mine.length).toUpperCase()}</Text>
              <Text style={{ color: '#fff', fontSize: 18, fontWeight: '900' }}>{first.title}</Text>
              <Text style={{ color: '#fff', opacity: 0.9 }}>{[when(first.startsAt), first.location].filter(Boolean).join(' · ')}</Text>
              {first.cancelled && <Text style={{ color: '#FCA5A5', fontWeight: '800' }}>This event was cancelled. The school will be in touch about refunds.</Text>}
            </View>
            {mine.map((t, i) => <TicketCard key={t.id} t={t} n={i + 1} of={mine.length} setup={setup} />)}
          </View>
        );
      })}
    </ScrollView>
  );
}

function Banner({ color, icon, text }: { color: string; icon: React.ComponentProps<typeof Ionicons>['name']; text: string }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12, borderRadius: 12, backgroundColor: color + '14', borderWidth: 1, borderColor: color + '55' }}>
      <Ionicons name={icon} size={22} color={color} />
      <Text style={{ flex: 1, color: C.ink, fontWeight: '600' }}>{text}</Text>
    </View>
  );
}

/** One ticket: its QR code and short code, who it's for, and the Wallet buttons. */
function TicketCard({ t, n, of, setup }: { t: MyTicket; n: number; of: number; setup: TicketSetup }) {
  const [busy, setBusy] = useState(false);
  const used = !!t.admittedAt;
  const add = async (kind: 'apple' | 'google') => {
    setBusy(true);
    try { await Linking.openURL(await walletLink(t.id, kind)); } catch (e) { Alert.alert('Wallet', errorText(e)); } finally { setBusy(false); }
  };
  const apple = setup.apple && Platform.OS !== 'android', google = setup.google && Platform.OS !== 'ios';
  return (
    <Card style={{ alignItems: 'center', gap: 8, ...(used ? PAST_STYLE : null) }}>
      <View style={[s.row, { alignSelf: 'stretch', justifyContent: 'space-between' }]}>
        <Text style={{ fontSize: 16, fontWeight: '800', color: C.ink }}>{t.type}</Text>
        <Text style={{ color: C.muted, fontWeight: '600' }}>{of > 1 ? `Ticket ${n} of ${of}` : t.holder}</Text>
      </View>
      <QrCode value={ticketQr(t.code)} size={200} label={`Ticket QR code, ${t.type}`} />
      <Text selectable style={{ fontSize: 15, fontWeight: '800', letterSpacing: 2, color: C.ink }}>{shortCode(t.code)}</Text>
      {used ? <Text style={{ color: C.muted, fontWeight: '700' }}>Used at {clock(t.admittedAt!)}</Text>
        : <P muted>Show this at the door. It admits one person, once.</P>}
      {!used && (apple || google) && (
        <View style={[s.row, { gap: 8, flexWrap: 'wrap', justifyContent: 'center' }]}>
          {apple && <WalletButton label="Add to Apple Wallet" disabled={busy} onPress={() => add('apple')} />}
          {google && <WalletButton label="Save to Google Wallet" disabled={busy} onPress={() => add('google')} />}
        </View>
      )}
    </Card>
  );
}

function WalletButton({ label, onPress, disabled }: { label: string; onPress: () => void; disabled?: boolean }) {
  return (
    <Pressable onPress={onPress} disabled={disabled} accessibilityRole="button"
      style={({ pressed }) => [{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 16, paddingVertical: 10, borderRadius: 10,
        backgroundColor: '#000' }, (pressed || disabled) && { opacity: 0.7 }]}>
      <Ionicons name="wallet" size={18} color="#fff" />
      <Text style={{ color: '#fff', fontWeight: '700' }}>{label}</Text>
    </Pressable>
  );
}
