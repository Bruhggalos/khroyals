/**
 * My calendar, for teachers and staff. Two tabs:
 * - My calendar: their own events (meetings, duties) and the activity schedule items they
 *   plan to go to, which follow the schedule (moved or cancelled games update here).
 * - My students: games, performances and meets that students in their classes are signed up
 *   for, with who's in them. "I'll be there" puts one on My calendar and can tell those
 *   students and their parents.
 * Like every calendar in the app, past items stay behind "Show past" and look greyed out.
 */
import { useCallback, useState } from 'react';
import { Alert, Pressable, ScrollView, Text, View } from 'react-native';
import { Stack, router, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import {
  errorText, isSchoolStaff, live, myCalendar, planStudentEvent, session, studentEvents,
  type MyCalendarItem, type Person, type StudentEvent,
} from '../../src/api/connect';
import { isPastDay, isPastTime, schoolToday, splitPast } from '../../src/calendar/past';
import { PAST_STYLE, PastToggle, usePastToggle } from '../../src/calendar/PastToggle';
import { clock } from '../../src/carline/time';
import { byDay, itemTime, longDay } from '../../src/myCalendar/when';
import { dayOf, addDays } from '../../src/info/today';
import { Button, C, Card, Chip, H, Loading, P, ask, s } from '../../src/ui';

type Tab = 'mine' | 'students';
type Data = { me: Person | null; mine: MyCalendarItem[]; students: StudentEvent[] };

export default function MyCalendar() {
  const [tab, setTab] = useState<Tab>('mine');
  const [data, setData] = useState<Data | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const past = usePastToggle();

  const load = useCallback(async () => {
    const me = live ? await session().catch(() => null) : null;
    if (!isSchoolStaff(me)) { setData({ me, mine: [], students: [] }); return; }
    const today = schoolToday();
    const [from, to] = [addDays(today, -30), addDays(today, 180)];
    try {
      const [mine, students] = await Promise.all([myCalendar(from, to), studentEvents(from, to)]);
      setData({ me, mine, students });
    } catch (e) {
      Alert.alert('Could not load your calendar', errorText(e));
      setData({ me, mine: [], students: [] });
    }
  }, []);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  const header = <Stack.Screen options={{ title: 'My calendar' }} />;
  const box = (body: React.ReactNode) => <View style={[s.screen, s.pad]}>{header}{body}</View>;
  if (!live) return box(<Card><H>My calendar needs the school server</H><P muted>This build is running on demo data.</P></Card>);
  if (!data) return <>{header}<Loading /></>;
  if (!data.me) return box(
    <Card>
      <H>Sign in to see your calendar</H>
      <Button label="Sign in" onPress={() => router.navigate('/connect')} />
    </Card>,
  );
  if (!isSchoolStaff(data.me)) return box(<Card><H>For teachers and staff</H><P muted>My calendar is for teachers and staff. The school calendar is in Calendar.</P></Card>);

  const plan = (e: StudentEvent, going: boolean, tell = false) => {
    setBusy(e.id);
    planStudentEvent(e.id, going, tell)
      .then((n) => { if (tell && n > 0) Alert.alert('On your calendar', `${n === 1 ? 'Your student and their parents know' : `Your ${n} students and their parents know`} you're coming.`); })
      .catch((x) => Alert.alert('Could not change your calendar', errorText(x)))
      .finally(() => { setBusy(null); load(); });
  };
  const tellAndPlan = (e: StudentEvent) => ask("You'll be there?", `It goes on My calendar, and ${names(e)} and their parents hear you're coming.`,
    "I'll be there", () => plan(e, true, true));
  const takeOff = (i: MyCalendarItem) => ask('Take it off your calendar?', i.title, 'Take it off',
    () => planStudentEvent(i.sportEventId!, false).then(load).catch((x) => Alert.alert('Could not change your calendar', errorText(x))));
  const open = (i: MyCalendarItem) => (i.sportEventId
    ? i.sportId && router.push(`/activities/${i.sportId}`)
    : router.push({ pathname: '/my-calendar/edit', params: { id: i.id, date: i.date } }));

  const pills = (
    <View style={{ flexDirection: 'row', gap: 8 }}>
      {([['mine', 'My calendar'], ['students', 'My students']] as [Tab, string][]).map(([k, label]) => (
        <Pressable key={k} onPress={() => { setTab(k); past.hide(); }} accessibilityRole="tab" accessibilityState={{ selected: tab === k }}
          style={{ flex: 1, paddingVertical: 9, borderRadius: 999, borderWidth: 1, borderColor: C.line, alignItems: 'center',
            backgroundColor: tab === k ? C.primary : '#fff' }}>
          <Text style={{ fontWeight: '700', color: tab === k ? '#fff' : C.ink }}>{label}</Text>
        </Pressable>
      ))}
    </View>
  );

  if (tab === 'mine') {
    const split = splitPast(data.mine, (i) => isPastDay(i.date));
    const shown = [...(past.shown ? split.past : []), ...split.upcoming];
    return (
      <ScrollView style={s.screen} contentContainerStyle={[s.pad, { gap: 10 }]}>
        {header}
        {pills}
        <Button label="+ Add to my calendar" onPress={() => router.push('/my-calendar/edit')} />
        <PastToggle count={split.past.length} shown={past.shown} onToggle={past.toggle} />
        {!split.upcoming.length && (
          <Card><P muted>Nothing coming up. Add meetings and duties, or pick your students’ games and performances from My students.</P></Card>
        )}
        {byDay(shown, (i) => i.date).map((g) => (
          <View key={g.day} style={[{ gap: 8 }, isPastDay(g.day) && PAST_STYLE]}>
            <Text style={{ fontWeight: '800', color: C.muted, marginTop: 6 }}>{longDay(g.day).toUpperCase()}</Text>
            {g.items.map((i) => (
              <Card key={i.id} onPress={() => open(i)} style={{ flexDirection: 'row', gap: 12 }}>
                <Text style={{ width: 92, fontWeight: '800', color: i.cancelled ? C.muted : C.primary }}>{itemTime(i.startTime, i.endTime)}</Text>
                <View style={{ flex: 1, gap: 4 }}>
                  <Text style={{ fontWeight: '700', color: C.ink, textDecorationLine: i.cancelled ? 'line-through' : 'none' }}>{i.title}</Text>
                  {!!i.location && <P muted>{i.location}</P>}
                  {!!i.notes && <P muted>{i.notes}</P>}
                  {(i.sportEventId || i.cancelled) && (
                    <View style={[s.row, { alignItems: 'center' }]}>
                      {i.sportEventId && <Chip label="Activity" color="#0D9488" />}
                      {i.cancelled && <Chip label="Cancelled" color={C.danger} />}
                      {i.sportEventId && !isPastDay(i.date) && (
                        <Text onPress={() => takeOff(i)} accessibilityRole="button" style={{ color: C.primary, fontWeight: '700' }}>Take off</Text>
                      )}
                    </View>
                  )}
                </View>
              </Card>
            ))}
          </View>
        ))}
      </ScrollView>
    );
  }

  const split = splitPast(data.students, (e) => isPastTime(e.startsAt, e.endsAt));
  const shown = [...(past.shown ? split.past : []), ...split.upcoming];
  return (
    <ScrollView style={s.screen} contentContainerStyle={[s.pad, { gap: 10 }]}>
      {header}
      {pills}
      <P muted>Games, performances and meets that students in your classes are signed up for.</P>
      <PastToggle count={split.past.length} shown={past.shown} onToggle={past.toggle} />
      {!split.upcoming.length && (
        <Card><P muted>Nothing coming up. When students in your classes sign up for an activity, its schedule shows here.</P></Card>
      )}
      {byDay(shown, (e) => dayOf(e.startsAt)).map((g) => (
        <View key={g.day} style={{ gap: 8 }}>
          <Text style={[{ fontWeight: '800', color: C.muted, marginTop: 6 }, isPastDay(g.day) && PAST_STYLE]}>{longDay(g.day).toUpperCase()}</Text>
          {g.items.map((e) => {
            const over = isPastTime(e.startsAt, e.endsAt);
            return (
              <Card key={e.id} style={{ gap: 6, ...(over ? PAST_STYLE : null) }}>
                <Pressable onPress={() => router.push(`/activities/${e.sportId}`)} style={{ gap: 4 }}>
                  <Text style={{ color: C.muted, fontWeight: '700' }}>{e.sportIcon} {e.sportName}</Text>
                  <Text style={{ fontWeight: '800', fontSize: 16, color: C.ink, textDecorationLine: e.cancelled ? 'line-through' : 'none' }}>{e.title}</Text>
                  <P muted>{[clock(e.startsAt), e.location].filter(Boolean).join(' · ')}</P>
                </Pressable>
                <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 6 }}>
                  <Ionicons name="people-outline" size={16} color={C.muted} style={{ marginTop: 2 }} />
                  <Text style={{ flex: 1, color: C.ink }}>{e.students.map((x) => x.name).join(', ')}</Text>
                </View>
                {e.cancelled ? <View style={s.row}><Chip label="Cancelled" color={C.danger} /></View>
                  : over ? null
                  : e.planned ? <Button kind="ghost" label="✓ On my calendar · take it off" disabled={busy === e.id} onPress={() => plan(e, false)} />
                  : (
                    <View style={{ gap: 6 }}>
                      <Button label="I'll be there" disabled={busy === e.id} onPress={() => tellAndPlan(e)} />
                      <Button kind="ghost" label="Just add it to my calendar" disabled={busy === e.id} onPress={() => plan(e, true)} />
                    </View>
                  )}
              </Card>
            );
          })}
        </View>
      ))}
    </ScrollView>
  );
}

/** "Ava", "Ava and Liam", "Ava, Liam and 2 others": first names of the class students in it. */
function names(e: StudentEvent) {
  const first = e.students.map((x) => x.name.split(' ')[0]);
  if (first.length <= 2) return first.join(' and ') || 'your students';
  return `${first[0]}, ${first[1]} and ${first.length - 2} other${first.length === 3 ? '' : 's'}`;
}
