/** Add or change one of your own events on My calendar (teachers and staff). Only you see them. */
import { useEffect, useState } from 'react';
import { Alert, ScrollView, View } from 'react-native';
import { Stack, router, useLocalSearchParams } from 'expo-router';
import { deletePersonalEvent, errorText, myCalendar, savePersonalEvent } from '../../src/api/connect';
import { schoolToday } from '../../src/calendar/past';
import { DateField, TimeField } from '../../src/forms/DateTimeField';
import { isDate, isTime } from '../../src/forms/dates';
import { Button, Card, Field, Loading, P, ask, s } from '../../src/ui';

export default function EditPersonalEvent() {
  const { id, date: day } = useLocalSearchParams<{ id?: string; date?: string }>();
  const [loaded, setLoaded] = useState(!id);
  const [title, setTitle] = useState('');
  const [date, setDate] = useState(day && isDate(day) ? day : schoolToday());
  const [start, setStart] = useState('');
  const [end, setEnd] = useState('');
  const [location, setLocation] = useState('');
  const [notes, setNotes] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!id || !day) return;
    myCalendar(day, day).then((list) => {
      const e = list.find((x) => x.id === id && !x.sportEventId);
      if (e) {
        setTitle(e.title); setDate(e.date); setStart(e.startTime ?? ''); setEnd(e.endTime ?? '');
        setLocation(e.location ?? ''); setNotes(e.notes);
      }
    }).catch((x) => Alert.alert('Could not load it', errorText(x))).finally(() => setLoaded(true));
  }, [id, day]);

  const header = <Stack.Screen options={{ title: id ? 'Change event' : 'Add to my calendar' }} />;
  if (!loaded) return <>{header}<Loading /></>;

  const valid = title.trim() && isDate(date) && (!start || isTime(start)) && (!end || (isTime(end) && !!start && end > start));
  const save = () => {
    setBusy(true);
    savePersonalEvent({ id: id ?? null, title: title.trim(), date, startTime: start || null, endTime: start && end ? end : null, location, notes })
      .then(() => router.back())
      .catch((x) => Alert.alert('Could not save it', errorText(x)))
      .finally(() => setBusy(false));
  };
  const remove = () => ask('Delete this event?', title, 'Delete', () => {
    deletePersonalEvent(id!).then(() => router.back()).catch((x) => Alert.alert('Could not delete it', errorText(x)));
  });

  return (
    <ScrollView style={s.screen} contentContainerStyle={s.pad} keyboardShouldPersistTaps="handled">
      {header}
      <Card>
        <Field label="Title" placeholder="e.g. Faculty meeting" value={title} onChangeText={setTitle} maxLength={120} />
        <DateField label="Date" value={date} onChange={setDate} />
        <View style={s.row}>
          <TimeField label="Start time (optional)" optional value={start} onChange={(t) => { setStart(t); if (!t || (end && end <= t)) setEnd(''); }}
            placeholder="All day" initial="15:00" style={{ flex: 1 }} />
          <TimeField label="End time (optional)" optional value={end} onChange={setEnd} initial={start || '16:00'} style={{ flex: 1 }} />
        </View>
        {!!end && !start && <P muted>Pick a start time first.</P>}
        {!!start && !!end && end <= start && <P muted>The end time must be after the start time.</P>}
        <Field label="Where (optional)" placeholder="e.g. Library" value={location} onChangeText={setLocation} maxLength={200} />
        <Field label="Notes (optional)" value={notes} onChangeText={setNotes} multiline maxLength={1000} />
        <P muted>Only you see your calendar.</P>
      </Card>
      <Button label={id ? 'Save' : 'Add to my calendar'} onPress={save} disabled={!valid || busy} />
      {!!id && <Button kind="ghost" label="Delete" onPress={remove} />}
    </ScrollView>
  );
}
