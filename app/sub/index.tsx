/**
 * Sub Days, for substitutes (and teachers covering a class): while on duty, the classes they're
 * covering (tap one to take roll), the teacher's sub plans, field trip check-out and the car line
 * board; before then, only which classes and when. The server opens each class only during the
 * duty window, so this checks again every minute while it's open.
 */
import { useCallback, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, Text, View } from 'react-native';
import { Stack, router, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { myClassAttendance, mySubDays, type ClassRollSummary, type SubDay } from '../../src/api/connect';
import { ClassCard } from '../../src/attendance/parts';
import { CheckoutLists } from '../../src/checkin/CheckoutLists';
import { classList, clock12, subWhen } from '../../src/subs/labels';
import { Card, C, H, Loading, P, s } from '../../src/ui';

const GREEN = '#15803D';

export default function SubDays() {
  const [days, setDays] = useState<SubDay[] | null>(null);
  const [classes, setClasses] = useState<ClassRollSummary[]>([]);

  const load = useCallback(() => {
    Promise.all([mySubDays().catch(() => []), myClassAttendance().catch(() => [])]).then(([d, c]) => { setDays(d); setClasses(c); });
  }, []);
  useFocusEffect(useCallback(() => {
    load();
    const t = setInterval(load, 60_000);
    return () => clearInterval(t);
  }, [load]));

  const header = <Stack.Screen options={{ title: 'Sub Days' }} />;
  if (!days) return <>{header}<Loading /></>;
  const now = days.filter((d) => d.onDuty), coming = days.filter((d) => !d.onDuty);

  return (
    <ScrollView style={s.screen} contentContainerStyle={s.pad} refreshControl={<RefreshControl refreshing={false} onRefresh={load} />}>
      {header}
      {days.length === 0 && (
        <Card>
          <H>No sub days yet</H>
          <P muted>When a teacher or the office schedules you to cover a class, it shows here and you get a notification.</P>
        </Card>
      )}

      {now.map((d) => (
        <View key={d.id} style={{ gap: 10 }}>
          <View style={{ padding: 14, borderRadius: 14, backgroundColor: GREEN, gap: 2 }}>
            <Text style={{ color: '#fff', fontSize: 12, fontWeight: '900', letterSpacing: 1 }}>ON DUTY NOW</Text>
            <Text style={{ color: '#fff', fontSize: 18, fontWeight: '900' }}>{classList(d, false)}</Text>
            <Text style={{ color: '#fff', opacity: 0.9 }}>Until {clock12(d.endTime)}. The class tools close then.</Text>
          </View>
          {d.classes.map((c) => {
            const roll = classes.find((x) => x.id === c.id);
            return roll
              ? <ClassCard key={c.id} c={{ ...roll, name: `${c.name}${c.teacher ? ` · ${c.teacher}` : ''}` }} onPress={() => router.push(`/attendance/${c.id}`)} />
              : null;
          })}
          <Card>
            <Text style={{ fontSize: 12, fontWeight: '800', color: C.muted, letterSpacing: 0.5 }}>SUB PLANS{d.scheduledBy ? ` FROM ${d.scheduledBy.toUpperCase()}` : ''}</Text>
            <Text style={{ fontSize: 16, color: C.ink, lineHeight: 23 }} selectable>{d.plans?.trim() || 'No plans were left. Ask the front office if you need anything.'}</Text>
          </Card>
          <Pressable onPress={() => router.push('/carline-board')} accessibilityRole="button"
            style={({ pressed }) => [{ flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, borderRadius: 14, backgroundColor: '#fff',
              borderWidth: 1, borderColor: C.line }, pressed && { opacity: 0.85 }]}>
            <Ionicons name="car" size={22} color={C.primary} />
            <Text style={{ flex: 1, fontSize: 16, fontWeight: '700', color: C.ink }}>Car line board</Text>
            <Ionicons name="chevron-forward" size={18} color={C.muted} />
          </Pressable>
        </View>
      ))}
      {now.length > 0 && <CheckoutLists />}

      {coming.length > 0 && <H>{now.length > 0 ? 'Coming up' : 'Your sub days'}</H>}
      {coming.map((d) => (
        <Card key={d.id}>
          <Text style={{ fontSize: 16, fontWeight: '800', color: C.ink }}>{classList(d)}</Text>
          <Text style={{ color: C.primary, fontWeight: '700' }}>{subWhen(d)}</Text>
          <P muted>The class, its roll and the sub plans open when your duty starts.</P>
        </Card>
      ))}
    </ScrollView>
  );
}
