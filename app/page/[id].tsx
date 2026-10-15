/**
 * Generic page renderer for every site page in mock-db/site.
 * Purpose-built screens (Home, News, Calendar) live in the tabs; everything
 * else renders straight from its JSON so new pages need no new code.
 * Staff gets a searchable directory since it's the most-used page.
 */
import { useState } from 'react';
import { Image, Linking, ScrollView, Text, TextInput, View } from 'react-native';
import { Stack, useLocalSearchParams } from 'expo-router';
import { getPage, type PageId } from '../../src/api/mockApi';
import { C, Card, H, Loading, P, s, useLoad } from '../../src/ui';

const human = (k: string) => k.replace(/([A-Z])/g, ' $1').replace(/^./, (c) => c.toUpperCase());
const TITLE_KEYS = ['title', 'name', 'label', 'sport', 'q', 'role', 'n'];

function Value({ v, depth = 0 }: { v: any; depth?: number }) {
  if (v == null || v === '') return null;
  if (typeof v !== 'object') {
    const str = String(v);
    if (/^https?:\/\//.test(str)) {
      if (/\.(png|jpe?g)|picsum|pravatar/.test(str)) return <Image source={{ uri: str }} style={{ height: 120, borderRadius: 8 }} />;
      return <Text style={{ color: C.primary }} onPress={() => Linking.openURL(str)}>{str}</Text>;
    }
    return <P>{str}</P>;
  }
  if (Array.isArray(v)) {
    if (v.every((x) => typeof x !== 'object')) return <P>{v.join(' · ')}</P>;
    return <View style={{ gap: 8 }}>{v.map((x, i) => <Obj key={i} o={x} depth={depth + 1} />)}</View>;
  }
  return <Obj o={v} depth={depth + 1} />;
}

function Obj({ o, depth }: { o: Record<string, any>; depth: number }) {
  const tk = TITLE_KEYS.find((k) => typeof o[k] === 'string' || typeof o[k] === 'number');
  const rest = Object.entries(o).filter(([k]) => k !== tk && k !== 'id');
  const body = (
    <>
      {tk && <Text style={{ fontWeight: '700', fontSize: 16, color: C.ink }}>{String(o[tk])}</Text>}
      {rest.map(([k, val]) => val == null || val === '' ? null : (
        <View key={k} style={{ gap: 2 }}>
          <Text style={{ fontSize: 12, fontWeight: '700', color: C.muted }}>{human(k).toUpperCase()}</Text>
          <Value v={val} depth={depth} />
        </View>
      ))}
    </>
  );
  return depth <= 2 ? <Card>{body}</Card> : <View style={{ gap: 4, paddingLeft: 8, borderLeftWidth: 2, borderLeftColor: C.line }}>{body}</View>;
}

function Staff({ data }: { data: any }) {
  const [q, setQ] = useState('');
  const list = data.staff.filter((p: any) => `${p.firstName} ${p.lastName} ${p.title} ${p.department}`.toLowerCase().includes(q.toLowerCase()));
  return (
    <ScrollView style={s.screen} contentContainerStyle={s.pad}>
      <TextInput placeholder="Search name, title, department" value={q} onChangeText={setQ} style={s.input} />
      {list.map((p: any) => (
        <Card key={p.id} style={{ flexDirection: 'row', gap: 12 }}>
          <Image source={{ uri: p.photo }} style={{ width: 52, height: 52, borderRadius: 26 }} />
          <View style={{ flex: 1 }}>
            <Text style={{ fontWeight: '700', color: C.ink }}>{p.firstName} {p.lastName}</Text>
            <P muted>{p.title} · {p.department}</P>
            <Text style={{ color: C.primary }} onPress={() => Linking.openURL(`mailto:${p.email}`)}>{p.email}</Text>
          </View>
        </Card>
      ))}
    </ScrollView>
  );
}

export default function Page() {
  const { id } = useLocalSearchParams<{ id: PageId }>();
  const { data, error } = useLoad(() => getPage(id), [id]);
  if (error) return <View style={s.center}><P>Page not found.</P></View>;
  if (!data) return <Loading />;
  const d: any = data;
  const title = d.page?.title ?? human(id);
  if (id === 'staff') return <><Stack.Screen options={{ title }} /><Staff data={d} /></>;
  const sections = Object.entries(d).filter(([k]) => !['_meta', 'page'].includes(k));
  return (
    <ScrollView style={s.screen} contentContainerStyle={s.pad}>
      <Stack.Screen options={{ title }} />
      {sections.map(([k, v]) => (
        <View key={k} style={{ gap: 8 }}>
          <H>{human(k)}</H>
          <Value v={v} />
        </View>
      ))}
    </ScrollView>
  );
}
