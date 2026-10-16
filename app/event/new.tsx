/** Add an event to the school calendar (admins) or a group calendar (group moderators). */
import { useEffect, useState } from 'react';
import { Alert, ScrollView, Text, View } from 'react-native';
import { Stack, router } from 'expo-router';
import { createEvent, editableCalendars } from '../../src/api/connect';
import { Button, C, Card, Field, H, Loading, P, s } from '../../src/ui';

const CATEGORIES = ['Event', 'No School', 'Academic', 'Special Student Day', 'Teacher In-Service', 'E-Learning', 'Athletics', 'Fine Arts'];
const isDate = (v: string) => /^\d{4}-\d{2}-\d{2}$/.test(v);
const isTime = (v: string) => v === '' || /^\d{1,2}:\d{2}$/.test(v);

export default function NewEvent() {
  const [cals, setCals] = useState<{ groupId: string | null; name: string }[] | null>(null);
  const [cal, setCal] = useState(0);
  const [title, setTitle] = useState('');
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [endDate, setEndDate] = useState('');
  const [start, setStart] = useState('');
  const [end, setEnd] = useState('');
  const [location, setLocation] = useState('');
  const [category, setCategory] = useState('Event');
  useEffect(() => { editableCalendars().then(setCals); }, []);
  if (!cals) return <Loading />;
  if (!cals.length) return <View style={s.center}><P>You can't add events to any calendar.</P></View>;

  const valid = title.trim() && isDate(date) && (endDate === '' || (isDate(endDate) && endDate >= date)) && isTime(start) && isTime(end);
  const save = () => createEvent({
    groupId: cals[cal].groupId, title: title.trim(), date, endDate: endDate || null, startTime: start || null, endTime: end || null,
    allDay: !start, location: location.trim() || null, category: cals[cal].groupId ? 'Group' : category,
  }).then(() => router.back()).catch((e) => Alert.alert('Not allowed', e.message));

  const pill = (label: string, on: boolean, onPress: () => void) => (
    <Text key={label} onPress={onPress} style={{ paddingHorizontal: 10, paddingVertical: 6, borderRadius: 999, overflow: 'hidden', borderWidth: 1,
      borderColor: C.line, backgroundColor: on ? C.primary : '#fff', color: on ? '#fff' : C.ink }}>{label}</Text>
  );

  return (
    <ScrollView style={s.screen} contentContainerStyle={s.pad} keyboardShouldPersistTaps="handled">
      <Stack.Screen options={{ title: 'New event' }} />
      <Card>
        <H>Calendar</H>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>{cals.map((c, i) => pill(c.name, i === cal, () => setCal(i)))}</View>
      </Card>
      <Card>
        <Field label="Title" placeholder="e.g. Spring concert" value={title} onChangeText={setTitle} />
        <View style={s.row}>
          <Field label="Date" placeholder="YYYY-MM-DD" value={date} onChangeText={setDate} style={{ flex: 1 }} />
          <Field label="End date (optional)" placeholder="YYYY-MM-DD" value={endDate} onChangeText={setEndDate} style={{ flex: 1 }} />
        </View>
        <View style={s.row}>
          <Field label="Start time (optional)" placeholder="15:30" value={start} onChangeText={setStart} style={{ flex: 1 }} />
          <Field label="End time" placeholder="17:00" value={end} onChangeText={setEnd} style={{ flex: 1 }} />
        </View>
        <Field label="Location (optional)" placeholder="e.g. Gym" value={location} onChangeText={setLocation} />
        <P muted>Leave the start time empty for an all-day event.</P>
      </Card>
      {cals[cal].groupId === null && (
        <Card>
          <H>Category</H>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>{CATEGORIES.map((c) => pill(c, c === category, () => setCategory(c)))}</View>
        </Card>
      )}
      <Button label="Add event" onPress={save} disabled={!valid} />
    </ScrollView>
  );
}
