import { useCallback, useState } from 'react';
import { Alert, Linking, SectionList, Text, View } from 'react-native';
import { Stack, router, useFocusEffect } from 'expo-router';
import { getCalendar } from '../src/api/mockApi';
import { deleteEvent, editableCalendars, listEvents, live, session, type GroupEvent } from '../src/api/connect';
import { dateRange } from '../src/site/calendar';
import { Button, C, Card, Chip, Loading, P, s } from '../src/ui';

const CATEGORY_COLOR: Record<string, string> = {
  'No School': C.accent,
  'Teacher In-Service': '#64748B',
  'E-Learning': '#0E7490',
  'Special Student Day': C.primary,
  Academic: '#7C3AED',
};

const PDF = 'https://www.khroyals.com/s/2026-2027-Calendar-2.pdf';

/** School calendar, plus (when signed in to Royals Connect) the calendars of your groups. */
export default function Calendar() {
  const [events, setEvents] = useState<GroupEvent[] | null>(null);
  const [canEdit, setCanEdit] = useState<Set<string>>(new Set());
  const [canAdd, setCanAdd] = useState(false);

  const load = useCallback(async () => {
    try {
      if (live) {
        await session();
        const [evs, cals] = await Promise.all([listEvents(), editableCalendars()]);
        setEvents(evs);
        setCanAdd(cals.length > 0);
        setCanEdit(new Set(cals.map((c) => c.groupId ?? 'school')));
      } else {
        const cal = await getCalendar();
        setEvents(cal.events.map((e) => ({ ...e, groupId: null })));
      }
    } catch (e: any) {
      Alert.alert('Could not load the calendar', e.message);
      setEvents([]);
    }
  }, []);
  useFocusEffect(useCallback(() => { load(); }, [load]));
  const header = <Stack.Screen options={{ title: 'Calendar' }} />;
  if (!events) return <>{header}<Loading /></>;

  const byMonth = new Map<string, GroupEvent[]>();
  [...events].sort((a, b) => a.date.localeCompare(b.date) || (a.startTime ?? '').localeCompare(b.startTime ?? '')).forEach((e) => {
    const k = new Date(e.date + 'T12:00').toLocaleString('en-US', { month: 'long', year: 'numeric' });
    byMonth.set(k, [...(byMonth.get(k) ?? []), e]);
  });
  const remove = (e: GroupEvent) => Alert.alert('Delete event?', e.title, [
    { text: 'Cancel', style: 'cancel' },
    { text: 'Delete', style: 'destructive', onPress: () => deleteEvent(e.id).then(load).catch((x) => Alert.alert('Not allowed', x.message)) },
  ]);

  return (
    <>{header}
    <SectionList style={s.screen} contentContainerStyle={s.pad}
      sections={[...byMonth].map(([title, data]) => ({ title, data }))}
      keyExtractor={(e) => e.id}
      ListHeaderComponent={
        <View style={{ gap: 8 }}>
          <Card onPress={() => Linking.openURL(PDF)}>
            <Text style={{ fontWeight: '800', fontSize: 16, color: C.ink }}>2026–2027 School Calendar</Text>
            <P muted>Important dates from the official calendar{live ? ', plus events from your groups' : ''}. Tap to open the PDF.</P>
          </Card>
          {canAdd && <Button label="+ Add event" onPress={() => router.push('/event/new')} />}
        </View>}
      renderSectionHeader={({ section }) => <Text style={{ fontWeight: '800', color: C.muted, marginTop: 8 }}>{section.title.toUpperCase()}</Text>}
      renderItem={({ item: e }) => (
        <Card style={{ flexDirection: 'row', gap: 12, marginBottom: 8 }}
          onPress={canEdit.has(e.groupId ?? 'school') ? () => remove(e) : undefined}>
          <View style={{ width: 92 }}>
            <Text style={{ fontSize: 15, fontWeight: '800', color: C.primary }}>{dateRange(e)}</Text>
            <Text style={{ color: C.muted, fontSize: 12 }}>
              {e.startTime ? `${e.startTime}${e.endTime ? `–${e.endTime}` : ''}` : new Date(e.date + 'T12:00').toLocaleDateString('en-US', { weekday: 'short' })}
            </Text>
          </View>
          <View style={{ flex: 1, gap: 4 }}>
            <Text style={{ fontWeight: '700', color: C.ink }}>{e.title}</Text>
            {!!e.location && <P muted>{e.location}</P>}
            <View style={s.row}>
              {e.groupName
                ? <Chip label={`${e.groupIcon ?? ''} ${e.groupName}`.trim()} color="#0D9488" />
                : <Chip label={e.category} color={CATEGORY_COLOR[e.category] ?? C.primary} />}
            </View>
          </View>
        </Card>
      )} />
    </>
  );
}
