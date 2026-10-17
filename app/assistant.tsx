/**
 * Kingdom Heights Assistant: ask about the handbook, upcoming events, or who to
 * contact. Answers come from Claude on the school's server (the `assistant`
 * Edge Function); the conversation stays on this screen.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Linking, Platform, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { Stack, router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { AssistantError, askAssistant, live, session, type AssistantTurn, type Person } from '../src/api/connect';
import { Button, C, Card, H, Loading, P, s } from '../src/ui';

const ORANGE = '#EA580C';
const SUGGESTIONS = [
  'How do I report an absence?',
  'What does the uniform policy say?',
  "When's the next day off?",
  'Who do I ask about sports?',
];

export default function Assistant() {
  const [me, setMe] = useState<Person | null | undefined>();
  useEffect(() => { session().then(setMe).catch(() => setMe(null)); }, []);

  const header = <Stack.Screen options={{ title: 'Assistant' }} />;
  const box = (body: React.ReactNode) => <View style={[s.screen, s.pad]}>{header}{body}</View>;
  if (!live) return box(<Card><H>The assistant needs the school server</H><P muted>This build is running on demo data.</P></Card>);
  if (me === undefined) return <>{header}<Loading /></>;
  if (!me) return box(
    <Card>
      <H>Sign in to use the assistant</H>
      <P muted>Ask about school policies, upcoming events, or who to contact.</P>
      <Button label="Sign in" onPress={() => router.navigate('/connect')} />
    </Card>,
  );
  if (me.pending) return box(<Card><H>Waiting for approval</H><P muted>The assistant opens once the school office approves your account.</P></Card>);
  return <>{header}<Chat me={me} /></>;
}

function Chat({ me }: { me: Person }) {
  const [turns, setTurns] = useState<AssistantTurn[]>([]);
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [remaining, setRemaining] = useState<number | null>(null);
  const scroll = useRef<ScrollView>(null);

  const ask = useCallback(async (question: string) => {
    const q = question.trim();
    if (!q || busy) return;
    const next: AssistantTurn[] = [...turns, { role: 'user', content: q }];
    setTurns(next); setDraft(''); setProblem(null); setBusy(true);
    try {
      const { answer, remaining: left } = await askAssistant(next);
      setTurns([...next, { role: 'assistant', content: answer }]);
      setRemaining(left);
    } catch (e) {
      setProblem(e instanceof AssistantError ? e.message : "The assistant couldn't answer right now. Please try again.");
      setTurns(turns);   // take the unanswered question back out, so it can be asked again
      setDraft(q);
    } finally {
      setBusy(false);
    }
  }, [busy, turns]);

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined} keyboardVerticalOffset={100}>
      <ScrollView ref={scroll} style={s.screen} contentContainerStyle={s.pad} keyboardShouldPersistTaps="handled"
        onContentSizeChange={() => scroll.current?.scrollToEnd({ animated: true })}>
        <Card style={{ gap: 8 }}>
          <View style={s.row}>
            <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: ORANGE, alignItems: 'center', justifyContent: 'center' }}>
              <Ionicons name="chatbubbles" size={20} color="#fff" />
            </View>
            <Text style={{ flex: 1, fontSize: 17, fontWeight: '800', color: C.ink }}>Hi{me.firstName ? `, ${me.firstName}` : ''}! How can I help?</Text>
          </View>
          <P muted>Ask about the Student / Parent Handbook, what's coming up, or who to contact. Answers come from AI and can be wrong, so check anything important with the front office.</P>
        </Card>

        {turns.length === 0 && (
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            {SUGGESTIONS.map((q) => (
              <Text key={q} onPress={() => ask(q)}
                style={{ paddingHorizontal: 12, paddingVertical: 8, borderRadius: 999, overflow: 'hidden', borderWidth: 1, borderColor: C.line, backgroundColor: '#fff', color: C.primary, fontWeight: '600' }}>
                {q}
              </Text>
            ))}
          </View>
        )}

        {turns.map((t, i) => <Bubble key={i} turn={t} />)}
        {busy && (
          <View style={[s.row, { alignSelf: 'flex-start' }]}>
            <ActivityIndicator color={ORANGE} />
            <Text style={{ color: C.muted }}>Looking that up…</Text>
          </View>
        )}
        {problem && <Card style={{ borderColor: C.danger }}><P>{problem}</P></Card>}
        {remaining !== null && remaining <= 5 && <P muted>{remaining === 0 ? "That was today's last question." : `${remaining} question${remaining === 1 ? '' : 's'} left today.`}</P>}
      </ScrollView>

      <View style={[s.row, { padding: 12, borderTopWidth: 1, borderColor: C.line, backgroundColor: C.card }]}>
        <TextInput style={[s.input, { flex: 1 }]} placeholder="Ask a question…" value={draft} onChangeText={setDraft}
          maxLength={2000} multiline editable={!busy} onSubmitEditing={() => ask(draft)} />
        <Pressable onPress={() => ask(draft)} disabled={busy || !draft.trim()} accessibilityRole="button" accessibilityLabel="Ask"
          style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: ORANGE, alignItems: 'center', justifyContent: 'center', opacity: busy || !draft.trim() ? 0.4 : 1 }}>
          <Ionicons name="arrow-up" size={22} color="#fff" />
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  );
}

// Email addresses and phone numbers in answers can be tapped.
const LINK = /([A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}|\(?\d{3}\)?[ .-]\d{3}[ .-]\d{4})/g;

function Linked({ text, color }: { text: string; color: string }) {
  const parts = text.split(LINK);
  return (
    <Text style={{ fontSize: 15, lineHeight: 22, color }}>
      {parts.map((part, i) => {
        if (i % 2 === 0) return part;
        const href = part.includes('@') ? `mailto:${part}` : `tel:${part.replace(/\D/g, '')}`;
        return <Text key={i} style={{ color: C.primary, fontWeight: '700', textDecorationLine: 'underline' }} onPress={() => Linking.openURL(href)}>{part}</Text>;
      })}
    </Text>
  );
}

function Bubble({ turn }: { turn: AssistantTurn }) {
  const mine = turn.role === 'user';
  return (
    <View style={{
      alignSelf: mine ? 'flex-end' : 'flex-start', maxWidth: '88%', borderRadius: 14, padding: 12,
      backgroundColor: mine ? C.primary : C.card, borderWidth: mine ? 0 : 1, borderColor: C.line,
    }}>
      {mine ? <Text style={{ fontSize: 15, lineHeight: 22, color: '#fff' }}>{turn.content}</Text> : <Linked text={turn.content} color={C.ink} />}
    </View>
  );
}
