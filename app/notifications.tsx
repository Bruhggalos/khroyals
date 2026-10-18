import { useCallback, useEffect, useState } from 'react';
import { Alert, FlatList, Linking, Platform, Pressable, RefreshControl, Text, View } from 'react-native';
import { Stack, router, useFocusEffect } from 'expo-router';
import * as Notifications from 'expo-notifications';
import { clearMyNotifications, dismissNotifications, markNotificationsOpened, myNotifications, openedNotifications, session, type Notice, type Person } from '../src/api/connect';
import { notificationHref } from '../src/comms/inbox';
import { clearLocalNotifications, dismissLocal, localNotifications } from '../src/comms/localInbox';
import { enablePush, pushStatus, type Permission } from '../src/comms/push';
import { SwipeToDelete } from '../src/comms/SwipeToDelete';
import { Button, C, Card, H, Loading, P, s } from '../src/ui';

/** The phone's own notifications (car line) are listed with ids like "local:<key>"; the rest are the school's. */
const LOCAL = 'local:';
const isLocal = (id: string) => id.startsWith(LOCAL);

/** "5 min ago", "3 h ago", "2 d ago", then the date. */
function timeAgo(iso: string) {
  const mins = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins} min ago`;
  if (mins < 24 * 60) return `${Math.floor(mins / 60)} h ago`;
  if (mins < 7 * 24 * 60) return `${Math.floor(mins / (24 * 60))} d ago`;
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

/** Whether this phone shows notifications, with the way to turn them on. Nothing when all is well. */
function PhoneStatus({ status, onChange }: { status: { permission: Permission; delivered: boolean } | null; onChange: () => void }) {
  if (!status || status.permission === 'unsupported') return null;
  if (status.permission === 'undetermined') return (
    <Card>
      <H>Get notifications on this phone</H>
      <P muted>Find out about new posts, Marketplace offers, volunteer sign-ups, answers from the school and car line check-ins as they happen.</P>
      <Button label="Turn on notifications" onPress={() => enablePush().finally(onChange)} />
    </Card>
  );
  if (status.permission === 'denied') return (
    <Card>
      <H>Notifications are off</H>
      <P muted>KH Royals can't alert you on this phone. Everything still shows up here. To turn alerts on, allow notifications for KH Royals in Settings.</P>
      <Button label="Open Settings" kind="ghost" onPress={() => Linking.openSettings()} />
    </Card>
  );
  if (!status.delivered) return (
    <P muted>This build can't receive the school's push alerts yet, so check here for them. Car line alerts still show on the phone.</P>
  );
  return null;
}

/**
 * Everything sent to the signed-in person: the school's notifications (posts in
 * their groups, announcements, Marketplace, Volunteer, Ask the School) and the
 * ones this phone showed by itself (car line), newest first. New ones are marked;
 * swipe or tap ✕ to delete one, or clear them all.
 */
export default function NotificationsScreen() {
  const [person, setPerson] = useState<Person | null | undefined>(undefined);
  const [items, setItems] = useState<Notice[]>([]);
  const [opened, setOpened] = useState<Set<string>>(new Set());
  const [status, setStatus] = useState<{ permission: Permission; delivered: boolean } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      const p = await session();
      const [school, mine] = p && !p.pending ? await Promise.all([myNotifications(), localNotifications()]) : [[], []];
      const local: Notice[] = mine.map((n) => ({
        id: `${LOCAL}${n.key}`, title: n.title, body: n.body, data: n.data, createdAt: n.showAt, status: 'sent', sentCount: 1, audience: 'device',
      }));
      setItems([...school, ...local].sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt)));
      // Show what's new this visit, then count the school's as opened (senders see the totals).
      // The phone's own were seen as banners, so they don't get the "new" mark.
      const ids = school.map((n) => n.id);
      const seen = await openedNotifications(ids).catch(() => new Set<string>());
      local.forEach((n) => seen.add(n.id));
      setOpened(seen);
      markNotificationsOpened(ids).catch(() => {});
      setPerson(p);
      setStatus(await pushStatus().catch(() => null));
      setError(null);
    } catch (e: any) {
      setError(e.message ?? String(e));
    }
  }, []);
  useFocusEffect(useCallback(() => { load(); }, [load]));
  // A notification arriving while this page is open joins the list.
  useEffect(() => {
    if (Platform.OS === 'web') return;
    const sub = Notifications.addNotificationReceivedListener(() => { setTimeout(load, 500); });
    return () => sub.remove();
  }, [load]);
  const refresh = async () => { setRefreshing(true); await load(); setRefreshing(false); };

  const remove = (id: string) => {
    setItems((list) => list.filter((n) => n.id !== id));
    const gone = isLocal(id) ? dismissLocal(id.slice(LOCAL.length)) : dismissNotifications([id]);
    gone.catch((e) => { Alert.alert('Notifications', e.message); load(); });
  };
  const clearAll = () => {
    const go = () => {
      setItems([]);
      Promise.all([clearMyNotifications(), clearLocalNotifications()])
        .catch((e) => { Alert.alert('Notifications', e.message); load(); });
    };
    if (Platform.OS === 'web') { if (globalThis.confirm?.('Clear all notifications?')) go(); return; }
    Alert.alert('Clear all notifications?', 'They\'re removed from your list. This can\'t be undone.', [
      { text: 'Cancel', style: 'cancel' }, { text: 'Clear all', style: 'destructive', onPress: go },
    ]);
  };

  const header = <Stack.Screen options={{
    title: 'Notifications',
    headerRight: items.length ? () => (
      <Pressable onPress={clearAll} hitSlop={8} accessibilityRole="button" accessibilityLabel="Clear all notifications" style={{ marginRight: 8 }}>
        <Text style={{ color: '#fff', fontWeight: '700' }}>Clear all</Text>
      </Pressable>
    ) : undefined,
  }} />;
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
      ListHeaderComponent={<>{header}<PhoneStatus status={status} onChange={load} />
        {items.length > 0 && <P muted>Swipe a notification sideways (or tap ✕) to delete it.</P>}</>}
      ListEmptyComponent={<Card><H>No notifications yet</H><P muted>New posts in your groups, messages from the school and updates from your apps will show up here.</P></Card>}
      renderItem={({ item: n }) => {
        const href = notificationHref(n.data);
        return (
          <SwipeToDelete onDelete={() => remove(n.id)}>
          <Card onPress={href ? () => router.push(href) : undefined}
            style={opened.has(n.id) ? undefined : { borderColor: C.primary, borderLeftWidth: 4 }}>
            <View style={[s.row, { justifyContent: 'space-between', alignItems: 'flex-start' }]}>
              {!opened.has(n.id) && <View accessibilityLabel="New" style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: C.primary, marginTop: 6 }} />}
              <Text style={{ flex: 1, fontWeight: '700', color: C.ink }}>{n.title}</Text>
              <Text style={{ fontSize: 13, color: C.muted }}>{timeAgo(n.createdAt)}</Text>
              <Pressable onPress={() => remove(n.id)} hitSlop={10} accessibilityRole="button" accessibilityLabel={`Delete notification: ${n.title}`}>
                <Text style={{ fontSize: 16, color: C.muted, paddingLeft: 4 }}>✕</Text>
              </Pressable>
            </View>
            <P>{n.body}</P>
          </Card>
          </SwipeToDelete>
        );
      }}
    />
  );
}
