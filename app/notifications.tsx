import { useCallback, useState } from 'react';
import { FlatList, RefreshControl, Text, View } from 'react-native';
import { Stack, router, useFocusEffect } from 'expo-router';
import { myNotifications, session, type Notice, type Person } from '../src/api/connect';
import { Button, C, Card, H, Loading, P, s } from '../src/ui';

/** "5 min ago", "3 h ago", "2 d ago", then the date. */
function timeAgo(iso: string) {
  const mins = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins} min ago`;
  if (mins < 24 * 60) return `${Math.floor(mins / 60)} h ago`;
  if (mins < 7 * 24 * 60) return `${Math.floor(mins / (24 * 60))} d ago`;
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

/** The signed-in person's notifications: new posts in their groups, announcements and school-wide messages. */
export default function Notifications() {
  const [person, setPerson] = useState<Person | null | undefined>(undefined);
  const [items, setItems] = useState<Notice[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      const p = await session();
      setItems(p && !p.pending ? await myNotifications() : []);
      setPerson(p);
      setError(null);
    } catch (e: any) {
      setError(e.message ?? String(e));
    }
  }, []);
  useFocusEffect(useCallback(() => { load(); }, [load]));
  const refresh = async () => { setRefreshing(true); await load(); setRefreshing(false); };

  const header = <Stack.Screen options={{ title: 'Notifications' }} />;
  if (error) return (
    <View style={[s.screen, s.pad]}>{header}
      <Card><H>Couldn't load notifications</H><P muted>{error}</P><Button label="Try again" onPress={load} /></Card>
    </View>
  );
  if (person === undefined) return <>{header}<Loading /></>;
  if (!person) return (
    <View style={[s.screen, s.pad]}>{header}
      <Card>
        <H>Sign in to see your notifications</H>
        <P muted>New posts in your groups, announcements and messages from the school show up here once you're signed in to Royals Connect.</P>
        <Button label="Sign in" onPress={() => router.navigate('/connect')} />
      </Card>
    </View>
  );
  if (person.pending) return (
    <View style={[s.screen, s.pad]}>{header}
      <Card><H>Waiting for approval</H><P muted>Your notifications will appear here once the school office approves your account.</P></Card>
    </View>
  );

  return (
    <FlatList
      style={s.screen} contentContainerStyle={s.pad} data={items} keyExtractor={(n) => n.id}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={C.primary} />}
      ListHeaderComponent={header}
      ListEmptyComponent={<Card><H>No notifications yet</H><P muted>New posts in your groups and messages from the school will show up here.</P></Card>}
      renderItem={({ item: n }) => {
        const groupId = n.data?.groupId as string | undefined;
        const listingId = n.data?.listingId as string | undefined;
        const opportunityId = n.data?.opportunityId as string | undefined;
        const href = listingId ? `/market/${listingId}` : opportunityId ? `/volunteer/${opportunityId}`
          : groupId ? `/group/${groupId}` : null;
        return (
          <Card onPress={href ? () => router.push(href) : undefined}>
            <View style={[s.row, { justifyContent: 'space-between', alignItems: 'flex-start' }]}>
              <Text style={{ flex: 1, fontWeight: '700', color: C.ink }}>{n.title}</Text>
              <Text style={{ fontSize: 13, color: C.muted }}>{timeAgo(n.createdAt)}</Text>
            </View>
            <P>{n.body}</P>
          </Card>
        );
      }}
    />
  );
}
