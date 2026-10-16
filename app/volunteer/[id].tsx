/**
 * A volunteer opportunity: details, who signed up (people icon + count), Say
 * Yes! / Remove me, and a chat for its volunteers and leader, where the
 * leader's messages stand out. The leader can delete it with a reason that every
 * volunteer is sent.
 */
import { useCallback, useRef, useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, Pressable, ScrollView, Text, View } from 'react-native';
import { Stack, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import {
  getOpportunity, subscribeVolunteer, volunteerDelete, volunteerSayYes, volunteerSend, volunteerWithdraw,
  type Opportunity, type Person, type Signup, type VolunteerMessage,
} from '../../src/api/connect';
import { countLabel, isPast, nameOf, whenLabel } from '../../src/volunteer/format';
import { VolunteerGate } from '../../src/volunteer/VolunteerGate';
import { Button, C, Card, Chip, Field, H, Input, Loading, P, s, ask, useBottomInset } from '../../src/ui';

const GREEN = '#15803D';

export default function OpportunityScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <VolunteerGate title="Volunteer">{(me) => <Detail id={id} me={me} />}</VolunteerGate>;
}

function Detail({ id, me }: { id: string; me: Person }) {
  const [data, setData] = useState<{ opportunity: Opportunity | null; signups: Signup[]; messages: VolunteerMessage[] } | null>(null);
  const [showPeople, setShowPeople] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);   // the reason, while the leader is deleting
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const bottomInset = useBottomInset();
  const scroll = useRef<ScrollView>(null);

  const load = useCallback(() => getOpportunity(id).then(setData).catch(() => setData({ opportunity: null, signups: [], messages: [] })), [id]);
  useFocusEffect(useCallback(() => { load(); return subscribeVolunteer(load); }, [load]));

  const act = (fn: () => Promise<unknown>, after?: () => void) => {
    setBusy(true);
    fn().then(() => { after?.(); return load(); }).catch((e) => Alert.alert('Volunteer', e.message)).finally(() => setBusy(false));
  };

  if (!data) return <Loading />;
  const o = data.opportunity;
  if (!o) return <View style={[s.screen, s.pad]}><Card><P muted>This opportunity isn't available.</P></Card></View>;

  const leading = o.leadId === me.id;
  const signedUp = data.signups.some((x) => x.userId === me.id);
  const n = data.signups.length;
  const full = !!o.spots && n >= o.spots;
  const past = isPast(o);
  const inChat = leading || signedUp;
  const send = () => {
    const body = draft.trim();
    if (!body) return;
    act(() => volunteerSend(o.id, body), () => { setDraft(''); setTimeout(() => scroll.current?.scrollToEnd({ animated: true }), 300); });
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined} keyboardVerticalOffset={100}>
      <ScrollView ref={scroll} style={s.screen} contentContainerStyle={[s.pad, { paddingBottom: 16 + bottomInset }]} keyboardShouldPersistTaps="handled">
        <Stack.Screen options={{ title: o.title }} />
        <Card style={{ gap: 8 }}>
          <Text style={{ fontSize: 22, fontWeight: '800', color: C.ink }}>{o.title}</Text>
          <Line icon="calendar-outline" text={whenLabel(o)} />
          {!!o.location && <Line icon="location-outline" text={o.location} />}
          <Line icon="star" text={leading ? 'You lead this opportunity' : `Led by ${nameOf(o.leadId)}`} color={C.accent} />
          {!!o.description && <P>{o.description}</P>}
        </Card>

        {/* Who's volunteering: everyone can see the names and the count. */}
        <Pressable onPress={() => setShowPeople(!showPeople)} accessibilityRole="button" accessibilityLabel={`${n} volunteers. Show who.`}
          style={[s.card, s.row]}>
          <Ionicons name="people" size={24} color={C.primary} />
          <Text style={{ flex: 1, fontSize: 16, fontWeight: '700', color: C.ink }}>
            {countLabel(n, o.spots)} {o.spots ? 'spots filled' : n === 1 ? 'volunteer' : 'volunteers'}
          </Text>
          <Ionicons name={showPeople ? 'chevron-up' : 'chevron-down'} size={18} color={C.muted} />
        </Pressable>
        {showPeople && (
          <Card style={{ gap: 6 }}>
            <View style={s.row}>
              <Ionicons name="star" size={16} color={C.accent} />
              <Text style={{ flex: 1, fontWeight: '700', color: C.ink }}>{nameOf(o.leadId)}</Text>
              <Chip label="Leader" color={C.accent} />
            </View>
            {data.signups.length === 0 && <P muted>No volunteers yet.</P>}
            {data.signups.map((x) => (
              <View key={x.userId} style={s.row}>
                <Ionicons name="person-circle-outline" size={18} color={C.muted} />
                <Text style={{ flex: 1, color: C.ink }}>{x.userId === me.id ? 'You' : nameOf(x.userId)}</Text>
              </View>
            ))}
          </Card>
        )}

        {o.status === 'deleted' ? (
          <Card style={{ borderColor: C.danger, borderWidth: 1 }}>
            <H>Cancelled</H>
            <P>{o.deleteReason}</P>
          </Card>
        ) : leading ? (
          deleting === null ? (
            <Text style={{ color: C.danger, fontWeight: '600' }} onPress={() => setDeleting('')}>Delete this opportunity</Text>
          ) : (
            <Card style={{ gap: 8 }}>
              <H>Delete this opportunity</H>
              <P muted>Every volunteer is sent your reason.</P>
              <Field label="Reason" style={{ minHeight: 70, textAlignVertical: 'top' }} multiline placeholder="e.g. Rained out, moved to Friday"
                value={deleting} onChangeText={setDeleting} />
              <View style={s.row}>
                <View style={{ flex: 1 }}>
                  <Button label="Delete and notify" disabled={busy || !deleting.trim()}
                    onPress={() => ask('Delete this opportunity?', `${n} volunteer${n === 1 ? '' : 's'} will get your reason.`, 'Delete',
                      () => act(() => volunteerDelete(o.id, deleting), () => setDeleting(null)))} />
                </View>
                <View style={{ flex: 1 }}><Button kind="ghost" label="Keep it" onPress={() => setDeleting(null)} /></View>
              </View>
            </Card>
          )
        ) : signedUp ? (
          <Card style={{ borderColor: GREEN, borderWidth: 2, gap: 8 }}>
            <View style={s.row}>
              <Ionicons name="checkmark-circle" size={24} color={GREEN} />
              <Text style={{ flex: 1, fontSize: 17, fontWeight: '800', color: GREEN }}>You said yes!</Text>
            </View>
            {!past && (
              <Text style={{ color: C.danger, fontWeight: '600' }}
                onPress={() => ask('Remove yourself?', `${nameOf(o.leadId)} will be told you can't make it.`, 'Remove me', () => act(() => volunteerWithdraw(o.id)))}>
                Remove me
              </Text>
            )}
          </Card>
        ) : past ? (
          <Card><P muted>This opportunity is over.</P></Card>
        ) : full ? (
          <Card><P muted>All spots are filled. Thank you to everyone who said yes!</P></Card>
        ) : (
          <Pressable disabled={busy} onPress={() => act(() => volunteerSayYes(o.id))} accessibilityRole="button"
            style={({ pressed }) => [s.btn, { backgroundColor: GREEN, paddingVertical: 18, flexDirection: 'row', justifyContent: 'center', gap: 10 },
              (pressed || busy) && { opacity: 0.75 }]}>
            <Ionicons name="hand-left" size={22} color="#fff" />
            <Text style={[s.btnT, { fontSize: 19 }]}>Say Yes!</Text>
          </Pressable>
        )}

        <Text style={{ fontSize: 12, fontWeight: '700', color: C.muted, marginTop: 8 }}>CHAT</Text>
        {!inChat ? (
          <Card><P muted>Say Yes! to join the conversation with the other volunteers and {nameOf(o.leadId)}.</P></Card>
        ) : (
          <View style={{ gap: 8 }}>
            {data.messages.length === 0 && <P muted>No messages yet. Say hello!</P>}
            {data.messages.map((m) => <Bubble key={m.id} m={m} lead={m.authorId === o.leadId} mine={m.authorId === me.id} />)}
            {o.status === 'open' && (
              <View style={s.row}>
                <Input style={{ flex: 1 }} placeholder={leading ? 'Message your volunteers…' : 'Message the group…'}
                  value={draft} onChangeText={setDraft} maxLength={1000} multiline />
                <Pressable onPress={send} disabled={busy || !draft.trim()} accessibilityRole="button" accessibilityLabel="Send"
                  style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: C.primary, alignItems: 'center', justifyContent: 'center',
                    opacity: busy || !draft.trim() ? 0.4 : 1 }}>
                  <Ionicons name="send" size={18} color="#fff" />
                </Pressable>
              </View>
            )}
          </View>
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function Line({ icon, text, color = C.muted }: { icon: React.ComponentProps<typeof Ionicons>['name']; text: string; color?: string }) {
  return (
    <View style={s.row}>
      <Ionicons name={icon} size={16} color={color} />
      <Text style={{ flex: 1, color: C.ink }}>{text}</Text>
    </View>
  );
}

