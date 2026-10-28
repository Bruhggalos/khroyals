/** Send a bug report or a feature idea. The phone and app version go along, so the team can reproduce it. */
import { useState } from 'react';
import { Alert, Platform, ScrollView } from 'react-native';
import { Stack, router, useLocalSearchParams } from 'expo-router';
import Constants from 'expo-constants';
import { errorText, sendFeedback } from '../../src/api/connect';
import { AREAS, KINDS, deviceLine, kindInfo, type FeedbackKind } from '../../src/feedback/kinds';
import { Pills } from '../../src/feedback/ui';
import { Button, Card, Field, H, P, s } from '../../src/ui';

export default function NewFeedback() {
  const params = useLocalSearchParams<{ kind?: string }>();
  const [kind, setKind] = useState<FeedbackKind>(params.kind === 'idea' ? 'idea' : 'bug');
  const [area, setArea] = useState<string | null>(null);
  const [title, setTitle] = useState('');
  const [details, setDetails] = useState('');
  const [busy, setBusy] = useState(false);
  const device = deviceLine(Platform.OS, Platform.OS === 'web' ? null : Platform.Version, Constants.expoConfig?.version);

  const send = () => {
    setBusy(true);
    sendFeedback({ kind, area: area ?? 'other', title: title.trim(), details: details.trim(), device })
      .then(() => {
        router.back();
        Alert.alert('Thank you!', 'The team will look at it. You’ll see their reply in Feedback.');
      })
      .catch((e) => Alert.alert('Could not send it', errorText(e)))
      .finally(() => setBusy(false));
  };

  return (
    <ScrollView style={s.screen} contentContainerStyle={s.pad} keyboardShouldPersistTaps="handled">
      <Stack.Screen options={{ title: kind === 'bug' ? 'Report a problem' : 'Suggest an idea' }} />
      <Card>
        <H>What is it?</H>
        <Pills options={KINDS.map((k) => ({ key: k.key, label: `${k.emoji} ${k.label}` }))} value={kind} onChange={setKind} />
      </Card>
      <Card>
        <H>Where in the app?</H>
        <Pills options={AREAS} value={area} onChange={setArea} />
      </Card>
      <Card>
        <Field label="In a few words" placeholder={kind === 'bug' ? 'e.g. The car line map keeps spinning' : 'e.g. Add events to my phone’s calendar'}
          value={title} onChangeText={setTitle} maxLength={120} />
        <Field label="Details" hint={kindInfo(kind).hint} value={details} onChangeText={setDetails} multiline maxLength={4000}
          style={{ minHeight: 120, textAlignVertical: 'top' }} />
        <P muted>Sent with your name and {device}.</P>
      </Card>
      <Button label={busy ? 'Sending…' : 'Send'} onPress={send} disabled={busy || !title.trim() || !area} />
    </ScrollView>
  );
}
