/** A Volunteer Leader posts an opportunity: asking for people's time, or for items (how many of what, brought by a date). */
import { useState } from 'react';
import { Alert, Pressable, ScrollView, Text, View } from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { isVolunteerLead, volunteerPost } from '../../src/api/connect';
import { todayIso } from '../../src/volunteer/format';
import { VolunteerGate } from '../../src/volunteer/VolunteerGate';
import { Button, C, Card, Field, P, s } from '../../src/ui';
import { DateField, TimeField } from '../../src/forms/DateTimeField';

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
  const [kind, setKind] = useState<'help' | 'items'>('help');
  const [item, setItem] = useState('');
  const [quantity, setQuantity] = useState('');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [date, setDate] = useState(todayIso());
  const [endDate, setEndDate] = useState('');
  const [start, setStart] = useState('');
  const [end, setEnd] = useState('');
  const [location, setLocation] = useState('');
  const [spots, setSpots] = useState('');
  const [busy, setBusy] = useState(false);

  const items = kind === 'items';
  const post = async () => {
    const n = spots.trim() ? Number.parseInt(spots, 10) : null;
    const q = Number.parseInt(quantity, 10);
    const problem = !title.trim() ? 'Add a title.'
      : items && !item.trim() ? 'Say what you need, like "boxes of tissues".'
      : items && !(q >= 1 && q <= 10000) ? 'Say how many you need.'
      : !isDate(date) ? 'Choose a date.'
      : date < todayIso() ? "The date can't be in the past."
      : endDate && (!isDate(endDate) || endDate < date) ? 'The end date must be on or after the start.'
      : (start && !isTime(start)) || (end && !isTime(end)) ? 'Choose the times again.'
      : start && end && !endDate && end <= start ? 'The end time must be after the start time.'
      : n !== null && !(n >= 1) ? 'Spots must be a number, or leave it empty for no limit.' : null;
    if (problem) return Alert.alert('Almost there', problem);
    setBusy(true);
    try {
      const o = await volunteerPost(items
        ? { title: title.trim(), description: description.trim(), startsOn: date, endsOn: null, startTime: null, endTime: null,
            location: location.trim() || null, spots: null, items: { item: item.trim(), quantity: q } }
        : { title: title.trim(), description: description.trim(), startsOn: date, endsOn: endDate || null,
            startTime: start || null, endTime: end || null, location: location.trim() || null, spots: n });
      router.replace(`/volunteer/${o.id}`);
    } catch (e: any) {
      Alert.alert("Couldn't post", e.message);
    } finally {
      setBusy(false);
    }
  };

  const option = (value: 'help' | 'items', icon: React.ComponentProps<typeof Ionicons>['name'], label: string) => (
    <Pressable onPress={() => setKind(value)} accessibilityRole="button" accessibilityState={{ selected: kind === value }}
      style={{ flex: 1, flexDirection: 'row', gap: 6, alignItems: 'center', justifyContent: 'center', paddingVertical: 9, borderRadius: 999,
        backgroundColor: kind === value ? C.primary : 'transparent' }}>
      <Ionicons name={icon} size={16} color={kind === value ? '#fff' : C.muted} />
      <Text style={{ fontWeight: '800', color: kind === value ? '#fff' : C.muted }}>{label}</Text>
    </Pressable>
  );

  return (
    <ScrollView style={s.screen} contentContainerStyle={s.pad} keyboardShouldPersistTaps="handled">
      <View style={{ gap: 6 }}>
        <View style={{ flexDirection: 'row', padding: 4, borderRadius: 999, backgroundColor: '#fff', borderWidth: 1, borderColor: C.line }}>
          {option('help', 'people', 'Volunteers')}
          {option('items', 'gift', 'Items')}
        </View>
        <P muted>{items ? 'Ask families to bring things, like tissues or snacks. They pledge how many, and everyone sees how much is still needed.'
          : "Ask for people's time. They Say Yes! until the spots fill."}</P>
      </View>
      <Card>
        <Field label={items ? "What's the request?" : "What's the opportunity?"} placeholder={items ? 'e.g. Tissues for every homeroom' : 'e.g. Book fair helpers'}
          value={title} onChangeText={setTitle} maxLength={100} />
        {items && (
          <View style={s.row}>
            <Field label="What do you need?" placeholder="e.g. boxes of tissues" value={item} onChangeText={setItem} maxLength={80} style={{ flex: 2 }} />
            <Field label="How many?" placeholder="e.g. 24" keyboardType="number-pad" value={quantity} onChangeText={setQuantity} style={{ flex: 1 }} />
          </View>
        )}
        <Field label="Details" style={{ minHeight: 110, textAlignVertical: 'top' }} multiline maxLength={2000}
          placeholder={items ? 'What it\'s for…\n\nGood to know:\nAny brand is fine' : 'What volunteers will do…\n\nWhat to bring:\nA water bottle'}
          value={description} onChangeText={setDescription}
          hint={'Each part gets its own card. Leave a blank line between parts, and start one with a short heading and a colon, like "What to bring:".'} />
      </Card>
      <Card>
        {items ? (
          <DateField label="Bring by" value={date} min={todayIso()} onChange={setDate} />
        ) : (
          <>
            <View style={s.row}>
              <DateField label="Date" value={date} min={todayIso()} onChange={(d) => { setDate(d); if (endDate && endDate < d) setEndDate(''); }} style={{ flex: 1 }} />
              <DateField label="End date (optional)" optional value={endDate} onChange={setEndDate} min={date} initial={date} placeholder="Same day" style={{ flex: 1 }} />
            </View>
            <View style={s.row}>
              <TimeField label="Start time (optional)" optional value={start} onChange={setStart} initial="15:00" style={{ flex: 1 }} />
              <TimeField label="End time (optional)" optional value={end} onChange={setEnd} initial={start || '16:00'} style={{ flex: 1 }} />
            </View>
          </>
        )}
        <Field label={items ? 'Drop off at (optional)' : 'Where (optional)'} placeholder={items ? 'e.g. Front office' : 'e.g. Library'}
          value={location} onChangeText={setLocation} maxLength={120} />
        {!items && <Field label="Volunteers needed (optional)" placeholder="No limit if empty" keyboardType="number-pad" value={spots} onChangeText={setSpots} />}
      </Card>
      <Button label={busy ? 'Posting…' : items ? 'Post request' : 'Post opportunity'} disabled={busy} onPress={post} />
    </ScrollView>
  );
}
