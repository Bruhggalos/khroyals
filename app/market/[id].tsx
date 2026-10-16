/**
 * A Marketplace item. Buyers call Dibs (take it as posted) or make an Offer and
 * answer the seller's counter. The seller sees everyone in line in the order
 * they responded, answers offers, selects a buyer whose price is agreed and
 * confirms; then both get a deal card to arrange the handoff at school.
 */
import { useCallback, useEffect, useState } from 'react';
import { Alert, Image, ScrollView, Text, View } from 'react-native';
import { Stack, router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import {
  getListing, marketAnswerCounter, marketAnswerOffer, marketCancelSale, marketComplete, marketDibs, marketOffer,
  marketPhotoUrls, marketRemove, marketSelect, marketWithdraw, myAccess, subscribeMarket,
  type Listing, type MarketLine, type Person,
} from '../../src/api/connect';
import { MarketGate } from '../../src/market/MarketGate';
import { ask, conditionLabel, inLine, money, nameOf, parseMoney, when } from '../../src/market/format';
import { Button, C, Card, Chip, Field, H, Loading, P, s } from '../../src/ui';

const GREEN = '#15803D';

export default function Item() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <MarketGate title="Marketplace">{(me) => <ItemView id={id} me={me} />}</MarketGate>;
}

function ItemView({ id, me }: { id: string; me: Person }) {
  const [data, setData] = useState<{ listing: Listing | null; lines: MarketLine[] } | null>(null);
  const [photo, setPhoto] = useState<string | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const d = await getListing(id).catch(() => ({ listing: null, lines: [] }));
    setData(d);
    const path = d.listing?.photoPath;
    if (path) setPhoto((await marketPhotoUrls([path]).catch(() => ({} as Record<string, string>)))[path] ?? null);
  }, [id]);
  useFocusEffect(useCallback(() => { load(); return subscribeMarket(load); }, [load]));
  useEffect(() => { myAccess().then((a) => setIsAdmin(!!a?.permissions.includes('groups.manage'))).catch(() => {}); }, []);

  const act = (fn: () => Promise<unknown>, after?: () => void) => {
    setBusy(true);
    fn().then(() => { after?.(); return load(); }).catch((e) => Alert.alert('Marketplace', e.message)).finally(() => setBusy(false));
  };

  if (!data) return <Loading />;
  const l = data.listing;
  if (!l || l.status === 'removed') {
    return <View style={[s.screen, s.pad]}><Card><P muted>This post isn't available anymore.</P></Card></View>;
  }
  const seller = l.sellerId === me.id;
  const buyer = l.buyerId === me.id;

  return (
    <ScrollView style={s.screen} contentContainerStyle={s.pad} keyboardShouldPersistTaps="handled">
      <Stack.Screen options={{ title: l.title }} />
      {photo
        ? <Image source={{ uri: photo }} style={{ width: '100%', aspectRatio: 4 / 3, borderRadius: 14 }} />
        : <View style={{ width: '100%', aspectRatio: 4 / 3, borderRadius: 14, backgroundColor: C.primary + '14', alignItems: 'center', justifyContent: 'center' }}>
            <Ionicons name="pricetag" size={56} color={C.primary} />
          </View>}
      <Text style={{ fontSize: 22, fontWeight: '800', color: C.ink }}>{l.title}</Text>
      <Text style={{ fontSize: 22, fontWeight: '800', color: C.primary }}>{money(l.priceCents)}</Text>
      <View style={[s.row, { flexWrap: 'wrap', gap: 6 }]}>
        <Chip label={conditionLabel(l.condition)} />
        <Chip label={l.quantity > 1 ? `${l.quantity} items` : '1 item'} color={C.muted} />
      </View>
      {!!l.description && <P>{l.description}</P>}
      <P muted>Posted by {seller ? 'you' : nameOf(l.sellerId)} · {when(l.createdAt)}</P>

      {(l.status === 'pending' || l.status === 'sold') && (seller || buyer)
        ? <Deal l={l} seller={seller} busy={busy} act={act} />
        : seller
          ? <SellerLine l={l} lines={data.lines} busy={busy} act={act} />
          : <BuyerPanel l={l} me={me} lines={data.lines} busy={busy} act={act} />}

      {isAdmin && !seller && (
        <Text style={{ color: C.danger, fontWeight: '600', marginTop: 8 }}
          onPress={() => ask('Remove this post?', "It comes down because it isn't a uniform or school-related item, and the seller is told why.", 'Remove',
            () => act(() => marketRemove(l.id), () => router.back()))}>
          Remove post (admin)
        </Text>
      )}
    </ScrollView>
  );
}

type Act = (fn: () => Promise<unknown>, after?: () => void) => void;

