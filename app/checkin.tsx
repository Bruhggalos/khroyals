/**
 * Check In & Out (Attendance → Check a student in or out), for the front office (checkin.manage,
 * behind the authenticator check): find a
 * student, check them in when they arrive late or out when they leave early, only with someone on
 * their pickup list, with a reason. Their parents are notified. Today's check-ins are listed below,
 * newest first, with Undo for a mis-tap.
 */
import { useCallback, useEffect, useState } from 'react';
import { Alert, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { Stack, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import {
  checkinStudents, checkinToday, errorText, schoolCheck, undoSchoolCheck, type CheckinStudent, type CheckoutPerson, type SchoolCheck,
} from '../src/api/connect';
import { clock } from '../src/carline/format';
import { IN_REASONS, OUT_REASONS, reasonLabel } from '../src/checkin/labels';
import { PeoplePicker } from '../src/checkin/PeoplePicker';
import { gradeLabel } from '../src/comms/grades';
import { MfaGate } from '../src/comms/MfaGate';
import { Button, C, Card, H, Loading, P, ask, s } from '../src/ui';

const GREEN = '#15803D';

export default function Checkin() {
  return (
    <>
      <Stack.Screen options={{ title: 'Check In & Out' }} />
      <MfaGate>{(access) => access.permissions.includes('checkin.manage')
        ? <Desk />
        : <View style={[s.screen, s.pad]}><P>Checking students in and out is for the front office.</P></View>}
      </MfaGate>
    </>
  );
}

const pill = (label: string, on: boolean, onPress: () => void) => (
  <Text key={label} onPress={onPress} accessibilityRole="button" accessibilityState={{ selected: on }}
    style={{ paddingHorizontal: 12, paddingVertical: 7, borderRadius: 999, overflow: 'hidden', borderWidth: 1,
      borderColor: on ? C.primary : C.line, backgroundColor: on ? C.primary : '#fff', color: on ? '#fff' : C.ink, fontWeight: '600' }}>{label}</Text>
);

/** "In since 9:05 AM" / "Out at 1:15 PM" / nothing yet today. */
const standing = (st: CheckinStudent) => (st.status === 'in' ? `Checked in ${clock(st.at!)}` : st.status === 'out' ? `Checked out ${clock(st.at!)}` : null);

function Desk() {
  const [query, setQuery] = useState('');
  const [students, setStudents] = useState<CheckinStudent[] | null>(null);
  const [chosen, setChosen] = useState<CheckinStudent | null>(null);
  const [today, setToday] = useState<SchoolCheck[] | null>(null);

  const loadToday = useCallback(() => { checkinToday().then(setToday).catch(() => setToday([])); }, []);
  useFocusEffect(useCallback(() => { loadToday(); }, [loadToday]));
  useEffect(() => {
    const t = setTimeout(() => { checkinStudents(query).then(setStudents).catch((e) => { setStudents([]); Alert.alert('Check in & out', errorText(e)); }); }, 250);
    return () => clearTimeout(t);
  }, [query]);
  const done = () => {
    setChosen(null); loadToday();
    checkinStudents(query).then(setStudents).catch(() => {});
  };

  return (
    <ScrollView style={s.screen} contentContainerStyle={s.pad} keyboardShouldPersistTaps="handled">
      {chosen ? <Record student={chosen} onDone={done} onCancel={() => setChosen(null)} /> : (
        <>
          <TextInput style={s.input} placeholder="Find a student" accessibilityLabel="Find a student" value={query} onChangeText={setQuery}
            autoCorrect={false} clearButtonMode="while-editing" />
          {students === null ? <Loading /> : students.length === 0 ? <P muted>No students match.</P> : students.map((st) => (
            <Pressable key={st.id} onPress={() => setChosen(st)} accessibilityRole="button"
              style={({ pressed }) => [{ flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12, borderRadius: 12, backgroundColor: '#fff',
                borderWidth: 1, borderColor: C.line }, pressed && { opacity: 0.8 }]}>
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 16, fontWeight: '700', color: C.ink }}>{st.name}</Text>
                <Text style={{ fontSize: 13, color: C.muted }}>{[gradeLabel(st.grade), standing(st)].filter(Boolean).join(' · ')}</Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color={C.muted} />
            </Pressable>
          ))}
        </>
      )}

      <H>Today</H>
      {today === null ? <Loading /> : today.length === 0 ? <P muted>No one has been checked in or out today.</P> : today.map((c) => (
        <Card key={c.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          <Ionicons name={c.kind === 'in' ? 'log-in-outline' : 'log-out-outline'} size={22} color={c.kind === 'in' ? GREEN : C.primary} />
          <View style={{ flex: 1 }}>
            <Text style={{ fontWeight: '700', color: C.ink }}>{c.studentName} {c.kind === 'in' ? 'checked in' : 'checked out'}</Text>
            <P muted>{[clock(c.at), c.person && `with ${c.person}`, reasonLabel(c.reason), c.note, `by ${c.by}`].filter(Boolean).join(' · ')}</P>
          </View>
          <Text style={{ color: C.primary, fontWeight: '600' }} accessibilityRole="button"
            onPress={() => ask('Undo this?', `${c.studentName}'s ${c.kind === 'in' ? 'check-in' : 'check-out'} is taken back. Their parents already got the notification.`, 'Undo',
              () => undoSchoolCheck(c.id).then(loadToday).catch((e) => Alert.alert('Check in & out', errorText(e))))}>Undo</Text>
        </Card>
      ))}
    </ScrollView>
  );
}

/** One student: check in or out, with the reason (and, leaving, who's taking them). */
function Record({ student, onDone, onCancel }: { student: CheckinStudent; onDone: () => void; onCancel: () => void }) {
  const [kind, setKind] = useState<'in' | 'out'>(student.status === 'in' ? 'out' : 'in');
  const [reason, setReason] = useState(kind === 'in' ? 'late' : 'appointment');
  const [person, setPerson] = useState<CheckoutPerson | null>(null);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const switchTo = (k: 'in' | 'out') => { setKind(k); setReason(k === 'in' ? 'late' : 'appointment'); setPerson(null); };

  const save = async () => {
    if (kind === 'out' && !person) return Alert.alert('Check out', `Choose who is taking ${student.name}.`);
    setBusy(true);
    try {
      await schoolCheck({ studentId: student.id, kind, personId: person?.id ?? null, reason, note });
      onDone();
    } catch (e) { Alert.alert('Check in & out', errorText(e)); } finally { setBusy(false); }
  };

  return (
    <Card>
      <View style={[s.row, { justifyContent: 'space-between' }]}>
        <View style={{ flex: 1 }}>
          <H>{student.name}</H>
          <P muted>{[gradeLabel(student.grade), standing(student) ?? 'Not checked in or out today'].filter(Boolean).join(' · ')}</P>
        </View>
        <Text style={{ color: C.primary, fontWeight: '600' }} onPress={onCancel} accessibilityRole="button">Back</Text>
      </View>
      <View style={[s.row, { gap: 6 }]}>
        {pill('Check in (arrived late)', kind === 'in', () => switchTo('in'))}
        {pill('Check out (leaving early)', kind === 'out', () => switchTo('out'))}
      </View>
      {kind === 'out' && (
        <>
          <Text style={{ fontSize: 12, fontWeight: '700', color: C.muted, marginTop: 4 }}>WHO IS TAKING THEM</Text>
          <PeoplePicker studentId={student.id} chosen={person?.id ?? null} onChoose={setPerson} />
        </>
      )}
      <Text style={{ fontSize: 12, fontWeight: '700', color: C.muted, marginTop: 4 }}>REASON</Text>
      <View style={[s.row, { flexWrap: 'wrap', gap: 6 }]}>
        {(kind === 'in' ? IN_REASONS : OUT_REASONS).map((r) => pill(reasonLabel(r), reason === r, () => setReason(r)))}
      </View>
      <TextInput style={s.input} placeholder="Note (optional)" accessibilityLabel="Note" value={note} onChangeText={setNote} maxLength={300} />
      <Button label={busy ? 'Saving…' : kind === 'in' ? `Check in ${student.name.split(' ')[0]}` : person ? `Check out with ${person.name}` : 'Check out'}
        disabled={busy || (kind === 'out' && !person)} onPress={save} />
      <P muted>{`${student.name.split(' ')[0]}'s parents get a notification.`}</P>
    </Card>
  );
}
