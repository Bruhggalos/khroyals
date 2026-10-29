/** Marketplace: items for sale, your posts, and what you're buying, two to a row with the price and title under each photo. */
import { useCallback, useState } from 'react';
import { Alert, FlatList, Image, Pressable, Text, View } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { listMarket, marketPhotoUrls, marketRemove, subscribeMarket, type Listing, type MarketLine, type Person } from '../../src/api/connect';
import { MarketGate } from '../../src/market/MarketGate';
import { conditionLabel, deleteWarning, inLine, money } from '../../src/market/format';
import { Button, C, Card, Loading, P, ask, s, useContentWidth } from '../../src/ui';

type Tab = 'shop' | 'selling' | 'buying';
const GAP = 12;

export default function Market() {
  return <MarketGate title="Marketplace">{(me) => <Browse me={me} />}</MarketGate>;
}

function Browse({ me }: { me: Person }) {
  const [data, setData] = useState<{ listings: Listing[]; lines: MarketLine[] } | null>(null);
  const [photos, setPhotos] = useState<Record<string, string>>({});
  const [tab, setTab] = useState<Tab>('shop');
  const tile = Math.floor((useContentWidth() - GAP) / 2);  // two across the page column

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
      numColumns={2} columnWrapperStyle={{ gap: GAP }}
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
        <Pressable onPress={() => router.push(`/market/${l.id}`)} accessibilityRole="button" accessibilityLabel={`${l.title}, ${money(l.priceCents)}`}
          style={({ pressed }) => ({ width: tile, borderRadius: 12, overflow: 'hidden', backgroundColor: C.card, borderWidth: 1, borderColor: C.line,
            opacity: pressed ? 0.85 : 1 })}>
          <View>
            {l.photoPath && photos[l.photoPath]
              ? <Image source={{ uri: photos[l.photoPath] }} style={{ width: tile, height: tile }} resizeMode="cover" />
              : <View style={{ width: tile, height: tile, backgroundColor: C.primary + '14', alignItems: 'center', justifyContent: 'center' }}>
                  <Ionicons name="pricetag" size={36} color={C.primary} />
                </View>}
            {l.sellerId === me.id && (
              <Pressable hitSlop={8} accessibilityRole="button" accessibilityLabel={`Delete ${l.title}`}
                onPress={() => ask('Delete this post?', deleteWarning(l), 'Delete',
                  () => marketRemove(l.id).then(load).catch((e) => Alert.alert('Marketplace', e.message)))}
                style={{ position: 'absolute', top: 8, right: 8, width: 34, height: 34, borderRadius: 17, backgroundColor: '#fff',
                  alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: C.line }}>
                <Ionicons name="trash-outline" size={18} color={C.danger} />
              </Pressable>
            )}
          </View>
          <View style={{ padding: 10, gap: 2 }}>
            <Text style={{ fontSize: 17, fontWeight: '800', color: C.ink }}>{money(l.priceCents)}</Text>
            <Text numberOfLines={2} style={{ fontSize: 15, color: C.ink }}>{l.title}</Text>
            <Text numberOfLines={2} style={{ fontSize: 12, color: C.muted }}>{note(l)}</Text>
          </View>
        </Pressable>
      )} />
  );
}
