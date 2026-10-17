import { useCallback, useEffect, useState } from 'react';
import { FlatList, Linking, Platform, RefreshControl, Text, View } from 'react-native';
import { Stack, router, useFocusEffect } from 'expo-router';
import * as Notifications from 'expo-notifications';
import { myNotifications, session, type Notice, type Person } from '../src/api/connect';
import { notificationHref } from '../src/comms/inbox';
import { localNotifications } from '../src/comms/localInbox';
import { enablePush, pushStatus, type Permission } from '../src/comms/push';
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
 * ones this phone showed by itself (car line), newest first.
 */
export default function NotificationsScreen() {
  const [person, setPerson] = useState<Person | null | undefined>(undefined);
  const [items, setItems] = useState<Notice[]>([]);
  const [status, setStatus] = useState<{ permission: Permission; delivered: boolean } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      const p = await session();
      const [school, mine] = p && !p.pending ? await Promise.all([myNotifications(), localNotifications()]) : [[], []];
      const local: Notice[] = mine.map((n) => ({
        id: `local:${n.key}`, title: n.title, body: n.body, data: n.data, createdAt: n.showAt, status: 'sent', sentCount: 1, audience: 'device',
      }));
      setItems([...school, ...local].sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt)));
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
      ListHeaderComponent={<>{header}<PhoneStatus status={status} onChange={load} /></>}
      ListEmptyComponent={<Card><H>No notifications yet</H><P muted>New posts in your groups, messages from the school and updates from your apps will show up here.</P></Card>}
      renderItem={({ item: n }) => {
        const href = notificationHref(n.data);
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
