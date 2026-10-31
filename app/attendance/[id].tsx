/**
 * One class's roll for a day: tap P, L or A for each student (tap again to clear), or mark everyone
 * not marked yet present at once. The office's late arrivals and early check-outs show on each row;
 * a late check-in counts as Late, and a student checked out shows as gone home. Earlier school days
 * are a tap away; the last two weeks can still be changed.
 */
import { useCallback, useState } from 'react';
import { Alert, Pressable, RefreshControl, ScrollView, Text, View } from 'react-native';
import { Stack, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { classRoll, errorText, markAttendance, type AttendanceMark, type ClassRoll, type RollStudent } from '../../src/api/connect';
import { MARKS, checkLine, markColor, rollLine } from '../../src/attendance/labels';
import { DayStepper } from '../../src/attendance/parts';
import { schoolToday } from '../../src/calendar/past';
import { Button, C, Card, Loading, P, s } from '../../src/ui';

export default function ClassAttendance() {
  const { id, day: startDay } = useLocalSearchParams<{ id: string; day?: string }>();
  const [day, setDay] = useState(startDay ?? schoolToday());
  const [roll, setRoll] = useState<ClassRoll | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    classRoll(id, day).then((r) => { setRoll(r); setError(null); }).catch((e) => setError(errorText(e)));
  }, [id, day]);
  useFocusEffect(useCallback(() => { load(); }, [load]));
  const changeDay = (d: string) => { setRoll(null); setDay(d); };

  const header = <Stack.Screen options={{ title: roll?.name ?? 'Attendance' }} />;
  if (error && !roll) return <View style={[s.screen, s.pad]}>{header}<Card><P>{error}</P></Card></View>;
  if (!roll || roll.day !== day) return <>{header}<Loading /></>;

  /** Show the change straight away, then save it (and put it back if the save fails). */
  const mark = async (students: RollStudent[], status: AttendanceMark | null) => {
    const ids = new Set(students.map((x) => x.id)), before = roll;
    setRoll({ ...roll, students: roll.students.map((x) => (ids.has(x.id)
      ? { ...x, mark: status, state: x.checks[0]?.kind === 'in' ? 'late' : status } : x)) });
    setBusy(true);
    try { await markAttendance(roll.id, day, [...ids], status); load(); }
    catch (e) { setRoll(before); Alert.alert('Attendance', errorText(e)); } finally { setBusy(false); }
  };

  const count = (k: AttendanceMark | null) => roll.students.filter((x) => x.state === k).length;
  const counts = { students: roll.students.length, present: count('present'), late: count('late'), absent: count('absent'),
    unmarked: count(null), left: roll.students.filter((x) => x.left).length };
  const rest = roll.students.filter((x) => x.state === null);
  const done = counts.students > 0 && counts.unmarked === 0;

  return (
    <ScrollView style={s.screen} contentContainerStyle={s.pad} refreshControl={<RefreshControl refreshing={false} onRefresh={load} />}>
      {header}
      <DayStepper day={day} onChange={changeDay} />
      <View style={{ padding: 14, borderRadius: 14, backgroundColor: done ? '#15803D' : C.primary, gap: 4 }}>
        <Text style={{ color: '#fff', fontSize: 18, fontWeight: '900' }}>{done ? `✓ ${rollLine(counts)}` : rollLine(counts)}</Text>
        <Text style={{ color: '#fff', opacity: 0.9 }}>
          {roll.canMark ? 'Tap P, L or A for each student. The office’s late arrivals and early check-outs show here too.'
            : 'Roll can only be changed for the last two weeks.'}
        </Text>
      </View>
      {roll.canMark && rest.length > 0 && (
        <Button label={busy ? 'Saving…' : `Mark ${rest.length === counts.students ? 'everyone' : 'the rest'} present (${rest.length})`}
          disabled={busy} onPress={() => mark(rest, 'present')} />
      )}

      {roll.students.length === 0 && <P muted>No students in this class yet. The office adds them in Admin portal → Classes.</P>}
      {roll.students.map((st) => (
        <StudentRow key={st.id} st={st} canMark={roll.canMark && !busy} onMark={(m) => mark([st], st.mark === m && st.state === m ? null : m)} />
      ))}
    </ScrollView>
  );
}

/** A student: name, the office's check-ins and check-outs, and P / L / A (the one that holds is filled). */
function StudentRow({ st, canMark, onMark }: { st: RollStudent; canMark: boolean; onMark: (m: AttendanceMark) => void }) {
  const first = st.name.split(' ')[0];
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12, borderRadius: 12, backgroundColor: '#fff',
      borderWidth: 1, borderColor: C.line, borderLeftWidth: 4, borderLeftColor: markColor(st.state) }}>
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={{ fontSize: 16, fontWeight: '700', color: C.ink }}>{st.name}</Text>
        {st.checks.map((c, i) => (
          <View key={i} style={[s.row, { gap: 4 }]}>
            <Ionicons name={c.kind === 'in' ? 'log-in-outline' : 'log-out-outline'} size={14} color={c.kind === 'in' ? '#B45309' : C.primary} />
            <Text style={{ fontSize: 13, color: C.muted, flexShrink: 1 }}>{checkLine(c)}</Text>
          </View>
        ))}
        {st.left && <Text style={{ fontSize: 12, fontWeight: '800', color: C.primary }}>GONE HOME</Text>}
      </View>
      {MARKS.map((m) => {
        const on = st.state === m.key;
        return (
          <Pressable key={m.key} onPress={() => onMark(m.key)} disabled={!canMark} hitSlop={4}
            accessibilityRole="radio" accessibilityState={{ selected: on, disabled: !canMark }} accessibilityLabel={`${first}: ${m.label}`}
            style={{ width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center',
              backgroundColor: on ? m.color : '#fff', borderWidth: 1.5, borderColor: on ? m.color : C.line, opacity: !canMark && !on ? 0.4 : 1 }}>
            <Text style={{ fontWeight: '900', fontSize: 15, color: on ? '#fff' : m.color }}>{m.short}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}
