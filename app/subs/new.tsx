/**
 * Schedule a sub (or change one, ?id=): who's covering (substitutes first, then teachers and staff),
 * which classes (a teacher's own; every class for the office), the first and last day, the hours,
 * and the sub plans the sub reads only while on duty.
 */
import { useEffect, useState } from 'react';
import { Alert, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { Stack, router, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { ROLE_LABELS, deleteSubDay, errorText, saveSubDay, subOptions, subSchedule, type SubOptions } from '../../src/api/connect';
import { schoolToday } from '../../src/calendar/past';
import { DateField, TimeField } from '../../src/forms/DateTimeField';
import { Button, C, Field, Loading, P, ask, s } from '../../src/ui';

const label = (t: string) => <Text style={{ fontSize: 12, fontWeight: '700', color: C.muted, marginTop: 4 }}>{t}</Text>;

export default function ScheduleSub() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  const [opts, setOpts] = useState<SubOptions | null>(null);
  const [who, setWho] = useState<string | null>(null);
  const [find, setFind] = useState('');
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [from, setFrom] = useState(schoolToday());
  const [to, setTo] = useState(schoolToday());
  const [start, setStart] = useState('07:30');
  const [end, setEnd] = useState('15:30');
  const [plans, setPlans] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    subOptions().then((o) => {
      setOpts(o);
      if (!id && o.classes.length === 1) setPicked(new Set([o.classes[0].id]));
    }).catch((e) => { setOpts({ classes: [], people: [] }); Alert.alert('Substitutes', errorText(e)); });
    if (id) subSchedule().then((all) => {
      const d = all.find((x) => x.id === id);
      if (!d) return;
      setWho(d.substituteId); setPicked(new Set(d.classes.map((c) => c.id)));
      setFrom(d.startsOn); setTo(d.endsOn); setStart(d.startTime); setEnd(d.endTime); setPlans(d.plans ?? '');
    }).catch(() => {});
  }, [id]);

  const toggle = (c: string) => setPicked((p) => { const n = new Set(p); if (n.has(c)) n.delete(c); else n.add(c); return n; });
  const save = async () => {
    if (!who) return Alert.alert('Almost there', 'Choose who is covering.');
    if (picked.size === 0) return Alert.alert('Almost there', 'Choose the classes to cover.');
    setBusy(true);
    try {
      await saveSubDay({ id: id ?? null, substituteId: who, classIds: [...picked], startsOn: from, endsOn: to < from ? from : to, startTime: start, endTime: end, plans });
      router.back();
    } catch (e) { Alert.alert('Substitutes', errorText(e)); } finally { setBusy(false); }
  };

  const header = <Stack.Screen options={{ title: id ? 'Change sub day' : 'Schedule a sub' }} />;
  if (!opts) return <>{header}<Loading /></>;
  const q = find.trim().toLowerCase();
  const people = opts.people.filter((p) => p.id === who || !q || p.name.toLowerCase().includes(q));

  return (
    <ScrollView style={s.screen} contentContainerStyle={s.pad} keyboardShouldPersistTaps="handled">
      {header}
      {label("WHO'S COVERING")}
      {opts.people.length > 8 && (
        <TextInput style={s.input} placeholder="Find someone" accessibilityLabel="Find someone" value={find} onChangeText={setFind} autoCorrect={false} />
      )}
      {people.length === 0 ? <P muted>No substitutes yet. The office makes someone a Substitute in Admin portal → People.</P> : people.slice(0, 30).map((p) => {
        const on = who === p.id;
        return (
          <Pressable key={p.id} onPress={() => setWho(p.id)} accessibilityRole="radio" accessibilityState={{ selected: on }}
            style={{ flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12, borderRadius: 12, borderWidth: 1,
              borderColor: on ? C.primary : C.line, backgroundColor: on ? C.primary + '12' : '#fff' }}>
            <Ionicons name={on ? 'radio-button-on' : 'radio-button-off'} size={22} color={on ? C.primary : C.muted} />
            <Text style={{ flex: 1, fontSize: 16, fontWeight: '700', color: C.ink }}>{p.name}</Text>
            <Text style={{ color: C.muted }}>{ROLE_LABELS[p.role as keyof typeof ROLE_LABELS] ?? p.role}</Text>
          </Pressable>
        );
      })}

      {label('CLASSES')}
      {opts.classes.length === 0 ? <P muted>{"You don't lead a class section. The office sets up sections in Admin portal → Classes."}</P> : (
        <View style={[s.row, { flexWrap: 'wrap', gap: 6 }]}>
          {opts.classes.map((c) => {
            const on = picked.has(c.id);
            return (
              <Text key={c.id} onPress={() => toggle(c.id)} accessibilityRole="checkbox" accessibilityState={{ checked: on }}
                style={{ paddingHorizontal: 12, paddingVertical: 8, borderRadius: 999, overflow: 'hidden', borderWidth: 1,
                  borderColor: on ? C.primary : C.line, backgroundColor: on ? C.primary : '#fff', color: on ? '#fff' : C.ink, fontWeight: '600' }}>
                {c.name}{c.teacher && opts.classes.some((x) => x.teacher !== c.teacher) ? ` · ${c.teacher}` : ''}
              </Text>
            );
          })}
        </View>
      )}

      <View style={[s.row, { gap: 10 }]}>
        <DateField label="First day" value={from} onChange={(v) => { setFrom(v); if (to < v) setTo(v); }} min={schoolToday()} style={{ flex: 1 }} />
        <DateField label="Last day" value={to} onChange={setTo} min={from} style={{ flex: 1 }} />
      </View>
      <View style={[s.row, { gap: 10 }]}>
        <TimeField label="From" value={start} onChange={setStart} style={{ flex: 1 }} />
        <TimeField label="Until" value={end} onChange={setEnd} style={{ flex: 1 }} />
      </View>
      <P muted>The sub can open the class only between these hours on these days.</P>
      <Field label="Sub plans" value={plans} onChangeText={setPlans} multiline maxLength={4000} style={{ minHeight: 140, textAlignVertical: 'top' }}
        placeholder="Lesson plans, seating chart, where things are, who to ask for help" hint="The sub reads these only while on duty." />

      <Button label={busy ? 'Saving…' : id ? 'Save changes' : 'Schedule the sub'} disabled={busy} onPress={save} />
      {!!id && (
        <Button kind="ghost" label="Cancel this sub day" onPress={() => ask('Cancel this sub day?', 'The sub gets a notification that it was cancelled.', 'Cancel it',
          () => deleteSubDay(id).then(() => router.back()).catch((e) => Alert.alert('Substitutes', errorText(e))))} />
      )}
    </ScrollView>
  );
}
