/**
 * One Ask the Teacher conversation, texting style (yours on the right). `id` 'new' with
 * `student` and `teacher` starts one: the first message creates it. Parents and reviewers
 * read it without a composer.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, Pressable, ScrollView, Text, View } from 'react-native';
import { Stack, router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import {
  getUser, live, session, subscribeTeacherMessages, teacherSend, teacherThread, teacherThreadFor, teacherThreadRead,
  type Person, type TeacherThread,
} from '../../src/api/connect';
import { C, Card, Input, Loading, P, s, useBottomInset } from '../../src/ui';

const nameOf = (id: string) => { const p = getUser(id); return p ? `${p.firstName} ${p.lastName}`.trim() : ''; };

export default function Conversation() {
  const { id, student, teacher } = useLocalSearchParams<{ id: string; student?: string; teacher?: string }>();
  const fresh = id === 'new';
  const [me, setMe] = useState<Person | null>(null);
  const [thread, setThread] = useState<TeacherThread | null | undefined>(undefined);
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const scroll = useRef<ScrollView>(null);
  const bottomInset = useBottomInset();

  const load = useCallback(async () => {
    if (!live) return setThread(null);
    const p = await session().catch(() => null);
    setMe(p);
    // A conversation opened as "new" may already exist (someone wrote first): go to it.
    if (fresh && student && teacher) {
      const existing = await teacherThreadFor(student, teacher).catch(() => null);
      if (existing) return router.replace(`/teachers/${existing}`);
      return setThread(null);
    }
    const t = await teacherThread(id).catch(() => null);
    setThread(t);
    if (t && p && (p.id === t.studentId || p.id === t.teacherId)) teacherThreadRead(t.id).catch(() => {});
  }, [id, fresh, student, teacher]);
  useFocusEffect(useCallback(() => { load(); return subscribeTeacherMessages(load); }, [load]));
  useEffect(() => { setTimeout(() => scroll.current?.scrollToEnd({ animated: false }), 100); }, [thread?.messages.length]);

  const studentId = thread?.studentId ?? student;
  const teacherId = thread?.teacherId ?? teacher;
  const other = me && studentId && teacherId ? (me.id === studentId ? thread?.teacherName ?? nameOf(teacherId) : me.id === teacherId ? thread?.studentName ?? nameOf(studentId) : null) : null;
  const title = other ?? (thread ? `${thread.studentName} · ${thread.teacherName}` : 'Ask the Teacher');
  const canWrite = fresh ? !!me && (me.id === student || me.id === teacher) : !!thread?.canWrite;

  const send = async () => {
    const body = draft.trim();
    if (!body || !studentId || !teacherId) return;
    setBusy(true);
    try {
      const threadId = await teacherSend(studentId, teacherId, body);
      setDraft('');
      if (fresh) router.replace(`/teachers/${threadId}`); else await load();
    } catch (e: any) {
      Alert.alert('Ask the Teacher', e.message);
    } finally { setBusy(false); }
  };

  const header = <Stack.Screen options={{ title }} />;
  if (thread === undefined) return <>{header}<Loading /></>;
  if (!fresh && !thread) return <View style={[s.screen, s.pad]}>{header}<Card><P muted>This conversation isn't available.</P></Card></View>;
  const messages = thread?.messages ?? [];

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined} keyboardVerticalOffset={100}>
      {header}
      <ScrollView ref={scroll} style={s.screen} contentContainerStyle={[s.pad, { gap: 8 }]} keyboardShouldPersistTaps="handled">
        {!canWrite && thread && (
          <Card style={{ flexDirection: 'row', gap: 10, alignItems: 'center' }}>
            <Ionicons name="eye-outline" size={20} color={C.muted} />
            <Text style={{ flex: 1, color: C.muted }}>You can read this conversation. Only {thread.studentName} and {thread.teacherName} write here.</Text>
          </Card>
        )}
        {messages.length === 0 && <P muted>{canWrite ? `Write your first message${other ? ` to ${other}` : ''}.` : 'No messages yet.'}</P>}
        {messages.map((m, i) => {
          const mine = m.authorId === me?.id;
          const fromTeacher = m.authorId === teacherId;
          const day = new Date(m.createdAt).toDateString();
          const newDay = i === 0 || new Date(messages[i - 1].createdAt).toDateString() !== day;
          return (
            <View key={m.id} style={{ gap: 6 }}>
              {newDay && <Text style={{ alignSelf: 'center', color: C.muted, fontSize: 12, fontWeight: '700' }}>
                {new Date(m.createdAt).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}
              </Text>}
              <View style={{ alignSelf: mine ? 'flex-end' : 'flex-start', maxWidth: '82%', gap: 2 }}>
                {!mine && <Text style={{ fontSize: 12, color: C.muted, fontWeight: '700', marginLeft: 4 }}>
                  {fromTeacher ? thread?.teacherName : thread?.studentName}
                </Text>}
                <View style={{ borderRadius: 18, paddingHorizontal: 14, paddingVertical: 9,
                  backgroundColor: mine ? C.primary : '#E9EDF5', borderBottomRightRadius: mine ? 4 : 18, borderBottomLeftRadius: mine ? 18 : 4 }}>
                  <Text style={{ fontSize: 16, lineHeight: 22, color: mine ? '#fff' : C.ink }}>{m.body}</Text>
                </View>
                <Text style={{ fontSize: 11, color: C.muted, alignSelf: mine ? 'flex-end' : 'flex-start', marginHorizontal: 4 }}>
                  {new Date(m.createdAt).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}
                </Text>
              </View>
            </View>
          );
        })}
      </ScrollView>
      {canWrite && (
        <View style={[s.row, { padding: 10, paddingBottom: 10 + bottomInset, backgroundColor: C.card, borderTopWidth: 1, borderTopColor: C.line }]}>
          <Input style={{ flex: 1, maxHeight: 120 }} placeholder="Message…" value={draft} onChangeText={setDraft} maxLength={2000} multiline />
          <Pressable onPress={send} disabled={busy || !draft.trim()} accessibilityRole="button" accessibilityLabel="Send"
            style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: C.primary, alignItems: 'center', justifyContent: 'center',
              opacity: busy || !draft.trim() ? 0.4 : 1 }}>
            <Ionicons name="send" size={18} color="#fff" />
          </Pressable>
        </View>
      )}
    </KeyboardAvoidingView>
  );
}
