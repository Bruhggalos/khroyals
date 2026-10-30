/** A check-out list for a field trip, class party or other event: a name, the day, and students from the sections the teacher leads. */
import { useEffect, useState } from 'react';
import { Alert, Pressable, ScrollView, Text, View } from 'react-native';
import { Stack, router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { checkoutMyStudents, errorText, saveCheckoutList } from '../../src/api/connect';
import { schoolToday } from '../../src/calendar/past';
import { gradeLabel } from '../../src/comms/grades';
import { DateField } from '../../src/forms/DateTimeField';
import { Button, C, Field, Loading, P, s } from '../../src/ui';

export default function NewCheckoutList() {
  const [title, setTitle] = useState('');
  const [day, setDay] = useState(schoolToday());
  const [students, setStudents] = useState<{ id: string; name: string; grade: number | null; sections: string }[] | null>(null);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  useEffect(() => { checkoutMyStudents().then(setStudents).catch((e) => { setStudents([]); Alert.alert('Event check-out', errorText(e)); }); }, []);

  const toggle = (id: string) => setPicked((p) => { const n = new Set(p); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const all = !!students && students.length > 0 && picked.size === students.length;
  const save = async () => {
    if (!title.trim()) return Alert.alert('Almost there', 'Give the list a name, like "Zoo field trip".');
    if (picked.size === 0) return Alert.alert('Almost there', 'Choose the students going.');
    setBusy(true);
    try { router.replace(`/checkout/${await saveCheckoutList({ title: title.trim(), day, studentIds: [...picked] })}`); }
    catch (e) { Alert.alert('Event check-out', errorText(e)); } finally { setBusy(false); }
  };

  return (
    <ScrollView style={s.screen} contentContainerStyle={s.pad} keyboardShouldPersistTaps="handled">
      <Stack.Screen options={{ title: 'New check-out list' }} />
      <Field label="Name" placeholder="Zoo field trip" value={title} onChangeText={setTitle} maxLength={120} />
      <DateField label="Day" value={day} onChange={setDay} min={schoolToday()} />
      <View style={[s.row, { justifyContent: 'space-between' }]}>
        <Text style={{ fontSize: 12, fontWeight: '700', color: C.muted }}>STUDENTS ({picked.size})</Text>
        {!!students?.length && (
          <Text style={{ color: C.primary, fontWeight: '700' }} accessibilityRole="button"
            onPress={() => setPicked(all ? new Set() : new Set(students.map((x) => x.id)))}>{all ? 'Clear all' : 'Choose all'}</Text>
        )}
      </View>
      {students === null ? <Loading /> : students.length === 0
        ? <P muted>{"You don't lead a class section yet. The office sets up sections in Admin portal → Classes."}</P>
        : students.map((st) => {
          const on = picked.has(st.id);
          return (
            <Pressable key={st.id} onPress={() => toggle(st.id)} accessibilityRole="checkbox" accessibilityState={{ checked: on }}
              style={{ flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12, borderRadius: 12, borderWidth: 1,
                borderColor: on ? C.primary : C.line, backgroundColor: on ? C.primary + '12' : '#fff' }}>
              <Ionicons name={on ? 'checkbox' : 'square-outline'} size={22} color={on ? C.primary : C.muted} />
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 16, fontWeight: '700', color: C.ink }}>{st.name}</Text>
                <Text style={{ fontSize: 13, color: C.muted }}>{[gradeLabel(st.grade), st.sections].filter(Boolean).join(' · ')}</Text>
              </View>
            </Pressable>
          );
        })}
      <Button label={busy ? 'Saving…' : 'Make the list'} disabled={busy} onPress={save} />
    </ScrollView>
  );
}
