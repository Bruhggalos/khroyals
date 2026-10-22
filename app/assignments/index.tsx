/**
 * Assignments. A student sees their classes' assignments (from the teachers) and their
 * own, sorted overdue / today / upcoming / no date, and checks them off (only they see
 * that); done ones wait behind "Show done". A teacher sees what they've assigned to
 * their classes, with past ones behind "Show past", and assigns more.
 */
import { useCallback, useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { Stack, router, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import {
  checkAssignment, deleteAssignment, isSchoolStaff, listAssignments, live, mySections, session, subscribeAssignments,
  type Assignment, type Person, type Section,
} from '../../src/api/connect';
import { dueLabel, groupAssignments } from '../../src/assignments/groups';
import { PAST_STYLE, PastToggle, usePastToggle } from '../../src/calendar/PastToggle';
import { isPastDay } from '../../src/calendar/past';
import { SectionTitle } from '../../src/volunteer/parts';
import { Button, C, Card, Chip, H, Loading, P, ask, s } from '../../src/ui';

const GREEN = '#15803D';

export default function Assignments() {
  const [data, setData] = useState<{ me: Person | null; list: Assignment[]; sections: Section[] } | null>(null);
  const showDone = usePastToggle();

  const load = useCallback(async () => {
    const me = live ? await session().catch(() => null) : null;
    const ok = !!me && !me.pending;
    const [list, sections] = await Promise.all([ok ? listAssignments() : [], ok && isSchoolStaff(me) ? mySections() : []])
      .catch(() => [[], []] as const);
    setData({ me, list: [...list], sections: [...sections] });
  }, []);
  useFocusEffect(useCallback(() => { load(); return subscribeAssignments(load); }, [load]));

  const header = <Stack.Screen options={{ title: 'Assignments' }} />;
  const box = (body: React.ReactNode) => <View style={[s.screen, s.pad]}>{header}{body}</View>;
  if (!live) return box(<Card><H>Assignments need the school server</H><P muted>This build is running on demo data.</P></Card>);
  if (!data) return <>{header}<Loading /></>;
  const { me, list } = data;
  if (!me) return box(
    <Card>
      <H>Sign in to see your assignments</H>
      <P muted>Your teachers' assignments, and the ones you add yourself, in one list.</P>
      <Button label="Sign in" onPress={() => router.navigate('/connect')} />
    </Card>,
  );
  const student = me.schoolRole === 'student' && !me.pending;
  const teacher = isSchoolStaff(me);
  if (!student && !teacher) return box(<Card><H>For students and teachers</H><P muted>Assignments are for students and their teachers.</P></Card>);

  const toggle = (a: Assignment) => checkAssignment(a.id, !a.done).then(load).catch(() => {});
  const remove = (a: Assignment) => ask('Remove this assignment?', a.rosterId ? `It goes away for everyone in ${a.className ?? 'the class'}.` : a.title, 'Remove',
    () => deleteAssignment(a.id).then(load).catch(() => {}));

  if (student) {
    const g = groupAssignments(list);
    const parts: [string, Assignment[], string][] = [
      ['Overdue', g.overdue, C.danger], ['Due today', g.today, C.accent], ['Coming up', g.upcoming, C.primary], ['No due date', g.someday, C.muted],
    ];
    const open = g.overdue.length + g.today.length + g.upcoming.length + g.someday.length;
    return (
      <ScrollView style={s.screen} contentContainerStyle={s.pad}>
        {header}
        <Button label="+ Add an assignment" onPress={() => router.push('/assignments/new')} />
        {open === 0 && <Card><P muted>{g.done.length ? 'All done! 🎉' : "Nothing to do yet. Your teachers' assignments show up here, and you can add your own."}</P></Card>}
        {parts.map(([title, items, color]) => items.length > 0 && (
          <View key={title} style={{ gap: 8 }}>
            <Text style={{ fontSize: 13, fontWeight: '800', letterSpacing: 1.2, color }}>{title.toUpperCase()} ({items.length})</Text>
            {items.map((a) => <Row key={a.id} a={a} mine={a.ownerId === me.id} onToggle={() => toggle(a)} onRemove={() => remove(a)} />)}
          </View>
        ))}
        {g.done.length > 0 && (
          <Pressable onPress={showDone.toggle} accessibilityRole="button" accessibilityState={{ expanded: showDone.shown }} hitSlop={6}
            style={({ pressed }) => [s.row, { gap: 6, paddingVertical: 6 }, pressed && { opacity: 0.6 }]}>
            <Ionicons name={showDone.shown ? 'chevron-up' : 'checkmark-done'} size={16} color={C.muted} />
            <Text style={{ color: C.muted, fontWeight: '700' }}>{showDone.shown ? 'Hide done' : `Show ${g.done.length} done`}</Text>
          </Pressable>
        )}
        {showDone.shown && g.done.map((a) => <Row key={a.id} a={a} mine={a.ownerId === me.id} onToggle={() => toggle(a)} onRemove={() => remove(a)} />)}
        <P muted>Checking an assignment off is just for you; your teachers don't see it.</P>
      </ScrollView>
    );
  }

  // A teacher: what they've assigned, by class; past ones stay out of view until asked for.
  const given = list.filter((a) => a.ownerId === me.id && a.rosterId);
  const isOld = (a: Assignment) => !!a.dueOn && isPastDay(a.dueOn);
  const past = given.filter(isOld);
  const shown = showDone.shown ? given : given.filter((a) => !isOld(a));
  return (
    <ScrollView style={s.screen} contentContainerStyle={s.pad}>
      {header}
      {data.sections.length > 0
        ? <Button label="+ Assign to a class" onPress={() => router.push('/assignments/new')} />
        : <Card><P muted>Classes you teach show up here once the office sets them up in the admin portal.</P></Card>}
      {data.sections.map((sec) => {
        const items = shown.filter((a) => a.rosterId === sec.id);
        return (
          <View key={sec.id} style={{ gap: 8 }}>
            <SectionTitle icon="school-outline" title={`${sec.name} · ${sec.students} student${sec.students === 1 ? '' : 's'}`} />
            {items.length === 0 ? <P muted>Nothing assigned{showDone.shown ? '' : ' that’s still to come'}.</P>
              : items.map((a) => (
                <Card key={a.id} style={isOld(a) ? { gap: 4, ...PAST_STYLE } : { gap: 4 }}>
                  <View style={s.row}>
                    <Text style={{ flex: 1, fontSize: 16, fontWeight: '800', color: C.ink }}>{a.title}</Text>
                    <Pressable onPress={() => remove(a)} hitSlop={8} accessibilityRole="button" accessibilityLabel={`Remove ${a.title}`}>
                      <Ionicons name="trash-outline" size={18} color={C.muted} />
                    </Pressable>
                  </View>
                  <Text style={{ color: C.muted, fontWeight: '600' }}>{dueLabel(a.dueOn).replace(/^Overdue · /, 'Was due ')}</Text>
                  {!!a.details && <P>{a.details}</P>}
                </Card>
              ))}
          </View>
        );
      })}
      <PastToggle count={past.length} shown={showDone.shown} onToggle={showDone.toggle} noun="assignments" />
      <P muted>Students check assignments off for themselves; you don't see who's done.</P>
    </ScrollView>
  );
}

/** A student's assignment: a checkbox, what's due, its class (or "My own"), and the details. */
function Row({ a, mine, onToggle, onRemove }: { a: Assignment; mine: boolean; onToggle: () => void; onRemove: () => void }) {
  const overdue = !a.done && !!a.dueOn && isPastDay(a.dueOn);
  return (
    <View style={[s.card, s.row, { alignItems: 'flex-start', gap: 12 }, a.done && PAST_STYLE]}>
      <Pressable onPress={onToggle} hitSlop={10} accessibilityRole="checkbox" accessibilityState={{ checked: a.done }}
        accessibilityLabel={`${a.title}, ${a.done ? 'done' : 'not done'}`}>
        <Ionicons name={a.done ? 'checkmark-circle' : 'ellipse-outline'} size={30} color={a.done ? GREEN : C.primary} />
      </Pressable>
      <View style={{ flex: 1, gap: 3 }}>
        <Text style={{ fontSize: 16, fontWeight: '800', color: C.ink, textDecorationLine: a.done ? 'line-through' : 'none' }}>{a.title}</Text>
        <Text style={{ color: overdue ? C.danger : C.muted, fontWeight: '700' }}>{dueLabel(a.dueOn)}</Text>
        <View style={[s.row, { gap: 6 }]}><Chip label={a.className ?? 'My own'} color={a.className ? C.primary : C.muted} /></View>
        {!!a.details && <P muted>{a.details}</P>}
      </View>
      {mine && (
        <Pressable onPress={onRemove} hitSlop={8} accessibilityRole="button" accessibilityLabel={`Remove ${a.title}`}>
          <Ionicons name="trash-outline" size={18} color={C.muted} />
        </Pressable>
      )}
    </View>
  );
}
