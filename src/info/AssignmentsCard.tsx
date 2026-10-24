/**
 * The Info tab's Assignments card, under the uniform. A student sees what's overdue, due
 * today and due the next school day, and checks them off here (only they see that); a
 * teacher sees what's due today and next in the classes they've assigned to.
 */
import { Pressable, Text, View } from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import type { Assignment } from '../api/connect';
import { PAST_STYLE } from '../calendar/PastToggle';
import { C, Card, P, s } from '../ui';

const GREEN = '#15803D';
/** How many overdue ones to list before "and N more". */
const OVERDUE_SHOWN = 3;

export type TodayAssignments = {
  teacher: boolean;
  overdue: Assignment[]; today: Assignment[]; next: Assignment[];
  /** "Tomorrow", "Monday"… for the next school day. */
  nextLabel: string;
};

export function AssignmentsCard({ a, onToggle }: { a: TodayAssignments; onToggle: (x: Assignment) => void }) {
  const left = a.today.filter((x) => !x.done).length;
  const title = a.teacher
    ? (a.today.length ? `${a.today.length} due today in your classes` : 'Nothing due today in your classes')
    : left ? `${left} due today` : a.today.length ? 'All done for today! 🎉' : 'Nothing due today';
  const overdue = a.teacher ? [] : a.overdue;
  const groups: [string, Assignment[], string][] = [
    ['Overdue', overdue.slice(0, OVERDUE_SHOWN), C.danger],
    ['Due today', a.today, C.accent],
    [`Due ${a.nextLabel === 'Tomorrow' ? 'tomorrow' : a.nextLabel}`, a.next, C.primary],
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
      {groups.map(([label, list, color]) => list.length > 0 && (
        <View key={label} style={{ gap: 2 }}>
          <Text style={{ fontSize: 12, fontWeight: '800', letterSpacing: 1, color }}>
            {label.toUpperCase()}{label === 'Overdue' ? ` (${overdue.length})` : ''}
          </Text>
          {list.map((x) => <Row key={x.id} x={x} teacher={a.teacher} onToggle={() => onToggle(x)} />)}
          {label === 'Overdue' && overdue.length > OVERDUE_SHOWN && (
            <P muted>and {overdue.length - OVERDUE_SHOWN} more</P>
          )}
        </View>
      ))}
      {!overdue.length && !a.today.length && !a.next.length && (
        <P muted>Nothing due {a.nextLabel === 'Tomorrow' ? 'tomorrow' : `on ${a.nextLabel}`} either.</P>
      )}
      <Text style={{ color: C.primary, fontWeight: '700' }} accessibilityRole="link" onPress={() => router.push('/assignments')}>
        {a.teacher ? 'Assign to a class ›' : 'All assignments ›'}
      </Text>
    </Card>
  );
}

/** One assignment: a checkbox for students (a bullet for teachers), the title and its class. */
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
