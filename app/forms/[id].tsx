/**
 * One form. A parent reads it and signs for each of their children it went to (agree,
 * answering the questions, or decline), by typing their full name; they can change it
 * while the form is open, and see whether its fee has been paid. Its sender sees every
 * student's signature, records payments as they come in (how much, how, where it was
 * handed in, and when), reminds the families still to sign, and closes it.
 */
import { useCallback, useState } from 'react';
import { Alert, Pressable, ScrollView, Text, View } from 'react-native';
import { useFocusEffect, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import {
  closeForm, errorText, formStatus, isSchoolStaff, myForms, remindForm, signForm,
  type FormStatus, type MyForm, type Person,
} from '../../src/api/connect';
import { FormsGate } from '../../src/schoolForms/FormsGate';
import { FormHeader, GREEN, Progress, QuestionInput, SignatureLine } from '../../src/schoolForms/parts';
import { PaymentEditor, PaymentLine } from '../../src/schoolForms/PaymentEditor';
import { money } from '../../src/schoolForms/payments';
import { SectionTitle } from '../../src/volunteer/parts';
import { Button, C, Card, Field, Loading, P, ask, s } from '../../src/ui';

export default function FormScreen() {
  return <FormsGate title="Form">{(me) => <Form me={me} />}</FormsGate>;
}

function Form({ me }: { me: Person }) {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [data, setData] = useState<{ mine: MyForm | null; status: FormStatus | null } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const [mine, status] = await Promise.all([myForms(), isSchoolStaff(me) ? formStatus(id) : null]);
      setData({ mine: mine.find((f) => f.id === id) ?? null, status }); setError(null);
    } catch (e) {
      setError(errorText(e));
    }
  }, [id, me]);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  if (error && !data) return <View style={[s.screen, s.pad]}><Card><P muted>{error}</P><Button label="Try again" onPress={load} /></Card></View>;
  if (!data) return <Loading />;
  const form = data.mine ?? data.status;
  if (!form) return <View style={[s.screen, s.pad]}><Card><P muted>This form isn’t one of yours, or it’s no longer here.</P></Card></View>;

  return (
    <ScrollView style={s.screen} contentContainerStyle={s.pad} keyboardShouldPersistTaps="handled">
      <FormHeader form={form} />
      {data.mine?.children.map((c) => (
        <SignCard key={c.studentId} form={data.mine!} child={c} me={me} onSigned={load} />
      ))}
      {data.status && <Status status={data.status} onChange={load} />}
    </ScrollView>
  );
}

