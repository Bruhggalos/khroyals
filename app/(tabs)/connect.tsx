import { useCallback, useEffect, useState } from 'react';
import { Alert, Pressable, ScrollView, Text, View } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import {
  joinGroup, listDiscoverableGroups, listMyGroups, listUsers, live, myAccess, onAuthChange, session, setMockUser, signOut,
  type Person,
} from '../../src/api/connect';
import { disableAutoCheckIn } from '../../src/carline/autoCheckIn';
import { disablePush } from '../../src/comms/push';
import { MODE_LABELS } from '../../src/comms/presets';
import { canCreateGroup } from '../../src/comms/permissions';
import { SignIn } from '../../src/comms/SignIn';
import type { Group } from '../../src/comms/types';
import { Avatar, Button, C, Card, Chip, Loading, P, s } from '../../src/ui';

/** Demo-data mode: view the app as any demo person to check permissions. */
const TEST_USERS = ['u-admin', 'u-eng', 'u-vbcoach', 'u-s01', 'u-s08', 'u-p01'];

function GroupRow({ g, onPress, action }: { g: Group; onPress?: () => void; action?: React.ReactNode }) {
  return (
    <Card onPress={onPress} style={{ flexDirection: 'row', gap: 12, alignItems: 'center' }}>
      <View style={{ width: 44, height: 44, borderRadius: 12, backgroundColor: g.color + '22', alignItems: 'center', justifyContent: 'center' }}>
        <Text style={{ fontSize: 22 }}>{g.icon}</Text>
      </View>
      <View style={{ flex: 1, gap: 3 }}>
        <Text style={{ fontWeight: '700', color: C.ink }}>{g.name}{g.settings.locked ? '  🔒' : ''}</Text>
        {!!g.description && <P muted>{g.description}</P>}
        <View style={s.row}><Chip label={MODE_LABELS[g.settings.mode].title} color={g.color} /><Chip label={g.settings.visibility} color={C.muted} /></View>
      </View>
      {action}
    </Card>
  );
}

export default function Connect() {
  const [ready, setReady] = useState(false);
  const [person, setPerson] = useState<Person | null>(null);
  const [groups, setGroups] = useState<Group[] | null>(null);
  const [discover, setDiscover] = useState<Group[]>([]);
  const [people, setPeople] = useState<Person[]>([]);
  const [isAdmin, setIsAdmin] = useState(false);

  const load = useCallback(async () => {
    try {
      const p = await session();
      setPerson(p);
      if (p && !p.pending) {
        setGroups(await listMyGroups());
        setDiscover(await listDiscoverableGroups());
        if (!live) setPeople(await listUsers());
        const a = live ? await myAccess() : null;
        setIsAdmin(!!a && (!!a.tier || a.granted.length > 0));
      }
    } catch (e: any) {
      Alert.alert('Could not load groups', e.message);
    } finally {
      setReady(true);
    }
  }, []);

  useEffect(() => onAuthChange(load), [load]);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  if (!ready) return <Loading />;
  if (live && !person) return <SignIn onDone={load} />;
  if (person?.pending) {
    return (
      <View style={[s.screen, s.pad]}>
        <Card>
          <Text style={{ fontWeight: '800', fontSize: 17, color: C.ink }}>Waiting for approval</Text>
          <P>Thanks, {person.firstName || person.email}. A Kingdom Heights administrator will confirm your account and add you to your groups.</P>
          <Button kind="ghost" label="Sign out" onPress={() => disablePush().then(disableAutoCheckIn).then(signOut).then(load)} />
        </Card>
      </View>
    );
  }
  if (!groups || !person) return <Loading />;

  return (
    <ScrollView style={s.screen} contentContainerStyle={s.pad}>
      {live ? (
        <View style={[s.row, { justifyContent: 'space-between' }]}>
          <Pressable onPress={() => router.push('/profile')} accessibilityRole="button" accessibilityLabel="My profile"
            style={[s.row, { flex: 1 }]}>
            <Avatar person={person} size={40} />
            <View style={{ flex: 1 }}>
              <Text style={{ fontWeight: '700', color: C.ink }}>{person.firstName} {person.lastName}</Text>
              <P muted>{person.schoolRole} · My profile & notifications ›</P>
            </View>
          </Pressable>
          <Text style={{ color: C.primary, fontWeight: '600' }} onPress={() => disablePush().then(disableAutoCheckIn).then(signOut).then(load)}>Sign out</Text>
        </View>
      ) : (
        <>
          <Text style={{ fontSize: 12, fontWeight: '700', color: C.muted }}>VIEWING AS (DEMO DATA)</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6 }}>
            {TEST_USERS.map((id) => {
              const x = people.find((y) => y.id === id);
              if (!x) return null;
              const on = id === person.id;
              return (
                <Text key={id} onPress={() => { setMockUser(id); load(); }}
                  style={{ paddingHorizontal: 10, paddingVertical: 6, borderRadius: 999, overflow: 'hidden', borderWidth: 1, borderColor: C.line,
                    backgroundColor: on ? C.primary : '#fff', color: on ? '#fff' : C.ink }}>
                  {x.firstName} · {x.schoolRole}
                </Text>
              );
            })}
          </ScrollView>
        </>
      )}

      <View style={[s.row, { flexWrap: 'wrap' }]}>
        {canCreateGroup(person) && <View style={{ flex: 1 }}><Button label="+ New group" onPress={() => router.push('/group/new')} /></View>}
        {isAdmin && <View style={{ flex: 1 }}><Button kind="ghost" label="Admin portal" onPress={() => router.push('/admin')} /></View>}
      </View>

      {groups.length === 0 && <P muted>You're not in any groups yet.</P>}
      {groups.map((g) => <GroupRow key={g.id} g={g} onPress={() => router.push(`/group/${g.id}`)} />)}

      {discover.length > 0 && (
        <>
          <Text style={{ fontSize: 12, fontWeight: '700', color: C.muted, marginTop: 8 }}>MORE GROUPS</Text>
          {discover.map((g) => (
            <GroupRow key={g.id} g={g}
              onPress={g.settings.visibility === 'public' || g.settings.visibility === 'school' ? () => router.push(`/group/${g.id}`) : undefined}
              action={g.settings.joinPolicy === 'open'
                ? <Text style={{ color: C.primary, fontWeight: '700' }} onPress={() => joinGroup(g.id).then(load).catch((e) => Alert.alert('Not allowed', e.message))}>Join</Text>
                : <Text style={{ color: C.muted, fontSize: 12 }}>{g.settings.joinPolicy === 'request' ? 'Ask a moderator' : 'By invitation'}</Text>} />
          ))}
        </>
      )}
    </ScrollView>
  );
}
