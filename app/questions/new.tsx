/** Ask the school a question. */
import { useState } from 'react';
import { Alert, ScrollView, Text, TextInput, View } from 'react-native';
import { router } from 'expo-router';
import { askSchool, QUESTION_TOPICS, type QuestionTopic } from '../../src/api/connect';
import { QuestionsGate } from '../../src/questions/QuestionsGate';
import { Button, C, P, s } from '../../src/ui';

export default function NewQuestion() {
  return <QuestionsGate title="Ask a question">{() => <Form />}</QuestionsGate>;
}

function Form() {
  const [topic, setTopic] = useState<QuestionTopic | null>(null);
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [busy, setBusy] = useState(false);

  const send = async () => {
    const problem = !topic ? 'Choose a topic.' : !subject.trim() ? 'Add a short subject.' : !body.trim() ? 'Write your question.' : null;
    if (problem) return Alert.alert('Almost there', problem);
    setBusy(true);
    try {
      const q = await askSchool(topic!, subject.trim(), body.trim());
      router.replace(`/questions/${q.id}`);
    } catch (e: any) {
      Alert.alert("Couldn't send", e.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <ScrollView style={s.screen} contentContainerStyle={s.pad} keyboardShouldPersistTaps="handled">
      <P muted>The office sends your question to the right person, and you'll be notified when there's an answer. For anything urgent, call the front office at (256) 210-1343.</P>
      <Text style={{ fontSize: 12, fontWeight: '700', color: C.muted }}>TOPIC</Text>
      <View style={[s.row, { flexWrap: 'wrap', gap: 6 }]}>
        {QUESTION_TOPICS.map((t) => (
          <Text key={t} onPress={() => setTopic(t)}
            style={{ paddingHorizontal: 12, paddingVertical: 7, borderRadius: 999, overflow: 'hidden', borderWidth: 1, borderColor: C.line,
              backgroundColor: topic === t ? C.primary : '#fff', color: topic === t ? '#fff' : C.ink, fontWeight: '600' }}>
            {t}
          </Text>
        ))}
      </View>
      <TextInput style={s.input} placeholder="Subject (e.g. Spirit shirts on Fridays?)" value={subject} onChangeText={setSubject} maxLength={120} />
      <TextInput style={[s.input, { minHeight: 140, textAlignVertical: 'top' }]} multiline maxLength={4000}
        placeholder="Your question" value={body} onChangeText={setBody} />
      <Button label={busy ? 'Sending…' : 'Send to the school'} disabled={busy} onPress={send} />
    </ScrollView>
  );
}
