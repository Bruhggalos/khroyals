/**
 * Dress-up days (Spirit Week and the like), for school calendar editors (calendar.school):
 * add a theme for a school day, optionally for some grades only. Students and parents see the
 * day's theme above the uniform on the Planner. Past days stay out of view until asked for.
 */
import { useCallback, useEffect, useState } from 'react';
import { Alert, Platform, ScrollView, Switch, Text, View } from 'react-native';
import { Stack } from 'expo-router';
import { deleteDressDay, listDressDays, saveDressDay, type DressDay } from '../src/api/connect';
import { isPastDay, schoolToday, splitPast } from '../src/calendar/past';
import { PAST_STYLE, PastToggle, usePastToggle } from '../src/calendar/PastToggle';
import { GradePicker } from '../src/comms/GradePicker';
import { MfaGate } from '../src/comms/MfaGate';
import { DateField } from '../src/forms/DateTimeField';
import { addDays, gradeSpan } from '../src/info/today';
import { Button, C, Card, Field, H, Loading, P, s } from '../src/ui';

type Draft = { id: string | null; week: string; date: string; title: string; details: string; grades: boolean; from: number | null; to: number | null };
const blank = (week = ''): Draft => ({ id: null, week, date: '', title: '', details: '', grades: false, from: null, to: null });
const longDate = (d: string) => new Date(`${d}T12:00`).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
const fail = (e: any) => Alert.alert('Not saved', e.message);
const confirm = (title: string, msg: string, onYes: () => void) => {
  if (Platform.OS === 'web') { if (globalThis.confirm?.(`${title}\n\n${msg}`)) onYes(); return; }
  Alert.alert(title, msg, [{ text: 'Cancel', style: 'cancel' }, { text: 'Delete', style: 'destructive', onPress: onYes }]);
};

export default function DressDays() {
  return (
    <>
      <Stack.Screen options={{ title: 'Dress-up days' }} />
      <MfaGate>{(access) => access.permissions.includes('calendar.school')
        ? <Editor />
        : <View style={[s.screen, s.pad]}><P>Dress-up days are set by people who manage the school calendar.</P></View>}
      </MfaGate>
    </>
  );
}

function Editor() {
  const [days, setDays] = useState<DressDay[] | null>(null);
  const [draft, setDraft] = useState<Draft>(blank());
  const [busy, setBusy] = useState(false);
  const past = usePastToggle();
  const today = schoolToday();

  const load = useCallback(() => {
    listDressDays(addDays(today, -120), addDays(today, 400)).then(setDays).catch((e) => { fail(e); setDays([]); });
  }, [today]);
  useEffect(load, [load]);
  if (!days) return <Loading />;

  const set = (patch: Partial<Draft>) => setDraft({ ...draft, ...patch });
  const edit = (d: DressDay) => setDraft({
    id: d.id, week: d.week ?? '', date: d.date, title: d.title, details: d.details,
    grades: d.gradeFrom != null, from: d.gradeFrom, to: d.gradeTo,
  });
  const save = async () => {
    if (draft.grades && (draft.from == null || draft.to == null || draft.from > draft.to)) {
      return Alert.alert('Grades', 'Pick the first and last grade (the first can\'t be after the last).');
    }
    setBusy(true);
    try {
      await saveDressDay({
        id: draft.id, week: draft.week.trim() || null, date: draft.date, title: draft.title, details: draft.details,
        gradeFrom: draft.grades ? draft.from : null, gradeTo: draft.grades ? draft.to : null,
      });
      setDraft(blank(draft.week));  // keep the week's name for its next day
      load();
    } catch (e) { fail(e); }
    setBusy(false);
  };
  const remove = (d: DressDay) => confirm('Delete this dress-up day?', `${d.title}, ${longDate(d.date)}`,
    () => deleteDressDay(d.id).then(() => { if (draft.id === d.id) setDraft(blank(draft.week)); load(); }).catch(fail));

  const split = splitPast(days, (d) => isPastDay(d.date));
  const list = (shown: DressDay[], isPast: boolean) => shown.map((d) => (
    <Card key={d.id} style={{ gap: 4, ...(isPast ? PAST_STYLE : null) }}>
      <Text style={{ fontSize: 12, fontWeight: '800', letterSpacing: 1, color: C.accent }}>
        {(d.week ?? 'Dress-up day').toUpperCase()} · {longDate(d.date).toUpperCase()}
      </Text>
      <Text style={{ fontSize: 16, fontWeight: '800', color: C.ink }}>
        {d.title}{d.gradeFrom != null && d.gradeTo != null ? ` (${gradeSpan(d.gradeFrom, d.gradeTo)})` : ''}
      </Text>
      {!!d.details && <P muted>{d.details}</P>}
      <View style={[s.row, { gap: 18 }]}>
        <Text style={{ color: C.primary, fontWeight: '700' }} accessibilityRole="button" onPress={() => edit(d)}>Edit</Text>
        <Text style={{ color: C.danger, fontWeight: '600' }} accessibilityRole="button" onPress={() => remove(d)}>Delete</Text>
      </View>
    </Card>
  ));

  return (
    <ScrollView style={s.screen} contentContainerStyle={[s.pad, { gap: 12 }]} keyboardShouldPersistTaps="handled">
      <Card style={{ gap: 10 }}>
        <H>{draft.id ? 'Change dress-up day' : 'Add a dress-up day'}</H>
        <P muted>Students and parents see the day's theme above the uniform on the Planner. Add each day of a themed week with the same week name.</P>
        <Field label="Week (optional)" placeholder="Spirit Week" value={draft.week} onChangeText={(week) => set({ week })} />
        <DateField label="Day" value={draft.date} onChange={(date) => set({ date })} />
        <Field label="Theme" placeholder="Mismatch Monday" value={draft.title} onChangeText={(title) => set({ title })} maxLength={80} />
        <Field label="What to wear" placeholder="Mix it up with your craziest colors and patterns…" value={draft.details}
          onChangeText={(details) => set({ details })} multiline maxLength={600} style={{ minHeight: 90, textAlignVertical: 'top' }} />
        <View style={[s.row, { justifyContent: 'space-between' }]}>
          <View style={{ flex: 1 }}>
            <Text style={{ fontWeight: '600', color: C.ink }}>Only some grades</Text>
            <P muted>Off: everyone.</P>
          </View>
          <Switch value={draft.grades} onValueChange={(grades) => set({ grades })} trackColor={{ true: C.primary }} accessibilityLabel="Only some grades" />
        </View>
        {draft.grades && (
          <>
            <GradePicker label="From" value={draft.from} onChange={(from) => set({ from })} />
            <GradePicker label="Through" value={draft.to} onChange={(to) => set({ to })} />
          </>
        )}
        <Button label={busy ? 'Saving…' : draft.id ? 'Save changes' : 'Add dress-up day'} onPress={save}
          disabled={busy || !draft.date || !draft.title.trim()} />
        {draft.id && <Text style={{ color: C.muted, textAlign: 'center' }} onPress={() => setDraft(blank(draft.week))}>Cancel</Text>}
      </Card>

      <PastToggle count={split.past.length} shown={past.shown} onToggle={past.toggle} />
      {past.shown && list(split.past, true)}
      {split.upcoming.length ? list(split.upcoming, false) : <Card><P muted>No dress-up days coming up.</P></Card>}
    </ScrollView>
  );
}