/** A chat message. The leader's are filled in the school color with a star, so they stand out. */
function Bubble({ m, lead, mine }: { m: VolunteerMessage; lead: boolean; mine: boolean }) {
  const t = new Date(m.createdAt);
  const stamp = t.toDateString() === new Date().toDateString()
    ? t.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
    : t.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  return (
    <View style={{
      alignSelf: mine ? 'flex-end' : 'flex-start', maxWidth: '88%', borderRadius: 14, padding: 10, gap: 3,
      backgroundColor: lead ? C.primary : mine ? '#E6ECFA' : C.card, borderWidth: lead ? 0 : 1, borderColor: C.line,
    }}>
      <View style={[s.row, { gap: 6 }]}>
        {lead && <Ionicons name="star" size={13} color="#FFD54A" />}
        <Text style={{ fontWeight: '800', fontSize: 13, color: lead ? '#fff' : C.ink }}>
          {mine ? 'You' : nameOf(m.authorId)}{lead ? ' · Volunteer Leader' : ''}
        </Text>
        <Text style={{ fontSize: 12, color: lead ? '#DCE3F7' : C.muted }}>{stamp}</Text>
      </View>
      <Text style={{ fontSize: lead ? 16 : 15, lineHeight: 21, color: lead ? '#fff' : C.ink, fontWeight: lead ? '600' : '400' }}>{m.body}</Text>
    </View>
  );
}
