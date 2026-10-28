/**
 * One report. The sender sees what they sent, its status and the team's reply. Triage also sets
 * the status, priority and workshop, and writes the reply (the sender is told when the status or
 * the reply changes).
 */
import { useCallback, useState } from 'react';
import { Alert, ScrollView, Text, View } from 'react-native';
import { Stack, useFocusEffect, useLocalSearchParams } from 'expo-router';
import {
  errorText, listFeedback, listWorkshops, myAccess, triageFeedback, type Feedback, type FeedbackWorkshop,
} from '../../src/api/connect';
import { isPastDay } from '../../src/calendar/past';
import { PRIORITIES, STATUSES, areaLabel, kindInfo, statusInfo, type FeedbackPriority, type FeedbackStatus } from '../../src/feedback/kinds';
import { Pills } from '../../src/feedback/ui';
import { Button, C, Card, Chip, Field, H, Loading, P, s } from '../../src/ui';

export default function FeedbackDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [f, setF] = useState<Feedback | null | undefined>(undefined);
  const [workshops, setWorkshops] = useState<FeedbackWorkshop[]>([]);
  const [triage, setTriage] = useState(false);
  const [status, setStatus] = useState<FeedbackStatus>('new');
  const [priority, setPriority] = useState<FeedbackPriority | null>(null);
  const [reply, setReply] = useState('');
  const [workshop, setWorkshop] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const access = await myAccess().catch(() => null);
      const t = !!access?.permissions.includes('feedback.triage');
      const [list, ws] = await Promise.all([listFeedback(), t ? listWorkshops() : []]);
      const x = list.find((y) => y.id === id) ?? null;
      setTriage(t); setWorkshops(ws); setF(x);
      if (x) { setStatus(x.status); setPriority(x.priority); setReply(x.reply); setWorkshop(x.workshopId); }
    } catch (e) {
      Alert.alert('Could not load it', errorText(e));
      setF(null);
    }
  }, [id]);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  const header = <Stack.Screen options={{ title: 'Feedback' }} />;
  if (f === undefined) return <>{header}<Loading /></>;
  if (!f) return <View style={[s.screen, s.pad]}>{header}<Card><P muted>This feedback isn’t here anymore, or it isn’t yours.</P></Card></View>;

  const st = statusInfo(f.status);
  const changed = status !== f.status || priority !== f.priority || reply.trim() !== f.reply || workshop !== f.workshopId;
  const save = () => {
    setBusy(true);
    triageFeedback(f.id, { status, priority, reply: reply.trim(), workshopId: workshop })
      .then(load).catch((e) => Alert.alert('Could not save it', errorText(e))).finally(() => setBusy(false));
  };
  const choices = workshops.filter((w) => w.id === f.workshopId || !w.heldOn || !isPastDay(w.heldOn));

  return (
    <ScrollView style={s.screen} contentContainerStyle={s.pad} keyboardShouldPersistTaps="handled">
      {header}
      <Card style={{ gap: 8 }}>
        <Text style={{ color: C.muted, fontWeight: '700' }}>{kindInfo(f.kind).emoji} {f.kind === 'bug' ? 'Problem' : 'Idea'} · {areaLabel(f.area)}</Text>
        <Text style={{ fontSize: 18, fontWeight: '800', color: C.ink }}>{f.title}</Text>
        {!!f.details && <P>{f.details}</P>}
        <P muted>
          {[triage ? `${f.authorName}${f.authorRole ? ` (${f.authorRole})` : ''}` : null,
            new Date(f.createdAt).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }), f.device || null]
            .filter(Boolean).join(' · ')}
        </P>
        <View style={s.row}><Chip label={st.label} color={st.color} /></View>
      </Card>

      {!triage && (
        <Card>
          <H>From the team</H>
          <P muted={!f.reply}>{f.reply || 'No reply yet. You’ll get a notification when there is one.'}</P>
        </Card>
      )}

      {triage && (<>
        <Card>
          <H>Status</H>
          <Pills options={STATUSES} value={status} onChange={setStatus} />
        </Card>
        <Card>
          <H>Priority</H>
          <Pills options={[...PRIORITIES, { key: 'none' as const, label: 'None' }]} value={priority ?? 'none'}
            onChange={(k) => setPriority(k === 'none' ? null : k)} />
        </Card>
        <Card>
          <H>Workshop</H>
          {choices.length === 0
            ? <P muted>No workshops coming up. Add one under Feedback → Workshops.</P>
            : <Pills options={[{ key: 'none', label: 'None' }, ...choices.map((w) => ({ key: w.id, label: `🎓 ${w.title}` }))]} value={workshop ?? 'none'}
                onChange={(k) => setWorkshop(k === 'none' ? null : k)} />}
        </Card>
        <Card>
          <Field label="Reply to the sender" hint="They see it with the status, and are told when either changes." value={reply}
            onChangeText={setReply} multiline maxLength={2000} style={{ minHeight: 90, textAlignVertical: 'top' }} />
        </Card>
        <Button label={busy ? 'Saving…' : 'Save'} onPress={save} disabled={busy || !changed} />
      </>)}
    </ScrollView>
  );
}
