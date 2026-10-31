/**
 * Pickup transfers in the Car Line: a parent hands their children's pickup to another approved account for a day
 * (app/carline-transfer.tsx asks), the person asked accepts or declines here, and either side can call it off.
 * Once accepted, only that person checks the children in that day (the database holds to it).
 */
import { Alert, Platform, Pressable, Text, View } from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { answerPickupTransfer, cancelPickupTransfer, errorText, type PickupAsk, type PickupTransfer } from '../api/connect';
import { schoolToday } from '../calendar/past';
import { dateLabel, parseDate, toDateString } from '../forms/dates';
import { C, Card, H, P, s } from '../ui';

/** "YYYY-MM-DD", `days` after `day`. */
export function addDays(day: string, days: number) {
  const d = parseDate(day) ?? new Date();
  d.setDate(d.getDate() + days);
  return toDateString(d);
}

/** "today", "tomorrow", "on Tue, Nov 3" (on the school's clock). */
export function dayWords(day: string, today = schoolToday()) {
  if (day === today) return 'today';
  if (day === addDays(today, 1)) return 'tomorrow';
  return `on ${dateLabel(day).replace(/, \d{4}$/, '')}`;
}

const names = (list: string[]) => list.length < 2 ? list.join('') : `${list.slice(0, -1).join(', ')} and ${list[list.length - 1]}`;

const confirm = (title: string, msg: string, yes: string, onYes: () => void) => {
  if (Platform.OS === 'web') { if (globalThis.confirm?.(`${title}\n\n${msg}`)) onYes(); return; }
  Alert.alert(title, msg, [{ text: 'Not now', style: 'cancel' }, { text: yes, style: 'destructive', onPress: onYes }]);
};
const fail = (e: unknown) => Alert.alert('Pickup', errorText(e));

/** A parent (or the person asked) calls a child's handoff off, after making sure. */
export function cancelTransfer(t: { id: string; child: string; to: string; day: string }, mine: boolean, onDone: () => void) {
  confirm(mine ? `Can't pick up ${t.child}?` : `Cancel the transfer?`,
    mine ? `${t.child}'s parents will be told that pickup ${dayWords(t.day)} is back with them.`
      : `${t.to} won't pick up ${t.child} ${dayWords(t.day)}, and will be told. Pickup is back with you.`,
    mine ? "Can't make it" : 'Cancel transfer',
    () => cancelPickupTransfer(t.id).then(onDone).catch(fail));
}

const pillBtn = (label: string, primary: boolean, onPress: () => void) => (
  <Pressable onPress={onPress} accessibilityRole="button"
    style={({ pressed }) => [{ flex: 1, alignItems: 'center', paddingVertical: 11, borderRadius: 12,
      backgroundColor: primary ? C.primary : '#fff', borderWidth: primary ? 0 : 1, borderColor: C.line }, pressed && { opacity: 0.7 }]}>
    <Text style={{ fontWeight: '800', color: primary ? '#fff' : C.ink }}>{label}</Text>
  </Pressable>
);

/** For the person asked: each ask with Accept / Decline, and what they've accepted, with "Can't make it". */
export function TransferAsks({ asks, onChange }: { asks: PickupAsk[]; onChange: () => void }) {
  if (!asks.length) return null;
  const answer = (a: PickupAsk, accept: boolean) => answerPickupTransfer(a.requestId, accept).then(onChange).catch(fail);
  return (
    <View style={{ gap: 12 }}>
      {asks.map((a) => {
        const kids = names(a.children.map((c) => c.name.split(' ')[0]));
        return (
          <Card key={`${a.requestId}-${a.status}`} style={{ gap: 10, borderWidth: 2, borderColor: a.status === 'pending' ? C.accent : '#15803D' }}>
            <View style={[s.row, { gap: 10, alignItems: 'flex-start' }]}>
              <Ionicons name={a.status === 'pending' ? 'swap-horizontal' : 'checkmark-circle'} size={26}
                color={a.status === 'pending' ? C.accent : '#15803D'} />
              <View style={{ flex: 1, gap: 2 }}>
                <H>{a.status === 'pending' ? `Can you pick up ${kids}?` : `You're picking up ${kids} ${dayWords(a.day)}`}</H>
                <P muted>{a.status === 'pending'
                  ? `${a.from} asks you to pick up ${names(a.children.map((c) => c.name))} from the car line ${dayWords(a.day)}.`
                  : `For ${a.from}. ${a.day === schoolToday() ? 'Check in here when you get to school.' : "They'll be in your Car Line that day."}`}</P>
              </View>
            </View>
            {a.status === 'pending' ? (
              <View style={[s.row, { gap: 10 }]}>
                {pillBtn('Decline', false, () => answer(a, false))}
                {pillBtn('Accept', true, () => answer(a, true))}
              </View>
            ) : a.children.map((c) => (
              <Text key={c.id} style={{ color: C.danger, fontWeight: '700' }} accessibilityRole="button"
                onPress={() => cancelTransfer({ id: c.id, child: c.name.split(' ')[0], to: '', day: a.day }, true, onChange)}>
                {a.children.length > 1 ? `Can't pick up ${c.name.split(' ')[0]}` : "Can't make it"}
              </Text>
            ))}
          </Card>
        );
      })}
    </View>
  );
}

/** For parents: Transfer pickup, then the transfers already planned for a day ahead. */
export function TransferPickup({ transfers, onChange }: { transfers: PickupTransfer[]; onChange: () => void }) {
  const today = schoolToday();
  const ahead = transfers.filter((t) => t.day > today);
  return (
    <View style={{ gap: 8 }}>
      <Pressable onPress={() => router.push('/carline-transfer')} accessibilityRole="button" accessibilityLabel="Transfer pickup to someone else"
        style={({ pressed }) => [{ flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12, borderRadius: 14, borderWidth: 1,
          borderColor: C.line, backgroundColor: '#fff' }, pressed && { opacity: 0.7 }]}>
        <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: '#E8EDF7', alignItems: 'center', justifyContent: 'center' }}>
          <Ionicons name="swap-horizontal" size={22} color={C.primary} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: 16, fontWeight: '700', color: C.ink }}>Transfer pickup</Text>
          <P muted>Someone else picking up today or another day?</P>
        </View>
        <Ionicons name="chevron-forward" size={18} color={C.primary} />
      </Pressable>
      {ahead.length > 0 && (
        <Card style={{ gap: 8 }}>
          <Text style={{ fontSize: 12, fontWeight: '800', color: C.muted, letterSpacing: 0.5 }}>COMING UP</Text>
          {ahead.map((t) => (
            <View key={t.id} style={[s.row, { gap: 10, alignItems: 'flex-start' }]}>
              <Ionicons name={t.status === 'accepted' ? 'checkmark-circle' : t.status === 'declined' ? 'close-circle' : 'time-outline'} size={20}
                color={t.status === 'accepted' ? '#15803D' : t.status === 'declined' ? C.danger : C.accent} />
              <View style={{ flex: 1 }}>
                <Text style={{ color: C.ink, fontWeight: '600' }}>{t.to} picks up {t.child} {dayWords(t.day)}</Text>
                <P muted>{t.status === 'accepted' ? 'Accepted' : t.status === 'declined' ? "Can't make it" : 'Waiting for an answer'}</P>
              </View>
              {t.status !== 'declined' && (
                <Text style={{ color: C.danger, fontWeight: '600' }} accessibilityRole="button"
                  onPress={() => cancelTransfer(t, false, onChange)}>Cancel</Text>
              )}
            </View>
          ))}
        </Card>
      )}
    </View>
  );
}
