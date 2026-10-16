/** Marketplace: items for sale, your posts, and what you're buying. */
import { useCallback, useState } from 'react';
import { FlatList, Image, Text, View } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { listMarket, marketPhotoUrls, subscribeMarket, type Listing, type MarketLine, type Person } from '../../src/api/connect';
import { MarketGate } from '../../src/market/MarketGate';
import { conditionLabel, inLine, money } from '../../src/market/format';
import { Button, C, Card, Loading, P, s } from '../../src/ui';

type Tab = 'shop' | 'selling' | 'buying';

export default function Market() {
  return <MarketGate title="Marketplace">{(me) => <Browse me={me} />}</MarketGate>;
}

function Browse({ me }: { me: Person }) {
  const [data, setData] = useState<{ listings: Listing[]; lines: MarketLine[] } | null>(null);
  const [photos, setPhotos] = useState<Record<string, string>>({});
  const [tab, setTab] = useState<Tab>('shop');

  const load = useCallback(async () => {
    const d = await listMarket().catch(() => ({ listings: [], lines: [] }));
    setData(d);
    const paths = d.listings.flatMap((l) => (l.photoPath ? [l.photoPath] : []));
    if (paths.length) setPhotos(await marketPhotoUrls(paths).catch(() => ({})));
  }, []);
  useFocusEffect(useCallback(() => { load(); return subscribeMarket(load); }, [load]));
  if (!data) return <Loading />;

  const myLine = (l: Listing) => [...data.lines].reverse().find((x) => x.listingId === l.id && x.buyerId === me.id);
  const lists: Record<Tab, Listing[]> = {
    shop: data.listings.filter((l) => l.status === 'open' && l.sellerId !== me.id),
    selling: data.listings.filter((l) => l.sellerId === me.id),
    buying: data.listings.filter((l) => l.sellerId !== me.id && (l.buyerId === me.id || !!myLine(l)?.status.match(/agreed|offered|countered/))),
  };

  const note = (l: Listing): string => {
    if (tab === 'selling') {
      if (l.status === 'pending') return 'Sale pending: arrange the handoff';
      if (l.status === 'sold') return 'Sold';
      const n = data.lines.filter((x) => x.listingId === l.id && inLine(x)).length;
      return n ? `${n} in line` : 'No one in line yet';
    }
    if (tab === 'buying') {
      if (l.buyerId === me.id) return l.status === 'sold' ? 'Bought' : "It's yours: arrange the handoff";
      if (l.status !== 'open') return 'No longer available';
      const x = myLine(l)!;
      if (x.status === 'countered') return `Counteroffer: ${money(x.counterCents!)}. Tap to answer`;
      if (x.status === 'offered') return `You offered ${money(x.offerCents!)}`;
      return x.kind === 'dibs' ? 'You called dibs' : `Price agreed: ${money(x.agreedCents!)}`;
    }
    return `${conditionLabel(l.condition)}${l.quantity > 1 ? ` · ${l.quantity} items` : ''}`;
  };

  const empty: Record<Tab, string> = {
    shop: 'Nothing for sale right now. Have outgrown uniforms? Sell them here.',
    selling: "You haven't posted anything yet.",
    buying: "When you call dibs or make an offer, it shows up here.",
  };

  return (
    <FlatList style={s.screen} contentContainerStyle={s.pad} data={lists[tab]} keyExtractor={(l) => l.id}
      ListHeaderComponent={
        <View style={{ gap: 12 }}>
          <Button label="+ Sell an item" onPress={() => router.push('/market/new')} />
          <View style={[s.row, { gap: 6 }]}>
            {(['shop', 'selling', 'buying'] as Tab[]).map((t) => (
              <Text key={t} onPress={() => setTab(t)}
                style={{ paddingHorizontal: 12, paddingVertical: 6, borderRadius: 999, overflow: 'hidden', borderWidth: 1, borderColor: C.line,
                  backgroundColor: tab === t ? C.primary : '#fff', color: tab === t ? '#fff' : C.ink, fontWeight: '600' }}>
                {{ shop: 'For sale', selling: 'Selling', buying: 'Buying' }[t]} ({lists[t].length})
              </Text>
            ))}
          </View>
        </View>}
      ListEmptyComponent={<Card><P muted>{empty[tab]}</P></Card>}
      renderItem={({ item: l }) => (
        <Card onPress={() => router.push(`/market/${l.id}`)} style={{ flexDirection: 'row', gap: 12, alignItems: 'center' }}>
          {l.photoPath && photos[l.photoPath]
            ? <Image source={{ uri: photos[l.photoPath] }} style={{ width: 76, height: 76, borderRadius: 10 }} />
            : <View style={{ width: 76, height: 76, borderRadius: 10, backgroundColor: C.primary + '14', alignItems: 'center', justifyContent: 'center' }}>
                <Ionicons name="pricetag" size={28} color={C.primary} />
              </View>}
          <View style={{ flex: 1, gap: 2 }}>
            <Text numberOfLines={2} style={{ fontSize: 16, fontWeight: '700', color: C.ink }}>{l.title}</Text>
            <Text style={{ fontSize: 16, fontWeight: '800', color: C.primary }}>{money(l.priceCents)}</Text>
            <P muted>{note(l)}</P>
          </View>
        </Card>
      )} />
  );
}
