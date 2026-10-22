/**
 * Ask the Teacher. A student sees each teacher of their classes and writes to them; a
 * teacher sees their students' conversations and can start one with any student in their
 * classes. Parents read their children's conversations (`?child=` from the Student app),
 * and admins with Student messages read all of them. Only the student and the teacher write.
 */
import { useCallback, useState } from 'react';
import { FlatList, Pressable, Text, View } from 'react-native';
import { Stack, router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import {
  isFamily, isSchoolStaff, live, myChildren, myClassStudents, myTeachers, session, subscribeTeacherMessages, teacherConversations,
  type ClassStudent, type Person, type TeacherContact, type TeacherConversation,
} from '../../src/api/connect';
import { gradeLabel } from '../../src/comms/grades';
import { SectionTitle } from '../../src/volunteer/parts';
import { Button, C, Card, H, Loading, P, s } from '../../src/ui';

type Data = { me: Person | null; teachers: TeacherContact[]; conversations: TeacherConversation[]; students: ClassStudent[]; kids: Person[] };

export default function AskTheTeacher() {
  const { child } = useLocalSearchParams<{ child?: string }>();
  const [data, setData] = useState<Data | null>(null);

  const load = useCallback(async () => {
    const me = live ? await session().catch(() => null) : null;
    const ok = !!me && !me.pending && !isFamily(me);
    const student = ok && me.schoolRole === 'student';
    const staff = ok && isSchoolStaff(me);
    const [teachers, conversations, students, kids] = await Promise.all([
      student ? myTeachers() : [],
      ok && !student ? teacherConversations(child) : [],
      staff ? myClassStudents() : [],
      ok && !student && !staff ? myChildren() : [],
    ]).catch(() => [[], [], [], []] as const);
    setData({ me, teachers: [...teachers], conversations: [...conversations], students: [...students], kids: [...kids] });
  }, [child]);
  useFocusEffect(useCallback(() => { load(); return subscribeTeacherMessages(load); }, [load]));

  const header = <Stack.Screen options={{ title: 'Ask the Teacher' }} />;
  const box = (body: React.ReactNode) => <View style={[s.screen, s.pad]}>{header}{body}</View>;
  if (!live) return box(<Card><H>Ask the Teacher needs the school server</H><P muted>This build is running on demo data.</P></Card>);
  if (!data) return <>{header}<Loading /></>;
  const { me } = data;
  if (!me) return box(
    <Card>
      <H>Sign in to message your teachers</H>
      <P muted>Students write to the teachers of their classes here.</P>
      <Button label="Sign in" onPress={() => router.navigate('/connect')} />
    </Card>,
  );
  if (me.pending || isFamily(me)) return box(<Card><H>For students and their teachers</H><P muted>Ask the Teacher is for students, their teachers and parents.</P></Card>);

  // A student: their teachers, with or without a conversation yet.
  if (me.schoolRole === 'student') return (
    <FlatList style={s.screen} contentContainerStyle={s.pad} data={data.teachers} keyExtractor={(t) => t.teacherId}
      ListHeaderComponent={<>{header}<P muted>Message the teachers of your classes. Your parents can read these conversations too.</P></>}
      ListEmptyComponent={<Card><P muted>Your teachers show up here once the school adds you to your classes.</P></Card>}
      renderItem={({ item: t }) => (
        <Row title={t.teacherName} sub={t.classes} last={t.lastBody} at={t.lastMessageAt} unread={t.unread}
          onPress={() => router.push(t.threadId ? `/teachers/${t.threadId}` : { pathname: '/teachers/[id]', params: { id: 'new', student: me.id, teacher: t.teacherId } })} />
      )} />
  );

  // Teachers, parents and reviewers: the conversations they can read; teachers can start one with a student.
  const staff = isSchoolStaff(me);
  const started = new Set(data.conversations.filter((c) => c.teacherId === me.id).map((c) => c.studentId));
  const others = data.students.filter((x) => !started.has(x.studentId));
  const parentWithKids = !staff && data.kids.length > 0;
  return (
    <FlatList style={s.screen} contentContainerStyle={s.pad} data={data.conversations} keyExtractor={(c) => c.id}
      ListHeaderComponent={<>
        {header}
        <P muted>{staff ? 'Conversations with the students in your classes. Their parents can read them too.'
          : parentWithKids ? "Your children's conversations with their teachers. You can read them; only your child and the teacher write."
          : 'Conversations between students and teachers.'}</P>
      </>}
      ListEmptyComponent={<Card><P muted>{staff ? 'No conversations yet.' : 'No conversations to show.'}</P></Card>}
      renderItem={({ item: c }) => (
        <Row title={c.teacherId === me.id ? c.studentName : c.studentId === me.id ? c.teacherName : `${c.studentName} · ${c.teacherName}`}
          last={c.lastBody} at={c.lastMessageAt} unread={c.unread} onPress={() => router.push(`/teachers/${c.id}`)} />
      )}
      ListFooterComponent={staff && others.length > 0 ? (
        <View style={{ gap: 8, marginTop: 8 }}>
          <SectionTitle icon="people-outline" title="Your students" />
          {others.map((x) => (
            <Row key={x.studentId} title={x.studentName} sub={[gradeLabel(x.grade), x.classes].filter(Boolean).join(' · ')}
              onPress={() => router.push({ pathname: '/teachers/[id]', params: { id: 'new', student: x.studentId, teacher: me.id } })} />
          ))}
        </View>
      ) : null} />
  );
}

/** A person to message, with the latest message and a dot when it's unread. */
function Row({ title, sub, last, at, unread, onPress }: {
  title: string; sub?: string; last?: string | null; at?: string | null; unread?: boolean; onPress: () => void;
}) {
  const when = at ? new Date(at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : null;
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={`${title}${unread ? ', new message' : ''}`}
      style={({ pressed }) => [s.card, s.row, { gap: 12 }, pressed && { opacity: 0.85 }]}>
      <View style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: `${C.primary}1A`, alignItems: 'center', justifyContent: 'center' }}>
        <Text style={{ color: C.primary, fontWeight: '900' }}>{title.split(/\s+/).map((w) => w[0]).slice(0, 2).join('')}</Text>
      </View>
      <View style={{ flex: 1, gap: 2 }}>
        <View style={s.row}>
          <Text style={{ flex: 1, fontSize: 16, fontWeight: unread ? '900' : '700', color: C.ink }} numberOfLines={1}>{title}</Text>
          {!!when && <Text style={{ color: C.muted, fontSize: 12 }}>{when}</Text>}
        </View>
        {!!sub && <Text style={{ color: C.muted }} numberOfLines={1}>{sub}</Text>}
        {!!last && <Text style={{ color: unread ? C.ink : C.muted, fontWeight: unread ? '700' : '400' }} numberOfLines={2}>{last}</Text>}
      </View>
      {unread ? <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: C.accent }} />
        : <Ionicons name="chevron-forward" size={18} color={C.muted} />}
    </Pressable>
  );
}
