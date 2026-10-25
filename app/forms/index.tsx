/**
 * Forms: permission slips, releases and acknowledgments. Parents see the forms that went
 * to their children, the ones still to sign first. In the Main Page's Staff view,
 * faculty and staff see the forms they've sent, with how many have signed, and send new ones.
 */
import { useCallback, useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { errorText, isSchoolStaff, myForms, sentForms, type MyForm, type Person, type SentForm } from '../../src/api/connect';
import { PAST_STYLE, PastToggle, usePastToggle } from '../../src/calendar/PastToggle';
import { FormsGate } from '../../src/schoolForms/FormsGate';
import { GREEN, Progress, dueText } from '../../src/schoolForms/parts';
import { useStaffView } from '../../src/staffView';
import { SectionTitle } from '../../src/volunteer/parts';
import { Button, C, Card, Loading, P, s } from '../../src/ui';

export default function Forms() {
  return <FormsGate title="Forms">{(me) => <List me={me} />}</FormsGate>;
}

/** Every child signed for, or the form is closed. */
const finished = (f: MyForm) => f.status === 'closed' || f.children.every((c) => c.response);

function List({ me }: { me: Person }) {
  const staffView = useStaffView(me);
  const [data, setData] = useState<{ mine: MyForm[]; sent: SentForm[] } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const showDone = usePastToggle();

  const load = useCallback(async () => {
    try {
      const [mine, sent] = await Promise.all([staffView ? [] : myForms(), staffView ? sentForms() : []]);
      setData({ mine, sent }); setError(null);
    } catch (e) {
      setError(errorText(e));
    }
  }, [staffView]);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  if (error && !data) return <View style={[s.screen, s.pad]}><Card><P muted>{error}</P><Button label="Try again" onPress={load} /></Card></View>;
  if (!data) return <Loading />;

  if (staffView) {
    return (
      <ScrollView style={s.screen} contentContainerStyle={s.pad}>
        <Button label="+ New form" onPress={() => router.push('/forms/new')} />
        {data.sent.length === 0 && <Card><P muted>Forms you send to a class, an activity or the school show up here, with who has signed.</P></Card>}
        {data.sent.map((f) => {
          const signed = f.agreed + f.declined;
          return (
            <Card key={f.id} onPress={() => router.push(`/forms/${f.id}`)} style={f.status === 'closed' ? { gap: 4, ...PAST_STYLE } : { gap: 4 }}>
              <Text style={{ fontSize: 16, fontWeight: '800', color: C.ink }}>{f.title}</Text>
              <Text style={{ color: C.muted }}>{[f.sentTo, dueText(f)].filter(Boolean).join(' · ')}</Text>
              <Progress done={signed} total={f.students} />
              <Text style={{ color: C.ink, fontWeight: '600' }}>
                {signed} of {f.students} signed{f.declined ? ` · ${f.declined} declined` : ''}{f.feeCents ? ` · ${f.paid} paid` : ''}
              </Text>
            </Card>
          );
        })}
      </ScrollView>
    );
  }

  const todo = data.mine.filter((f) => !finished(f));
  const done = data.mine.filter(finished);
  return (
    <ScrollView style={s.screen} contentContainerStyle={s.pad}>
      {todo.length > 0 && <SectionTitle icon="create-outline" title={`To sign (${todo.length})`} />}
      {todo.map((f) => <FormRow key={f.id} f={f} />)}
      {todo.length === 0 && (
        <Card style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
          <Ionicons name="checkmark-done-circle" size={28} color={GREEN} />
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 16, fontWeight: '800', color: C.ink }}>You’re all caught up</Text>
            <P muted>Permission slips, releases and acknowledgments from the school show up here.</P>
          </View>
        </Card>
      )}
      <PastToggle count={done.length} shown={showDone.shown} onToggle={showDone.toggle} noun="signed forms" />
      {showDone.shown && done.map((f) => <FormRow key={f.id} f={f} />)}
      {isSchoolStaff(me) && <P muted>To send a form, switch the Main Page to Staff.</P>}
    </ScrollView>
  );
}

/** A form for a parent: its title, due date, and each child's status. */
function FormRow({ f }: { f: MyForm }) {
  const open = !finished(f);
  return (
    <Pressable onPress={() => router.push(`/forms/${f.id}`)} accessibilityRole="button"
      style={({ pressed }) => [s.card, { gap: 6 }, !open && PAST_STYLE, pressed && { opacity: 0.85 }]}>
      <View style={s.row}>
        <Ionicons name={open ? 'create-outline' : 'checkmark-circle'} size={22} color={open ? C.accent : GREEN} />
        <Text style={{ flex: 1, fontSize: 16, fontWeight: '800', color: C.ink }}>{f.title}</Text>
        <Ionicons name="chevron-forward" size={18} color={C.muted} />
      </View>
      <Text style={{ color: C.muted }}>{[f.sentTo, dueText(f)].filter(Boolean).join(' · ')}</Text>
      <View style={[s.row, { flexWrap: 'wrap', gap: 10 }]}>
        {f.children.map((c) => (
          <Text key={c.studentId} style={{ fontWeight: '700', color: c.response ? (c.response.agreed ? GREEN : C.danger) : C.accent }}>
            {c.name}: {c.response ? (c.response.agreed ? 'signed' : 'declined') : 'to sign'}
          </Text>
        ))}
      </View>
    </Pressable>
  );
}