/** After the seller confirms: both sides arrange the handoff at school. */
function Deal({ l, seller, busy, act }: { l: Listing; seller: boolean; busy: boolean; act: Act }) {
  if (l.status === 'sold') {
    return <Card><H>Sold</H><P>{seller ? `Sold to ${nameOf(l.buyerId)} for ${money(l.saleCents!)}.` : `You bought this for ${money(l.saleCents!)}.`}</P></Card>;
  }
  return (
    <Card style={{ borderColor: GREEN, borderWidth: 2, gap: 10 }}>
      <H>{seller ? 'Sale pending' : "It's yours!"}</H>
      <P>{seller ? `You're selling to ${nameOf(l.buyerId)} for ${money(l.saleCents!)}.` : `${nameOf(l.sellerId)} chose you at ${money(l.saleCents!)}.`}</P>
      <P muted>Arrange the handoff at school, like at the car line or the front office. Payment is between the two of you.</P>
      {seller && (
        <Button label="Mark as sold" disabled={busy}
          onPress={() => ask('Mark as sold?', `${nameOf(l.buyerId)} has the item and you've been paid.`, 'Sold', () => act(() => marketComplete(l.id)))} />
      )}
      <Text style={{ color: C.danger, fontWeight: '600' }}
        onPress={() => ask('Cancel this sale?', 'The post opens again for everyone in line.', 'Cancel sale', () => act(() => marketCancelSale(l.id)))}>
        Cancel sale
      </Text>
    </Card>
  );
}

