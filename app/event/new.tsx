import { isDate, isTime } from '../../src/forms/dates';
/** Add an event to the school calendar (admins) or a group calendar (group moderators). */
import { useEffect, useState } from 'react';
import { Alert, ScrollView, Text, View } from 'react-native';
import { Stack, router } from 'expo-router';
import { createEvent, editableCalendars } from '../../src/api/connect';
import { Button, C, Card, Field, H, Loading, P, s } from '../../src/ui';
import { DateField, TimeField, toDateString } from '../../src/forms/DateTimeField';
import { EventAlbumSwitch, makeAlbumFor } from '../../src/gallery/EventAlbumSwitch';

const CATEGORIES = ['Event', 'No School', 'Academic', 'Special Student Day', 'Teacher In-Service', 'E-Learning', 'Athletics', 'Fine Arts'];

export default function NewEvent() {
  const [cals, setCals] = useState<{ groupId: string | null; name: string }[] | null>(null);
  const [cal, setCal] = useState(0);
  const [title, setTitle] = useState('');
  const [date, setDate] = useState(toDateString(new Date()));
  const [endDate, setEndDate] = useState('');
  const [start, setStart] = useState('');
  const [end, setEnd] = useState('');
  const [location, setLocation] = useState('');
  const [category, setCategory] = useState('Event');
  const [album, setAlbum] = useState(false);
  useEffect(() => { editableCalendars().then(setCals); }, []);
  if (!cals) return <Loading />;
  if (!cals.length) return <View style={s.center}><P>You can't add events to any calendar.</P></View>;

  const valid = title.trim() && isDate(date) && (endDate === '' || (isDate(endDate) && endDate >= date)) && (!start || isTime(start)) && (!end || isTime(end))
    && (!start || !end || endDate > date || end > start);
  const save = () => createEvent({
    groupId: cals[cal].groupId, title: title.trim(), date, endDate: endDate || null, startTime: start || null, endTime: end || null,
    allDay: !start, location: location.trim() || null, category: cals[cal].groupId ? 'Group' : category,
  }).then(async (id) => {
    // School calendar events can have a photo album, made with the event.
    if (album && cals[cal].groupId === null) await makeAlbumFor({ kind: 'calendar', id });
    router.back();
  }).catch((e) => Alert.alert('Not allowed', e.message));

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
          <DateField label="Date" value={date} onChange={(d) => { setDate(d); if (endDate && endDate < d) setEndDate(''); }} style={{ flex: 1 }} />
          <DateField label="End date (optional)" optional value={endDate} onChange={setEndDate} min={date} initial={date} placeholder="Same day" style={{ flex: 1 }} />
        </View>
        <View style={s.row}>
          <TimeField label="Start time (optional)" optional value={start} onChange={setStart} placeholder="All day" initial="15:00" style={{ flex: 1 }} />
          <TimeField label="End time (optional)" optional value={end} onChange={setEnd} initial={start || '16:00'} style={{ flex: 1 }} />
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
      {cals[cal].groupId === null && <EventAlbumSwitch value={album} onChange={setAlbum} />}
      <Button label="Add event" onPress={save} disabled={!valid} />
    </ScrollView>
  );
}
