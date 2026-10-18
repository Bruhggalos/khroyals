/**
 * One post's numbers, for its author and the group's moderators: how many of
 * the group saw it, views, reactions, replies, poll votes, followers, push
 * opens, views per day and who has seen it.
 */
import { useCallback, useState } from 'react';
import { RefreshControl, ScrollView, Text, View } from 'react-native';
import { Stack, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { postStats, type PostStats } from '../../src/api/connect';
import { Tile, pct } from '../../src/comms/StatTile';
import { Button, C, Card, H, Loading, P, s } from '../../src/ui';

const when = (iso: string) => new Date(iso).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });

export default function PostStatsScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [st, setSt] = useState<PostStats | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const load = useCallback(() => postStats(id).then((x) => { setSt(x); setError(null); }).catch((e) => setError(e.message)), [id]);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  const header = <Stack.Screen options={{ title: 'Post stats' }} />;
  if (error) return <View style={[s.screen, s.pad]}>{header}<Card><P>{error}</P><Button label="Try again" onPress={load} /></Card></View>;
  if (!st) return <>{header}<Loading /></>;

  const reactions = Object.entries(st.reactions);
  const reactionTotal = reactions.reduce((n, [, c]) => n + c, 0);
  const maxDay = Math.max(1, ...st.byDay.map((d) => d.viewers));

  return (
    <ScrollView style={s.screen} contentContainerStyle={s.pad}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={async () => { setRefreshing(true); await load(); setRefreshing(false); }} tintColor={C.primary} />}>
      {header}
      <Card>
        <Text style={{ fontWeight: '800', fontSize: 17, color: C.ink }}>{st.title || 'Untitled post'}</Text>
        <P muted>Posted {when(st.createdAt)}</P>
      </Card>

      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
        <Tile value={`${pct(st.viewers, st.audience)}%`} label="Seen" hint={`${st.viewers} of ${st.audience} members`} />
        <Tile value={st.views} label="Views" hint="Including repeat views" />
        <Tile value={reactionTotal} label="Reactions" hint={reactions.map(([e, c]) => `${e} ${c}`).join('  ') || 'None yet'} />
        <Tile value={st.replies} label="Replies" hint={`From ${st.repliers} ${st.repliers === 1 ? 'person' : 'people'}`} />
        {st.pollVotes > 0 && <Tile value={st.pollVotes} label="Poll votes" />}
        <Tile value={st.followers} label="Following" hint="Get reply notifications" />
        <Tile value={st.notificationOpens} label="Opened the notification" hint={`Sent to ${st.pushDevices} ${st.pushDevices === 1 ? 'phone' : 'phones'}`} />
      </View>

      {st.byDay.length > 0 && (
        <Card>
          <H>New viewers by day</H>
          {st.byDay.map((d) => (
            <View key={d.day} style={[s.row, { gap: 8 }]}>
              <Text style={{ width: 64, color: C.muted, fontSize: 13 }}>
                {new Date(`${d.day}T12:00:00`).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
              </Text>
              <View style={{ flex: 1, height: 14, backgroundColor: C.line, borderRadius: 7, overflow: 'hidden' }}>
                <View style={{ width: `${(d.viewers / maxDay) * 100}%`, height: '100%', backgroundColor: C.primary, borderRadius: 7 }} />
              </View>
              <Text style={{ width: 32, textAlign: 'right', color: C.ink, fontWeight: '600' }}>{d.viewers}</Text>
            </View>
          ))}
        </Card>
      )}

      <Card>
        <H>Seen by</H>
        {st.seenBy.length === 0 ? <P muted>Nobody yet. Views are counted when the post is on someone's screen.</P>
          : st.seenBy.map((v, i) => (
            <View key={i} style={[s.row, { justifyContent: 'space-between', paddingVertical: 4, borderTopWidth: i ? 1 : 0, borderTopColor: C.line }]}>
              <Text style={{ color: C.ink, flex: 1 }}>{v.name || 'Someone'} <Text style={{ color: C.muted }}>· {v.role}</Text></Text>
              <Text style={{ color: C.muted, fontSize: 13 }}>{when(v.at)}</Text>
            </View>
          ))}
        {st.viewers > st.seenBy.length && <P muted>And {st.viewers - st.seenBy.length} more.</P>}
      </Card>
    </ScrollView>
  );
}
