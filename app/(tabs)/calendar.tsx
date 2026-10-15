import { SectionList, Text, View } from 'react-native';
import { getPage } from '../../src/api/mockApi';
import { C, Card, Chip, Loading, P, s, useLoad } from '../../src/ui';

export default function Calendar() {
  const { data } = useLoad(() => getPage('calendar'));
  if (!data) return <Loading />;
  const byMonth = new Map<string, typeof data.events>();
  [...data.events].sort((a, b) => a.date.localeCompare(b.date)).forEach((e) => {
    const k = new Date(e.date + 'T12:00').toLocaleString('en-US', { month: 'long', year: 'numeric' });
    byMonth.set(k, [...(byMonth.get(k) ?? []), e]);
  });
  return (
    <SectionList style={s.screen} contentContainerStyle={s.pad}
      sections={[...byMonth].map(([title, data]) => ({ title, data }))}
      keyExtractor={(e) => e.id}
      renderSectionHeader={({ section }) => <Text style={{ fontWeight: '800', color: C.muted, marginTop: 8 }}>{section.title.toUpperCase()}</Text>}
      renderItem={({ item: e }) => (
        <Card style={{ flexDirection: 'row', gap: 12, marginBottom: 8 }}>
          <View style={{ width: 48, alignItems: 'center' }}>
            <Text style={{ fontSize: 22, fontWeight: '800', color: C.primary }}>{Number(e.date.slice(8))}</Text>
            <Text style={{ color: C.muted, fontSize: 12 }}>{e.allDay ? 'All day' : e.startTime}</Text>
          </View>
          <View style={{ flex: 1, gap: 4 }}>
            <Text style={{ fontWeight: '700', color: C.ink }}>{e.title}</Text>
            <P muted>{e.location}</P><Chip label={e.category} />
          </View>
        </Card>
      )} />
  );
}
