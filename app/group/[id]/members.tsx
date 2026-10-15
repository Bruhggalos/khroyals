/** Moderators manage people in a group: roles, mute, posting on/off, remove, add. */
import { useCallback, useEffect, useState } from 'react';
import { Alert, Image, ScrollView, Text, TextInput, View } from 'react-native';
import { Stack, useLocalSearchParams } from 'expo-router';
import { getGroup, getUser, listMembers, listUsers, setMembership, type GroupView, type Member, type Person } from '../../../src/api/connect';
import type { GroupRole } from '../../../src/comms/types';
import { C, Card, Chip, Loading, P, s } from '../../../src/ui';

const ROLES: GroupRole[] = ['owner', 'moderator', 'member', 'subscriber'];
const ORDER = (r: GroupRole) => ROLES.indexOf(r);

export default function Members() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [view, setView] = useState<GroupView | null>(null);
  const [members, setMembers] = useState<Member[] | null>(null);
  const [people, setPeople] = useState<Person[]>([]);
  const [q, setQ] = useState('');
  const [open, setOpen] = useState<string | null>(null);

  const load = useCallback(async () => {
    setView(await getGroup(id));
    setMembers(await listMembers(id));
    setPeople(await listUsers());
  }, [id]);
  useEffect(() => { load().catch((e) => Alert.alert('Error', e.message)); }, [load]);
  if (!view || !members) return <Loading />;

  const change = (userId: string, c: Parameters<typeof setMembership>[2]) =>
    setMembership(id, userId, c).then(load).catch((e) => Alert.alert('Not allowed', e.message));
  const inGroup = new Set(members.map((m) => m.userId));
  const term = q.trim().toLowerCase();
  const matches = term ? people.filter((p) => !inGroup.has(p.id) && `${p.firstName} ${p.lastName}`.toLowerCase().includes(term)).slice(0, 8) : [];
  const sorted = [...members].sort((a, b) => ORDER(a.role) - ORDER(b.role)
    || (getUser(a.userId)?.lastName ?? '').localeCompare(getUser(b.userId)?.lastName ?? ''));

  return (
    <ScrollView style={s.screen} contentContainerStyle={s.pad}>
      <Stack.Screen options={{ title: `${view.group.name} · Members` }} />
      <TextInput style={s.input} placeholder="Add someone: search by name" value={q} onChangeText={setQ} />
      {matches.map((p) => (
        <Card key={p.id} onPress={() => { setQ(''); change(p.id, { role: view.group.settings.mode === 'broadcast' ? 'subscriber' : 'member' }); }}>
          <Text style={{ color: C.ink }}>+ {p.firstName} {p.lastName} <Text style={{ color: C.muted }}>· {p.schoolRole}</Text></Text>
        </Card>
      ))}
      <P muted>{members.length} people. Members added by roster rules stay in sync automatically; changing someone's role here makes it manual.</P>
      {sorted.map((m) => {
        const u = getUser(m.userId);
        const muted = m.mutedUntil && new Date(m.mutedUntil) > new Date();
        return (
          <Card key={m.userId} onPress={() => setOpen(open === m.userId ? null : m.userId)}>
            <View style={[s.row]}>
              {u && <Image source={{ uri: u.avatar }} style={{ width: 32, height: 32, borderRadius: 16 }} />}
              <View style={{ flex: 1 }}>
                <Text style={{ fontWeight: '700', color: C.ink }}>{u ? `${u.firstName} ${u.lastName}` : 'Unknown'}</Text>
                <P muted>{u?.schoolRole} · {m.source === 'rule' ? 'from roster' : 'added manually'}</P>
              </View>
              <Chip label={m.role} />
            </View>
            <View style={s.row}>
              {muted && <Chip label="Muted" color={C.danger} />}
              {!m.canPost && <Chip label="Posting off" color={C.danger} />}
            </View>
            {open === m.userId && (
              <View style={{ gap: 8 }}>
                <View style={[s.row, { flexWrap: 'wrap' }]}>
                  {ROLES.map((r) => (
                    <Text key={r} onPress={() => change(m.userId, { role: r })}
                      style={{ paddingHorizontal: 10, paddingVertical: 5, borderRadius: 999, overflow: 'hidden', borderWidth: 1, borderColor: C.line,
                        backgroundColor: m.role === r ? C.primary : '#fff', color: m.role === r ? '#fff' : C.ink }}>{r}</Text>
                  ))}
                </View>
                <View style={[s.row, { flexWrap: 'wrap', gap: 14 }]}>
                  {muted
                    ? <Text style={{ color: C.primary }} onPress={() => change(m.userId, { mutedUntil: null })}>Unmute</Text>
                    : <Text style={{ color: C.primary }} onPress={() => change(m.userId, { mutedUntil: new Date(Date.now() + 24 * 3600e3).toISOString() })}>Mute 24h</Text>}
                  <Text style={{ color: C.primary }} onPress={() => change(m.userId, { canPost: !m.canPost })}>{m.canPost ? 'Turn posting off' : 'Allow posting'}</Text>
                  <Text style={{ color: C.danger }} onPress={() => change(m.userId, { remove: true })}>Remove</Text>
                </View>
              </View>
            )}
          </Card>
        );
      })}
    </ScrollView>
  );
}
