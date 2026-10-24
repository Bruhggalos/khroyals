/**
 * The Planner tab's Assignments card, under the uniform, for one day. A student sees what's
 * due that day (and, today, what's overdue) and checks them off here (only they see
 * that); a teacher sees what's due that day in the classes they've assigned to.
 */
import { Pressable, Text, View } from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import type { Assignment } from '../api/connect';
import { PAST_STYLE } from '../calendar/PastToggle';
import { C, Card, P, s } from '../ui';
import type { DayPlan } from './plan';

const GREEN = '#15803D';
/** How many overdue ones to list before "and N more". */
const OVERDUE_SHOWN = 3;
const onDay = (label: string) => (label === 'Today' ? 'today' : label === 'Tomorrow' ? 'tomorrow' : label);

export function AssignmentsCard({ a, label, onToggle }: { a: NonNullable<DayPlan['assignments']>; label: string; onToggle: (x: Assignment) => void }) {
  const when = onDay(label);
  const left = a.due.filter((x) => !x.done).length;
  const title = a.teacher
    ? (a.due.length ? `${a.due.length} due ${when} in your classes` : `Nothing due ${when} in your classes`)
    : left ? `${left} due ${when}` : a.due.length ? `All done for ${when}! 🎉` : `Nothing due ${when}`;
  const groups: [string, Assignment[], string][] = [
    ['Overdue', a.overdue.slice(0, OVERDUE_SHOWN), C.danger],
    [`Due ${when}`, a.due, C.accent],
  ];

  return (
    <Card style={{ gap: 12 }}>
      <View style={s.row}>
        <Ionicons name="checkbox-outline" size={24} color={C.primary} />
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: 12, fontWeight: '800', letterSpacing: 1, color: C.primary }}>ASSIGNMENTS</Text>
          <Text style={{ fontSize: 17, fontWeight: '800', color: C.ink }}>{title}</Text>
        </View>
      </View>
      {groups.map(([group, list, color]) => list.length > 0 && (
        <View key={group} style={{ gap: 2 }}>
          <Text style={{ fontSize: 12, fontWeight: '800', letterSpacing: 1, color }}>
            {group.toUpperCase()}{group === 'Overdue' ? ` (${a.overdue.length})` : ''}
          </Text>
          {list.map((x) => <Row key={x.id} x={x} teacher={a.teacher} onToggle={() => onToggle(x)} />)}
          {group === 'Overdue' && a.overdue.length > OVERDUE_SHOWN && <P muted>and {a.overdue.length - OVERDUE_SHOWN} more</P>}
        </View>
      ))}
      <Text style={{ color: C.primary, fontWeight: '700' }} accessibilityRole="link" onPress={() => router.push('/assignments')}>
        {a.teacher ? 'Assign to a class ›' : 'All assignments ›'}
      </Text>
    </Card>
  );
}

/** One assignment: a checkbox for students (a class icon for teachers), the title and its class. */
function Row({ x, teacher, onToggle }: { x: Assignment; teacher: boolean; onToggle: () => void }) {
  return (
    <View style={[s.row, { alignItems: 'flex-start', gap: 10, paddingVertical: 6 }, x.done && PAST_STYLE]}>
      {teacher ? (
        <Ionicons name="school-outline" size={22} color={C.muted} />
      ) : (
        <Pressable onPress={onToggle} hitSlop={10} accessibilityRole="checkbox" accessibilityState={{ checked: x.done }}
          accessibilityLabel={`${x.title}, ${x.done ? 'done' : 'not done'}`}>
          <Ionicons name={x.done ? 'checkmark-circle' : 'ellipse-outline'} size={24} color={x.done ? GREEN : C.primary} />
        </Pressable>
      )}
      <Pressable style={{ flex: 1 }} onPress={() => router.push('/assignments')} accessibilityRole="button">
        <Text style={{ fontWeight: '700', color: C.ink, textDecorationLine: x.done ? 'line-through' : 'none' }}>{x.title}</Text>
        <Text style={{ color: C.muted }}>{x.className ?? 'My own'}</Text>
      </Pressable>
    </View>
  );
}
