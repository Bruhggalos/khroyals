import { Linking, SectionList, Text, View } from 'react-native';
import { getCalendar } from '../../src/api/mockApi';
import { dateRange } from '../../src/site/calendar';
import type { CalendarEvent } from '../../src/site/types';
import { C, Card, Chip, Loading, P, s, useLoad } from '../../src/ui';

const CATEGORY_COLOR: Record<string, string> = {
  'No School': C.accent,
  'Teacher In-Service': '#64748B',
  'E-Learning': '#0E7490',
  'Special Student Day': C.primary,
  Academic: '#7C3AED',
};

export default function Calendar() {
  const { data } = useLoad(getCalendar);
  if (!data) return <Loading />;
  const byMonth = new Map<string, CalendarEvent[]>();
  [...data.events].sort((a, b) => a.date.localeCompare(b.date)).forEach((e) => {
    const k = new Date(e.date + 'T12:00').toLocaleString('en-US', { month: 'long', year: 'numeric' });
    byMonth.set(k, [...(byMonth.get(k) ?? []), e]);
  });
  return (
    <SectionList style={s.screen} contentContainerStyle={s.pad}
      sections={[...byMonth].map(([title, data]) => ({ title, data }))}
      keyExtractor={(e) => e.id}
      ListHeaderComponent={
        <Card onPress={() => Linking.openURL(data.pdf)}>
          <Text style={{ fontWeight: '800', fontSize: 16, color: C.ink }}>{data.schoolYear} School Calendar</Text>
          <P muted>Important dates from the official calendar. Tap to open the PDF.</P>
        </Card>}
      renderSectionHeader={({ section }) => <Text style={{ fontWeight: '800', color: C.muted, marginTop: 8 }}>{section.title.toUpperCase()}</Text>}
      renderItem={({ item: e }) => (
        <Card style={{ flexDirection: 'row', gap: 12, marginBottom: 8 }}>
          <View style={{ width: 92 }}>
            <Text style={{ fontSize: 15, fontWeight: '800', color: C.primary }}>{dateRange(e)}</Text>
            <Text style={{ color: C.muted, fontSize: 12 }}>
              {new Date(e.date + 'T12:00').toLocaleDateString('en-US', { weekday: 'short' })}
              {e.endDate ? ` – ${new Date(e.endDate + 'T12:00').toLocaleDateString('en-US', { weekday: 'short' })}` : ''}
            </Text>
          </View>
          <View style={{ flex: 1, gap: 4 }}>
            <Text style={{ fontWeight: '700', color: C.ink }}>{e.title}</Text>
            <Chip label={e.category} color={CATEGORY_COLOR[e.category] ?? C.primary} />
          </View>
        </Card>
      )} />
  );
}
