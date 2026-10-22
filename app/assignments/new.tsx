/** Add an assignment: a teacher picks one of their classes (its students are told); a student adds their own. */
import { useEffect, useState } from 'react';
import { Alert, ScrollView, Text, View } from 'react-native';
import { Stack, router } from 'expo-router';
import { addAssignment, isSchoolStaff, mySections, session, type Person, type Section } from '../../src/api/connect';
import { schoolToday } from '../../src/calendar/past';
import { DateField } from '../../src/forms/DateTimeField';
import { Button, C, Card, Field, Loading, P, s } from '../../src/ui';

export default function NewAssignment() {
  const [me, setMe] = useState<Person | null | undefined>(undefined);
  const [sections, setSections] = useState<Section[]>([]);
  const [roster, setRoster] = useState<string | null>(null);
  const [title, setTitle] = useState('');
  const [details, setDetails] = useState('');
  const [due, setDue] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    session().then(async (p) => {
      setMe(p);
      if (p && isSchoolStaff(p)) {
        const list = await mySections().catch(() => []);
        setSections(list);
        if (list.length === 1) setRoster(list[0].id);
      }
    }).catch(() => setMe(null));
  }, []);

  const header = <Stack.Screen options={{ title: me && isSchoolStaff(me) ? 'Assign to a class' : 'Add an assignment' }} />;
  if (me === undefined) return <>{header}<Loading /></>;
  const teacher = !!me && isSchoolStaff(me);

  const save = async () => {
    const problem = !title.trim() ? 'Add a title.' : teacher && !roster ? 'Choose the class.' : null;
    if (problem) return Alert.alert('Almost there', problem);
    setBusy(true);
    try {
      await addAssignment({ title: title.trim(), details: details.trim(), dueOn: due || null, rosterId: teacher ? roster : null });
      router.back();
    } catch (e: any) {
      Alert.alert("Couldn't add it", e.message);
    } finally { setBusy(false); }
  };

  return (
    <ScrollView style={s.screen} contentContainerStyle={s.pad} keyboardShouldPersistTaps="handled">
      {header}
      {teacher && (
        <Card style={{ gap: 8 }}>
          <Text style={{ fontSize: 13, fontWeight: '700', color: C.ink }}>Class</Text>
          <View style={[s.row, { gap: 6, flexWrap: 'wrap' }]}>
            {sections.map((sec) => (
              <Text key={sec.id} onPress={() => setRoster(sec.id)} accessibilityRole="button" accessibilityState={{ selected: roster === sec.id }}
                style={{ paddingHorizontal: 12, paddingVertical: 7, borderRadius: 999, overflow: 'hidden', borderWidth: 1, borderColor: C.line,
                  backgroundColor: roster === sec.id ? C.primary : '#fff', color: roster === sec.id ? '#fff' : C.ink, fontWeight: '600' }}>
                {sec.name}
              </Text>
            ))}
          </View>
          <P muted>Every student in the class sees it in their Assignments and gets a notification.</P>
        </Card>
      )}
      <Card>
        <Field label="What's the assignment?" placeholder={teacher ? 'e.g. Persuasive essay' : 'e.g. Read chapter 4'} value={title} onChangeText={setTitle} maxLength={120} />
        <Field label="Details (optional)" style={{ minHeight: 90, textAlignVertical: 'top' }} multiline maxLength={2000}
          placeholder="Pages, what to turn in, where to find it…" value={details} onChangeText={setDetails} />
        <DateField label="Due (optional)" optional value={due} onChange={setDue} min={schoolToday()} placeholder="No due date" />
      </Card>
      <Button label={busy ? 'Saving…' : teacher ? 'Assign it' : 'Add it'} disabled={busy} onPress={save} />
    </ScrollView>
  );
}
