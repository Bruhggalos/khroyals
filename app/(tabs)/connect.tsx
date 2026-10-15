import { useState } from 'react';
import { Image, ScrollView, Text, View } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { useCallback } from 'react';
import { listMyGroups, listUsers, me, setCurrentUser } from '../../src/api/mockApi';
import { MODE_LABELS } from '../../src/comms/presets';
import { canCreateGroup } from '../../src/comms/permissions';
import { Button, C, Card, Chip, Loading, P, s, useLoad } from '../../src/ui';

/** Test switcher: view the app as any mock user to verify permissions. */
const TEST_USERS = ['u-admin', 'u-eng', 'u-vbcoach', 'u-s01', 'u-s08', 'u-p01'];

export default function Connect() {
  const [who, setWho] = useState(me().id);
  const { data: users } = useLoad(listUsers);
  const { data: groups, reload } = useLoad(listMyGroups, [who]);
  useFocusEffect(useCallback(() => reload(), []));
  if (!groups || !users) return <Loading />;
  const u = me();

  return (
    <ScrollView style={s.screen} contentContainerStyle={s.pad}>
      <Text style={{ fontSize: 12, fontWeight: '700', color: C.muted }}>VIEWING AS (TEST)</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6 }}>
        {TEST_USERS.map((id) => {
          const x = users.find((y) => y.id === id)!;
          const on = id === who;
          return (
            <Text key={id} onPress={() => { setCurrentUser(id); setWho(id); }}
              style={{ paddingHorizontal: 10, paddingVertical: 6, borderRadius: 999, overflow: 'hidden', borderWidth: 1, borderColor: C.line,
                backgroundColor: on ? C.primary : '#fff', color: on ? '#fff' : C.ink }}>
              {x.firstName} · {x.schoolRole}
            </Text>
          );
        })}
      </ScrollView>

      {canCreateGroup(u) && <Button label="+ New group" onPress={() => router.push('/group/new')} />}

      {groups.map((g) => (
        <Card key={g.id} onPress={() => router.push(`/group/${g.id}`)} style={{ flexDirection: 'row', gap: 12, alignItems: 'center' }}>
          <View style={{ width: 44, height: 44, borderRadius: 12, backgroundColor: g.color + '22', alignItems: 'center', justifyContent: 'center' }}>
            <Text style={{ fontSize: 22 }}>{g.icon}</Text>
          </View>
          <View style={{ flex: 1, gap: 3 }}>
            <Text style={{ fontWeight: '700', color: C.ink }}>{g.name}{g.settings.locked ? '  🔒' : ''}</Text>
            <P muted>{g.description}</P>
            <View style={s.row}><Chip label={MODE_LABELS[g.settings.mode].title} color={g.color} /><Chip label={g.settings.visibility} color={C.muted} /></View>
          </View>
        </Card>
      ))}
    </ScrollView>
  );
}
