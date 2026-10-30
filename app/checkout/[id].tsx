/**
 * One check-out list: who's still waiting (on top) and who's gone home, with whom and when. Tap a
 * waiting student to pick who is taking them from their pickup list; their parents are notified.
 * Undo takes back a mis-tap. "Everyone's checked out" shows once nobody is left.
 */
import { useCallback, useState } from 'react';
import { Alert, Pressable, RefreshControl, ScrollView, Text, View } from 'react-native';
import { Stack, router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { checkoutList, deleteCheckoutList, errorText, releaseStudent, unreleaseStudent, type CheckoutList } from '../../src/api/connect';
import { PAST_STYLE } from '../../src/calendar/PastToggle';
import { clock } from '../../src/carline/format';
import { dayLabel, progressLine } from '../../src/checkin/labels';
import { PeoplePicker } from '../../src/checkin/PeoplePicker';
import { gradeLabel } from '../../src/comms/grades';
import { Button, C, Card, Loading, P, ask, s } from '../../src/ui';

const GREEN = '#15803D';

export default function CheckoutRoster() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [list, setList] = useState<CheckoutList | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState<string | null>(null);   // the waiting student whose pickup list is showing

  const load = useCallback(() => { checkoutList(id).then((l) => { setList(l); setError(null); }).catch((e) => setError(errorText(e))); }, [id]);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  const header = <Stack.Screen options={{ title: list?.title ?? 'Check-out' }} />;
  if (error && !list) return <View style={[s.screen, s.pad]}>{header}<Card><P>{error}</P></Card></View>;
  if (!list) return <>{header}<Loading /></>;

  const waiting = list.students.filter((x) => !x.releasedTo), gone = list.students.filter((x) => !!x.releasedTo);
  const all = list.students.length > 0 && waiting.length === 0;
  const release = (studentId: string, name: string, personId: string, personName: string) => {
    const first = name.split(' ')[0];
    ask(`Check ${first} out?`, `${first} goes with ${personName}. ${first}'s parents get a notification.`, 'Check out',
      () => releaseStudent(list.id, studentId, personId).then(() => { setOpen(null); load(); }).catch((e) => Alert.alert('Check-out', errorText(e))));
  };

  return (
    <ScrollView style={s.screen} contentContainerStyle={s.pad} refreshControl={<RefreshControl refreshing={false} onRefresh={load} />}>
      {header}
      <View style={{ padding: 14, borderRadius: 14, backgroundColor: all ? GREEN : C.primary, gap: 4 }}>
        <Text style={{ color: '#fff', fontSize: 20, fontWeight: '900' }}>{all ? `✓ ${progressLine(gone.length, list.students.length)}` : progressLine(gone.length, list.students.length)}</Text>
        <Text style={{ color: '#fff', opacity: 0.9 }}>{dayLabel(list.day)}{all ? ' · You can head out.' : ' · Only to someone on the child’s pickup list.'}</Text>
      </View>

      {waiting.map((st) => (
        <Card key={st.id}>
          <Pressable onPress={() => setOpen(open === st.id ? null : st.id)} accessibilityRole="button" accessibilityState={{ expanded: open === st.id }}
            style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <Ionicons name="time-outline" size={22} color={C.primary} />
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 17, fontWeight: '800', color: C.ink }}>{st.name}</Text>
              <Text style={{ fontSize: 13, color: C.muted }}>{[gradeLabel(st.grade), 'Waiting'].filter(Boolean).join(' · ')}</Text>
            </View>
            <Text style={{ color: C.primary, fontWeight: '700' }}>{open === st.id ? 'Close' : 'Check out'}</Text>
          </Pressable>
          {open === st.id && (
            <>
              <P muted>Who is taking {st.name.split(' ')[0]}?</P>
              <PeoplePicker key={st.id} studentId={st.id} chosen={null} onChoose={(p) => release(st.id, st.name, p.id, p.name)} />
            </>
          )}
        </Card>
      ))}

      {gone.map((st) => (
        <Card key={st.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, ...PAST_STYLE }}>
          <Ionicons name="checkmark-circle" size={22} color={GREEN} />
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 16, fontWeight: '700', color: C.ink }}>{st.name}</Text>
            <Text style={{ fontSize: 13, color: C.muted }}>With {st.releasedTo} · {clock(st.releasedAt!)}{st.releasedBy ? ` · by ${st.releasedBy}` : ''}</Text>
          </View>
          <Text style={{ color: C.primary, fontWeight: '600' }} accessibilityRole="button"
            onPress={() => ask('Undo this check-out?', `${st.name} goes back to waiting. Their parents already got the notification.`, 'Undo',
              () => unreleaseStudent(list.id, st.id).then(load).catch((e) => Alert.alert('Check-out', errorText(e))))}>Undo</Text>
        </Card>
      ))}

      {list.canDelete && (
        <Button kind="ghost" label="Remove this list" onPress={() => ask('Remove this list?', 'The list and its check-outs are removed. Parents keep the notifications they got.', 'Remove',
          () => deleteCheckoutList(list.id).then(() => router.back()).catch((e) => Alert.alert('Check-out', errorText(e))))} />
      )}
    </ScrollView>
  );
}
