/** Ask the School: your questions and their answers, and (for staff) questions assigned to you. */
import { useCallback, useEffect, useState } from 'react';
import { FlatList, Text, View } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { listQuestions, myAccess, subscribeQuestions, type Person, type SchoolQuestion } from '../../src/api/connect';
import { age, ageColor, askerStatus, GREEN, nameOf, waiting, when } from '../../src/questions/format';
import { QuestionsGate } from '../../src/questions/QuestionsGate';
import { Button, C, Card, Chip, Loading, P, s } from '../../src/ui';

type Tab = 'mine' | 'assigned';

export default function Questions() {
  return <QuestionsGate title="Ask the School">{(me) => <List me={me} />}</QuestionsGate>;
}

function List({ me }: { me: Person }) {
  const [questions, setQuestions] = useState<SchoolQuestion[] | null>(null);
  const [tab, setTab] = useState<Tab>('mine');
  const [routes, setRoutes] = useState(false);

  const load = useCallback(() => listQuestions().then(setQuestions).catch(() => setQuestions([])), []);
  useFocusEffect(useCallback(() => { load(); return subscribeQuestions(load); }, [load]));
  useEffect(() => {
    myAccess().then((a) => setRoutes(!!a && (a.tier !== null || a.granted.includes('questions.manage')))).catch(() => {});
  }, []);
  if (!questions) return <Loading />;

  const lists: Record<Tab, SchoolQuestion[]> = {
    mine: questions.filter((q) => q.askerId === me.id),
    assigned: questions.filter((q) => q.assigneeId === me.id && q.askerId !== me.id)
      .sort((a, b) => Number(waiting(b)) - Number(waiting(a)) || (a.waitingSince ?? '').localeCompare(b.waitingSince ?? '')),
  };
  const staff = ['admin', 'teacher', 'staff'].includes(me.schoolRole);
  const tabs: Tab[] = staff || lists.assigned.length ? ['mine', 'assigned'] : ['mine'];

  return (
    <FlatList style={s.screen} contentContainerStyle={s.pad} data={lists[tab]} keyExtractor={(q) => q.id}
      ListHeaderComponent={
        <View style={{ gap: 12 }}>
          <Button label="+ Ask a question" onPress={() => router.push('/questions/new')} />
          {routes && (
            <Card onPress={() => router.push('/admin')} style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <Text style={{ flex: 1, color: C.ink }}>You route questions to faculty and staff.</Text>
              <Text style={{ color: C.primary, fontWeight: '700' }}>Admin portal ›</Text>
            </Card>
          )}
          {tabs.length > 1 && (
            <View style={[s.row, { gap: 6 }]}>
              {tabs.map((t) => (
                <Text key={t} onPress={() => setTab(t)}
                  style={{ paddingHorizontal: 12, paddingVertical: 6, borderRadius: 999, overflow: 'hidden', borderWidth: 1, borderColor: C.line,
                    backgroundColor: tab === t ? C.primary : '#fff', color: tab === t ? '#fff' : C.ink, fontWeight: '600' }}>
                  {t === 'mine' ? 'My questions' : 'Assigned to me'} ({lists[t].length})
                </Text>
              ))}
            </View>
          )}
        </View>}
      ListEmptyComponent={<Card><P muted>{tab === 'mine'
        ? "You haven't asked anything yet. Questions you send, and the school's answers, are kept here."
        : 'Nothing is assigned to you right now.'}</P></Card>}
      renderItem={({ item: q }) => {
        const st = askerStatus(q);
        return (
          <Card onPress={() => router.push(`/questions/${q.id}`)} style={{ gap: 6 }}>
            <Text style={{ fontSize: 16, fontWeight: '700', color: C.ink }}>{q.subject}</Text>
            <View style={[s.row, { flexWrap: 'wrap', gap: 6 }]}>
              <Chip label={q.topic} color={C.muted} />
              {tab === 'mine'
                ? <Chip label={st.label} color={st.color} />
                : waiting(q)
                  ? <Chip label={`Waiting ${age(q.waitingSince)}`} color={ageColor(q.waitingSince)} />
                  : <Chip label={q.status === 'answered' ? 'Answered' : 'Closed'} color={q.status === 'answered' ? GREEN : C.muted} />}
            </View>
            <P muted>{tab === 'mine' ? `Asked ${when(q.createdAt)}` : `From ${nameOf(q.askerId)}`} · updated {when(q.updatedAt)}</P>
          </Card>
        );
      }} />
  );
}
