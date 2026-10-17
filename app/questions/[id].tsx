/**
 * One question: the conversation between the person who asked and the school,
 * a reply box, closing, and (for routers) assigning it to faculty or staff.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { Stack, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import {
  getQuestion, listUsers, myAccess, questionAssign, questionClose, questionReply, subscribeQuestions,
  type Person, type QuestionMessage, type SchoolQuestion,
} from '../../src/api/connect';
import { age, ageColor, askerStatus, GREEN, nameOf, waiting, when } from '../../src/questions/format';
import { QuestionsGate } from '../../src/questions/QuestionsGate';
import { C, Card, Chip, Loading, P, ask, s } from '../../src/ui';

export default function QuestionScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <QuestionsGate title="Question">{(me) => <Detail id={id} me={me} />}</QuestionsGate>;
}

function Detail({ id, me }: { id: string; me: Person }) {
  const [data, setData] = useState<{ question: SchoolQuestion | null; messages: QuestionMessage[] } | null>(null);
  const [router_, setRouter] = useState(false);
  const [staff, setStaff] = useState<Person[]>([]);
  const [find, setFind] = useState<string | null>(null);   // assign search, while open
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const scroll = useRef<ScrollView>(null);

  const load = useCallback(() => getQuestion(id).then(setData).catch(() => setData({ question: null, messages: [] })), [id]);
  useFocusEffect(useCallback(() => { load(); return subscribeQuestions(load); }, [load]));
  useEffect(() => {
    myAccess().then((a) => setRouter(!!a?.permissions.includes('questions.manage'))).catch(() => {});
    listUsers().then((all) => setStaff(all.filter((p) => !p.pending && ['admin', 'teacher', 'staff'].includes(p.schoolRole))
      .sort((a, b) => a.lastName.localeCompare(b.lastName)))).catch(() => {});
  }, []);

  const matches = useMemo(() => {
    const t = (find ?? '').trim().toLowerCase();
    return t ? staff.filter((p) => `${p.firstName} ${p.lastName}`.toLowerCase().includes(t)).slice(0, 6) : staff.slice(0, 6);
  }, [find, staff]);

  const act = (fn: () => Promise<unknown>, after?: () => void) => {
    setBusy(true);
    fn().then(() => { after?.(); return load(); }).catch((e) => Alert.alert('Ask the School', e.message)).finally(() => setBusy(false));
  };

  if (!data) return <Loading />;
  const q = data.question;
  if (!q) return <View style={[s.screen, s.pad]}><Card><P muted>This question isn't available.</P></Card></View>;
  const asker = q.askerId === me.id;
  const st = askerStatus(q);
  const send = () => {
    const body = draft.trim();
    if (body) act(() => questionReply(q.id, body), () => { setDraft(''); setTimeout(() => scroll.current?.scrollToEnd({ animated: true }), 300); });
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined} keyboardVerticalOffset={100}>
      <ScrollView ref={scroll} style={s.screen} contentContainerStyle={s.pad} keyboardShouldPersistTaps="handled">
        <Stack.Screen options={{ title: q.topic }} />
        <Card style={{ gap: 8 }}>
          <Text style={{ fontSize: 20, fontWeight: '800', color: C.ink }}>{q.subject}</Text>
          <View style={[s.row, { flexWrap: 'wrap', gap: 6 }]}>
            <Chip label={q.topic} color={C.muted} />
            <Chip label={st.label} color={st.color} />
            {!asker && waiting(q) && <Chip label={`Waiting ${age(q.waitingSince)}`} color={ageColor(q.waitingSince)} />}
          </View>
          <P muted>{asker ? 'You asked' : `Asked by ${nameOf(q.askerId)}`} · {when(q.createdAt)}</P>
          {!asker && <P muted>{q.assigneeId ? `Assigned to ${q.assigneeId === me.id ? 'you' : nameOf(q.assigneeId)}` : 'Not assigned yet'}</P>}
        </Card>

        {router_ && !asker && (
          <Card style={{ gap: 8 }}>
            <View style={s.row}>
              <Text style={{ flex: 1, fontWeight: '700', color: C.ink }}>Route this question</Text>
              {q.assigneeId && (
                <Text style={{ color: C.danger, fontWeight: '600' }}
                  onPress={() => act(() => questionAssign(q.id, null))}>Unassign</Text>
              )}
            </View>
            {find === null ? (
              <Text style={{ color: C.primary, fontWeight: '700' }} onPress={() => setFind('')}>
                {q.assigneeId ? 'Reassign to someone else' : 'Assign to faculty or staff'}
              </Text>
            ) : (
              <View style={{ gap: 6 }}>
                <TextInput style={[s.input, { padding: 10 }]} placeholder="Search faculty and staff" value={find} onChangeText={setFind} autoFocus />
                {matches.map((p) => (
                  <Text key={p.id} style={{ color: C.primary, paddingVertical: 4 }}
                    onPress={() => ask('Assign this question?', `${p.firstName} ${p.lastName} will be notified and can answer it.`, 'Assign',
                      () => act(() => questionAssign(q.id, p.id), () => setFind(null)))}>
                    + {p.firstName} {p.lastName} · {p.schoolRole}
                  </Text>
                ))}
                <Text style={{ color: C.muted }} onPress={() => setFind(null)}>Cancel</Text>
              </View>
            )}
          </Card>
        )}

        {data.messages.map((m) => {
          const mine = m.authorId === me.id;
          return (
            <View key={m.id} style={{
              alignSelf: mine ? 'flex-end' : 'flex-start', maxWidth: '88%', borderRadius: 14, padding: 12, gap: 4,
              backgroundColor: m.fromSchool ? '#E8F5EC' : mine ? C.primary : C.card, borderWidth: m.fromSchool || mine ? 0 : 1, borderColor: C.line,
            }}>
              <View style={[s.row, { gap: 6 }]}>
                {m.fromSchool && <Ionicons name="school" size={14} color={GREEN} />}
                <Text style={{ fontSize: 13, fontWeight: '800', color: mine && !m.fromSchool ? '#fff' : m.fromSchool ? GREEN : C.ink }}>
                  {mine ? 'You' : nameOf(m.authorId)}{m.fromSchool ? ' · Kingdom Heights' : ''}
                </Text>
                <Text style={{ fontSize: 12, color: mine && !m.fromSchool ? '#DCE3F7' : C.muted }}>{when(m.createdAt)}</Text>
              </View>
              <Text style={{ fontSize: 15, lineHeight: 22, color: mine && !m.fromSchool ? '#fff' : C.ink }}>{m.body}</Text>
            </View>
          );
        })}
        {asker && waiting(q) && <P muted>The school hasn't answered yet. You'll get a notification when it does.</P>}
        {q.status === 'closed' && <P muted>This question is closed. {asker ? 'Replying opens it again.' : ''}</P>}

        {q.status !== 'closed' && (
          <Text style={{ color: C.muted, fontWeight: '600', marginTop: 4 }}
            onPress={() => ask(asker ? 'Mark as resolved?' : 'Close this question?', asker ? 'You can still read it later.' : 'It leaves the waiting list.',
              asker ? 'Resolved' : 'Close', () => act(() => questionClose(q.id)))}>
            {asker ? 'Mark as resolved' : 'Close this question'}
          </Text>
        )}
      </ScrollView>

      <View style={[s.row, { padding: 12, borderTopWidth: 1, borderColor: C.line, backgroundColor: C.card }]}>
        <TextInput style={[s.input, { flex: 1 }]} multiline maxLength={4000} value={draft} onChangeText={setDraft}
          placeholder={asker ? 'Add a follow-up…' : 'Write an answer…'} />
        <Pressable onPress={send} disabled={busy || !draft.trim()} accessibilityRole="button" accessibilityLabel="Send"
          style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: GREEN, alignItems: 'center', justifyContent: 'center', opacity: busy || !draft.trim() ? 0.4 : 1 }}>
          <Ionicons name="send" size={18} color="#fff" />
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  );
}
