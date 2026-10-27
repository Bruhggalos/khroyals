/** A group's recent posts with their numbers, for the group's moderators. */
import { useCallback, useState } from 'react';
import { FlatList, RefreshControl, Text, View } from 'react-native';
import { Stack, router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { errorText, groupPostStats, type GroupPostStat } from '../../../src/api/connect';
import { Button, C, Card, Loading, P, s } from '../../../src/ui';
import { Tile, pct } from '../../../src/comms/StatTile';

export default function GroupStats() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [rows, setRows] = useState<GroupPostStat[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const load = useCallback(() => groupPostStats(id).then((r) => { setRows(r); setError(null); }).catch((e) => setError(errorText(e))), [id]);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  const header = <Stack.Screen options={{ title: 'Group stats' }} />;
  if (error) return <View style={[s.screen, s.pad]}>{header}<Card><P>{error}</P><Button label="Try again" onPress={load} /></Card></View>;
  if (!rows) return <>{header}<Loading /></>;

  const reach = rows.length ? Math.round(rows.reduce((n, r) => n + pct(r.viewers, r.audience), 0) / rows.length) : 0;
  return (
    <FlatList
      style={s.screen} contentContainerStyle={s.pad} data={rows} keyExtractor={(r) => r.postId}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={async () => { setRefreshing(true); await load(); setRefreshing(false); }} tintColor={C.primary} />}
      ListHeaderComponent={
        <View style={{ gap: 10 }}>
          {header}
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
            <Tile value={rows.length} label="Posts" hint="Most recent 100" />
            <Tile value={`${reach}%`} label="Average seen" hint="Share of members who saw each post" />
            <Tile value={rows.reduce((n, r) => n + r.replies, 0)} label="Replies" />
          </View>
          <P muted>Tap a post for details and who has seen it.</P>
        </View>}
      ListEmptyComponent={<P muted>No posts yet.</P>}
      renderItem={({ item: r }) => (
        <Card onPress={() => router.push(`/post-stats/${r.postId}`)}>
          <Text style={{ fontWeight: '700', color: C.ink }} numberOfLines={2}>{r.title || 'Untitled post'}</Text>
          <P muted>{r.author} · {new Date(r.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</P>
          <View style={{ height: 8, backgroundColor: C.line, borderRadius: 4, overflow: 'hidden' }}>
            <View style={{ width: `${pct(r.viewers, r.audience)}%`, height: '100%', backgroundColor: C.primary }} />
          </View>
          <Text style={{ color: C.ink, fontSize: 13 }}>
            👁 {r.viewers} of {r.audience} ({pct(r.viewers, r.audience)}%)   👍 {r.reactions}   💬 {r.replies}
          </Text>
        </Card>
      )}
    />
  );
}