/** Signing for one child: the questions, the typed name, and Agree or Decline. */
function SignCard({ form, child, me, onSigned }: { form: MyForm; child: MyForm['children'][number]; me: Person; onSigned: () => void }) {
  const done = child.response;
  const [editing, setEditing] = useState(!done);
  const [answers, setAnswers] = useState<Record<string, string>>(done?.answers ?? {});
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const open = form.status === 'open';

  const submit = async (agree: boolean) => {
    const missing = agree && form.questions.find((q) => q.required && !answers[q.id]?.trim());
    const problem = missing ? `Please answer "${missing.prompt}"` : name.trim().length < 2 ? 'Type your full name to sign.' : null;
    if (problem) return Alert.alert('Almost there', problem);
    setBusy(true);
    try {
      await signForm(form.id, child.studentId, agree, answers, name.trim());
      setEditing(false);
      onSigned();
    } catch (e) {
      Alert.alert("Couldn't sign", errorText(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card style={{ gap: 12 }}>
      <SectionTitle icon="person-circle-outline" title={`For ${child.name}`} tint={done ? (done.agreed ? GREEN : C.danger) : C.accent} />
      {done && !editing && (
        <>
          <SignatureLine r={done} questions={form.questions} />
          {open && <Button kind="ghost" label="Change my answer" onPress={() => setEditing(true)} />}
        </>
      )}
      {editing && open && (
        <>
          {form.questions.map((q) => (
            <QuestionInput key={q.id} q={q} value={answers[q.id]} onChange={(v) => setAnswers((a) => ({ ...a, [q.id]: v }))} />
          ))}
          <Field label="Type your full name to sign" placeholder={`${me.firstName} ${me.lastName}`.trim()} value={name} onChangeText={setName}
            autoCapitalize="words" autoComplete="name" maxLength={100}
            hint={`Typing your name signs this form for ${child.name}, as their parent.`} />
          <Button label={busy ? 'Signing…' : 'Sign and agree'} disabled={busy} onPress={() => submit(true)} />
          <Button kind="ghost" label="Decline" disabled={busy}
            onPress={() => ask(`Decline for ${child.name}?`, 'The school will see that you declined.', 'Decline', () => submit(false))} />
        </>
      )}
      {!done && !open && <P muted>This form closed before it was signed.</P>}
      {!!form.feeCents && <PaymentLine fee={form.feeCents} payment={child.payment} />}
    </Card>
  );
}

/** For the sender: who has signed and paid, recording payments, and reminding or closing. */
function Status({ status, onChange }: { status: FormStatus; onChange: () => void }) {
  const [shown, setShown] = useState<string | null>(null);
  const agreed = status.students.filter((x) => x.response?.agreed);
  const declined = status.students.filter((x) => x.response && !x.response.agreed);
  const waiting = status.students.filter((x) => !x.response);
  const open = status.status === 'open';
  const fee = status.feeCents;
  const paid = status.students.filter((x) => x.payment);

  const remind = () => ask('Send a reminder?', `The parents of the ${waiting.length} still to sign get a notification.`, 'Send', async () => {
    try { const n = await remindForm(status.id); Alert.alert('Reminder sent', `${n} parent${n === 1 ? '' : 's'} told.`); onChange(); }
    catch (e) { Alert.alert("Couldn't send it", errorText(e)); }
  });
  const close = () => ask('Close this form?', 'Parents can no longer sign or change their answers.', 'Close form', async () => {
    try { await closeForm(status.id); onChange(); } catch (e) { Alert.alert("Couldn't close it", errorText(e)); }
  });

  const group = (title: string, list: FormStatus['students'], tint: string) => list.length > 0 && (
    <View key={title} style={{ gap: 2 }}>
      <Text style={{ fontSize: 12, fontWeight: '800', letterSpacing: 1, color: tint }}>{title.toUpperCase()} ({list.length})</Text>
      {list.map((x) => {
        const more = !!x.response || !!fee;
        const on = shown === x.studentId;
        return (
          <View key={x.studentId} style={{ paddingVertical: 8, borderTopWidth: 1, borderTopColor: C.line, gap: 8 }}>
            <Pressable disabled={!more} onPress={() => setShown(on ? null : x.studentId)} accessibilityRole={more ? 'button' : undefined}
              accessibilityState={more ? { expanded: on } : undefined} style={[s.row, { gap: 8 }]}>
              <Text style={{ flex: 1, fontWeight: '700', color: C.ink }}>{x.name}</Text>
              {!x.hasParent && <Text style={{ color: C.muted }}>No parent in the app</Text>}
              {!!fee && <Text style={{ fontWeight: '700', color: x.payment ? GREEN : C.muted }}>{x.payment ? 'Paid' : 'Not paid'}</Text>}
              {more && <Ionicons name={on ? 'chevron-up' : 'chevron-down'} size={16} color={C.muted} />}
            </Pressable>
            {on && x.response && <SignatureLine r={x.response} questions={status.questions} />}
            {on && !!fee && (
              <>
                <PaymentLine fee={fee} payment={x.payment} />
                <PaymentEditor key={`${x.studentId}-${x.payment?.receivedOn ?? ''}-${x.payment?.amountCents ?? ''}`} formId={status.id} studentId={x.studentId}
                  name={x.name.split(' ')[0]} fee={fee} payment={x.payment} onSaved={onChange} />
              </>
            )}
          </View>
        );
      })}
    </View>
  );

  return (
    <Card style={{ gap: 12 }}>
      <SectionTitle icon="people-outline" title={fee ? 'Signatures and payments' : 'Signatures'} />
      <Progress done={agreed.length + declined.length} total={status.students.length} />
      <Text style={{ color: C.ink, fontWeight: '600' }}>
        {agreed.length} agreed · {declined.length} declined · {waiting.length} not yet
      </Text>
      {!!fee && (
        <Text style={{ color: C.ink, fontWeight: '600' }}>
          {money(fee)} each · {paid.length} of {status.students.length} paid · {money(paid.reduce((n, x) => n + x.payment!.amountCents, 0))} collected
        </Text>
      )}
      {!!fee && <P muted>Tap a student to record their payment.</P>}
      {group('Not yet', waiting, C.accent)}
      {group('Declined', declined, C.danger)}
      {group('Agreed', agreed, GREEN)}
      {open && waiting.length > 0 && <Button label="Remind the families still to sign" onPress={remind} />}
      {open ? <Button kind="ghost" label="Close form" onPress={close} /> : <P muted>This form is closed.</P>}
    </Card>
  );
}
