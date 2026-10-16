/** A Volunteer Leader posts an opportunity. */
import { useState } from 'react';
import { Alert, ScrollView, TextInput, View } from 'react-native';
import { router } from 'expo-router';
import { isVolunteerLead, volunteerPost } from '../../src/api/connect';
import { todayIso } from '../../src/volunteer/format';
import { VolunteerGate } from '../../src/volunteer/VolunteerGate';
import { Button, Card, P, s } from '../../src/ui';

const isDate = (v: string) => /^\d{4}-\d{2}-\d{2}$/.test(v);
const isTime = (v: string) => /^\d{1,2}:\d{2}$/.test(v);

export default function NewOpportunity() {
  return (
    <VolunteerGate title="New opportunity">
      {(me) => (isVolunteerLead(me) ? <Form /> : <View style={[s.screen, s.pad]}><Card><P muted>Only Volunteer Leaders can post opportunities.</P></Card></View>)}
    </VolunteerGate>
  );
}

function Form() {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [date, setDate] = useState(todayIso());
  const [endDate, setEndDate] = useState('');
  const [start, setStart] = useState('');
  const [end, setEnd] = useState('');
  const [location, setLocation] = useState('');
  const [spots, setSpots] = useState('');
  const [busy, setBusy] = useState(false);

  const post = async () => {
    const n = spots.trim() ? Number.parseInt(spots, 10) : null;
    const problem = !title.trim() ? 'Add a title.'
      : !isDate(date) ? 'Enter the date as YYYY-MM-DD.'
      : date < todayIso() ? "The date can't be in the past."
      : endDate && (!isDate(endDate) || endDate < date) ? 'The end date must be YYYY-MM-DD, on or after the start.'
      : (start && !isTime(start)) || (end && !isTime(end)) ? 'Enter times like 15:00.'
      : n !== null && !(n >= 1) ? 'Spots must be a number, or leave it empty for no limit.' : null;
    if (problem) return Alert.alert('Almost there', problem);
    setBusy(true);
    try {
      const o = await volunteerPost({
        title: title.trim(), description: description.trim(), startsOn: date, endsOn: endDate || null,
        startTime: start || null, endTime: end || null, location: location.trim() || null, spots: n,
      });
      router.replace(`/volunteer/${o.id}`);
    } catch (e: any) {
      Alert.alert("Couldn't post", e.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <ScrollView style={s.screen} contentContainerStyle={s.pad} keyboardShouldPersistTaps="handled">
      <Card>
        <TextInput style={s.input} placeholder="What's the opportunity? (e.g. Book fair helpers)" value={title} onChangeText={setTitle} maxLength={100} />
        <TextInput style={[s.input, { minHeight: 110, textAlignVertical: 'top' }]} multiline maxLength={2000}
          placeholder="What volunteers will do, what to bring, who to ask…" value={description} onChangeText={setDescription} />
      </Card>
      <Card>
        <View style={s.row}>
          <TextInput style={[s.input, { flex: 1 }]} placeholder="Date YYYY-MM-DD" value={date} onChangeText={setDate} />
          <TextInput style={[s.input, { flex: 1 }]} placeholder="End date (optional)" value={endDate} onChangeText={setEndDate} />
        </View>
        <View style={s.row}>
          <TextInput style={[s.input, { flex: 1 }]} placeholder="Start 15:00 (optional)" value={start} onChangeText={setStart} />
          <TextInput style={[s.input, { flex: 1 }]} placeholder="End 17:00" value={end} onChangeText={setEnd} />
        </View>
        <TextInput style={s.input} placeholder="Where (optional)" value={location} onChangeText={setLocation} maxLength={120} />
        <TextInput style={s.input} placeholder="Volunteers needed (optional, no limit if empty)" keyboardType="number-pad" value={spots} onChangeText={setSpots} />
      </Card>
      <Button label={busy ? 'Posting…' : 'Post opportunity'} disabled={busy} onPress={post} />
    </ScrollView>
  );
}
