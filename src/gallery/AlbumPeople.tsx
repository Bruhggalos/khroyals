/**
 * gallery.manage: the people on a grade album (the grade's students and parents, put on by themselves), anyone
 * taken off (by the office, or who removed it themselves), and adding someone by name.
 */
import { useCallback, useEffect, useState } from 'react';
import { Alert, Text, View } from 'react-native';
import { ROLE_LABELS, albumPeople, errorText, listUsers, setAlbumMember, type AlbumPerson, type Person } from '../api/connect';
import { C, Card, Field, H, P, s } from '../ui';

export function AlbumPeople({ albumId }: { albumId: string }) {
  const [people, setPeople] = useState<AlbumPerson[] | null>(null);
  const [everyone, setEveryone] = useState<Person[]>([]);
  const [query, setQuery] = useState('');
  const load = useCallback(() => albumPeople(albumId).then(setPeople).catch((e) => { Alert.alert('People', errorText(e)); setPeople([]); }), [albumId]);
  useEffect(() => { load(); listUsers().then(setEveryone).catch(() => {}); }, [load]);
  const set = (id: string, on: boolean) => setAlbumMember(albumId, id, on).then(load).catch((e) => Alert.alert('Not changed', errorText(e)));

  if (!people) return null;
  const on = people.filter((p) => !p.removed);
  const off = people.filter((p) => p.removed);
  const words = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  const onIds = new Set(on.map((p) => p.id));
  const found = words.length ? everyone.filter((p) => !onIds.has(p.id) && !p.pending && p.schoolRole !== 'substitute'
    && words.every((w) => `${p.firstName} ${p.lastName}`.toLowerCase().includes(w))).slice(0, 8) : [];
  const role = (r: string) => ROLE_LABELS[r as keyof typeof ROLE_LABELS] ?? r;

  return (
    <Card style={{ gap: 8 }}>
      <H>People on this album ({on.length})</H>
      <P muted>This grade's students and their parents were put on it. They keep it after the school year until their account is deleted or it's taken off. Staff see every album.</P>
      {on.map((p) => (
        <View key={p.id} style={[s.row, { justifyContent: 'space-between' }]}>
          <Text style={{ flex: 1, color: C.ink }}>{p.name} <Text style={{ color: C.muted }}>· {role(p.role)}</Text></Text>
          <Text style={{ color: C.danger, fontWeight: '600' }} accessibilityRole="button" onPress={() => set(p.id, false)}>Take off</Text>
        </View>
      ))}
      {off.length > 0 && <Text style={{ fontSize: 12, fontWeight: '800', color: C.muted, marginTop: 6 }}>TAKEN OFF</Text>}
      {off.map((p) => (
        <View key={p.id} style={[s.row, { justifyContent: 'space-between' }]}>
          <Text style={{ flex: 1, color: C.muted }}>{p.name} · {p.removedBySelf ? 'removed it themselves' : 'taken off'}</Text>
          <Text style={{ color: C.primary, fontWeight: '600' }} accessibilityRole="button" onPress={() => set(p.id, true)}>Put back</Text>
        </View>
      ))}
      <Field label="Add someone" placeholder="First or last name" value={query} onChangeText={setQuery} autoCorrect={false} />
      {found.map((p) => (
        <Text key={p.id} style={{ color: C.primary }} accessibilityRole="button" onPress={() => { setQuery(''); set(p.id, true); }}>
          + {p.firstName} {p.lastName} <Text style={{ color: C.muted }}>· {role(p.schoolRole)}</Text>
        </Text>
      ))}
    </Card>
  );
}