/** The seller's view: everyone in line, first come first, then select and confirm. */
function SellerLine({ l, lines, busy, act }: { l: Listing; lines: MarketLine[]; busy: boolean; act: Act }) {
  const [picked, setPicked] = useState<string | null>(null);
  const [counter, setCounter] = useState<{ lineId: string; text: string } | null>(null);
  const queue = lines.filter(inLine);
  const chosen = queue.find((x) => x.id === picked && x.status === 'agreed');

  const sendCounter = (x: MarketLine) => {
    const cents = parseMoney(counter?.text ?? '');
    if (cents == null) return Alert.alert('Counteroffer', 'Enter a price, like 12 or 12.50.');
    act(() => marketAnswerOffer(x.id, false, cents), () => setCounter(null));
  };

  return (
    <View style={{ gap: 10, marginTop: 6 }}>
      <H>People in line ({queue.length})</H>
      {queue.length === 0 && <P muted>No one yet. You'll get a notification when someone calls dibs or makes an offer.</P>}
      {queue.map((x, i) => {
        const on = picked === x.id;
        const price = x.status === 'agreed' ? `Agreed at ${money(x.agreedCents!)}`
          : x.status === 'offered' ? `Offered ${money(x.offerCents!)}`
          : `You countered at ${money(x.counterCents!)}. Waiting for ${nameOf(x.buyerId).split(' ')[0]}`;
        return (
          <Card key={x.id} onPress={x.status === 'agreed' ? () => setPicked(on ? null : x.id) : undefined}
            style={on ? { borderColor: C.primary, borderWidth: 2 } : undefined}>
            <View style={s.row}>
              <Text style={{ width: 30, fontSize: 16, fontWeight: '800', color: C.muted }}>#{i + 1}</Text>
              <View style={{ flex: 1 }}>
                <Text style={{ fontWeight: '700', color: C.ink }}>{nameOf(x.buyerId)}</Text>
                <P muted>{when(x.createdAt)}</P>
              </View>
              <Chip label={x.kind === 'dibs' ? 'DIBS' : 'OFFER'} color={x.kind === 'dibs' ? GREEN : C.accent} />
              {x.status === 'agreed' && <Ionicons name={on ? 'radio-button-on' : 'radio-button-off'} size={22} color={C.primary} />}
            </View>
            <Text style={{ color: C.ink, fontWeight: '600' }}>{price}</Text>
            {!!x.message && <P muted>“{x.message}”</P>}
            {x.status === 'offered' && (counter?.lineId === x.id ? (
              <View style={s.row}>
                <Field label="Your price ($)" placeholder="0.00" style={{ flex: 1, padding: 10 }} keyboardType="decimal-pad" autoFocus
                  value={counter.text} onChangeText={(text) => setCounter({ lineId: x.id, text })} />
                <Button label="Send" disabled={busy} onPress={() => sendCounter(x)} />
              </View>
            ) : (
              <View style={s.row}>
                <View style={{ flex: 1 }}><Button label={`Accept ${money(x.offerCents!)}`} disabled={busy} onPress={() => act(() => marketAnswerOffer(x.id, true))} /></View>
                <View style={{ flex: 1 }}><Button kind="ghost" label="Counter" onPress={() => setCounter({ lineId: x.id, text: '' })} /></View>
              </View>
            ))}
          </Card>
        );
      })}
      {queue.some((x) => x.status === 'agreed') && !chosen && <P muted>Tap someone whose price is agreed to choose them.</P>}
      {chosen && (
        <Button label={`Confirm ${nameOf(chosen.buyerId)} · ${money(chosen.agreedCents!)}`} disabled={busy}
          onPress={() => ask('Confirm buyer?',
            `Sell "${l.title}" to ${nameOf(chosen.buyerId)} for ${money(chosen.agreedCents!)}? The post closes to everyone else, and you two arrange the handoff at school.`,
            'Confirm', () => act(() => marketSelect(chosen.id), () => setPicked(null)))} />
      )}
      <Text style={{ color: C.danger, fontWeight: '600', marginTop: 6 }}
        onPress={() => ask('Take down this post?', 'It disappears from the Marketplace.', 'Take down', () => act(() => marketRemove(l.id), () => router.back()))}>
        Take down this post
      </Text>
    </View>
  );
}

/** A buyer's view: Dibs or Offer, then follow the offer through. */
function BuyerPanel({ l, me, lines, busy, act }: { l: Listing; me: Person; lines: MarketLine[]; busy: boolean; act: Act }) {
  const [offer, setOffer] = useState<{ price: string; note: string } | null>(null);
  if (l.status !== 'open') return <Card><P muted>This item isn't available anymore.</P></Card>;
  const mine = [...lines].reverse().find((x) => x.buyerId === me.id);
  const sellerFirst = nameOf(l.sellerId).split(' ')[0];

  if (mine && inLine(mine)) {
    const text = mine.status === 'countered' ? `${sellerFirst} countered at ${money(mine.counterCents!)}.`
      : mine.status === 'offered' ? `You offered ${money(mine.offerCents!)}. Waiting for ${sellerFirst}.`
      : mine.kind === 'dibs' ? `You called dibs at ${money(mine.agreedCents!)}. ${sellerFirst} will choose a buyer and confirm.`
      : `Price agreed at ${money(mine.agreedCents!)}. ${sellerFirst} will choose a buyer and confirm.`;
    return (
      <Card style={{ gap: 10 }}>
        <H>{mine.status === 'countered' ? 'Counteroffer' : "You're in line"}</H>
        <P>{text}</P>
        {mine.status === 'countered' && (
          <View style={s.row}>
            <View style={{ flex: 1 }}><Button label={`Accept ${money(mine.counterCents!)}`} disabled={busy} onPress={() => act(() => marketAnswerCounter(mine.id, true))} /></View>
            <View style={{ flex: 1 }}><Button kind="ghost" label="Decline" disabled={busy} onPress={() => act(() => marketAnswerCounter(mine.id, false))} /></View>
          </View>
        )}
        <Text style={{ color: C.danger, fontWeight: '600' }}
          onPress={() => ask('Leave the line?', `${sellerFirst} won't be able to choose you for this item.`, 'Leave', () => act(() => marketWithdraw(mine.id)))}>
          Leave the line
        </Text>
      </Card>
    );
  }

  const send = () => {
    const cents = parseMoney(offer?.price ?? '');
    if (cents == null) return Alert.alert('Offer', 'Enter a price, like 12 or 12.50.');
    act(() => marketOffer(l.id, cents, offer?.note ?? ''), () => setOffer(null));
  };

  return (
    <View style={{ gap: 10, marginTop: 6 }}>
      {mine?.status === 'declined' && <P muted>Your last offer didn't work out. You can try again.</P>}
      <Button label={`Dibs · ${money(l.priceCents)}`} disabled={busy}
        onPress={() => ask('Call dibs?', `Dibs means you'll take it as posted for ${money(l.priceCents)}. ${sellerFirst} sees who responded first and confirms a buyer.`,
          'Dibs', () => act(() => marketDibs(l.id)))} />
      {offer ? (
        <Card style={{ gap: 8 }}>
          <Field label="Your offer ($)" placeholder="0.00" keyboardType="decimal-pad" autoFocus
            value={offer.price} onChangeText={(price) => setOffer({ ...offer, price })} />
          <Field label="Note to the seller (optional)" placeholder="e.g. Can pick up Friday" maxLength={300}
            value={offer.note} onChangeText={(note) => setOffer({ ...offer, note })} />
          <View style={s.row}>
            <View style={{ flex: 1 }}><Button label="Send offer" disabled={busy} onPress={send} /></View>
            <View style={{ flex: 1 }}><Button kind="ghost" label="Cancel" onPress={() => setOffer(null)} /></View>
          </View>
        </Card>
      ) : (
        <Button kind="ghost" label="Make an offer" onPress={() => setOffer({ price: '', note: '' })} />
      )}
    </View>
  );
}
