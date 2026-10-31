/**
 * Attendance, for teachers and staff: the class sections they lead with today's roll at a glance
 * (tap one to take roll and see the office's late arrivals and early check-outs). The office
 * (checkin.manage) also gets every class's roll and Check in & out, where it records late arrivals and
 * early pickups. Check-out lists for field trips and Activities events are below.
 */
import { useCallback, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, Text, View } from 'react-native';
import { Stack, router, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { isSchoolStaff, myAccess, myClassAttendance, session, type ClassRollSummary, type Person } from '../../src/api/connect';
import { ClassCard } from '../../src/attendance/parts';
import { CheckoutLists } from '../../src/checkin/CheckoutLists';
import { Card, C, H, Loading, P, s } from '../../src/ui';

export default function Attendance() {
  const [person, setPerson] = useState<Person | null | undefined>(undefined);
  const [classes, setClasses] = useState<ClassRollSummary[] | null>(null);
  const [office, setOffice] = useState(false);
  const [subs, setSubs] = useState(false);   // leads a class, or schedules subs for every class

  const load = useCallback(async () => {
    const p = await session().catch(() => null);
    setPerson(p);
    if (!isSchoolStaff(p)) return;
    const [c, a] = await Promise.all([myClassAttendance().catch(() => []), myAccess().catch(() => null)]);
    setClasses(c); setOffice(!!a?.permissions.includes('checkin.manage')); setSubs(c.length > 0 || !!a?.permissions.includes('subs.manage'));
  }, []);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  const header = <Stack.Screen options={{ title: 'Attendance' }} />;
  if (person === undefined) return <>{header}<Loading /></>;
  if (!isSchoolStaff(person)) return <View style={[s.screen, s.pad]}>{header}<Card><P>Attendance is for teachers and staff.</P></Card></View>;
  if (!classes) return <>{header}<Loading /></>;

  return (
    <ScrollView style={s.screen} contentContainerStyle={s.pad} refreshControl={<RefreshControl refreshing={false} onRefresh={load} />}>
      {header}
      {office && (
        <Pressable onPress={() => router.push('/attendance/all')} accessibilityRole="button"
          style={({ pressed }) => [{ flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, borderRadius: 14, backgroundColor: C.primary },
            pressed && { opacity: 0.85 }]}>
          <Ionicons name="school" size={24} color="#fff" />
          <View style={{ flex: 1 }}>
            <Text style={{ color: '#fff', fontSize: 16, fontWeight: '800' }}>All classes</Text>
            <Text style={{ color: '#fff', opacity: 0.85 }}>Every class&apos;s roll for the day</Text>
          </View>
          <Ionicons name="chevron-forward" size={20} color="#fff" />
        </Pressable>
      )}
      {office && (
        <Pressable onPress={() => router.push('/checkin')} accessibilityRole="button"
          style={({ pressed }) => [{ flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, borderRadius: 14, backgroundColor: '#fff',
            borderWidth: 1, borderColor: C.primary }, pressed && { opacity: 0.85 }]}>
          <Ionicons name="log-in-outline" size={24} color={C.primary} />
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 16, fontWeight: '800', color: C.ink }}>Check a student in or out</Text>
            <Text style={{ color: C.muted }}>Late arrivals and early pickups, and today&apos;s list</Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color={C.muted} />
        </Pressable>
      )}

      {(classes.length > 0 || !office) && <H>Your classes</H>}
      {classes.length === 0
        ? !office && <P muted>{"You don't lead a class section yet. The office sets up sections in Admin portal → Classes."}</P>
        : classes.map((c) => <ClassCard key={c.id} c={c} onPress={() => router.push(`/attendance/${c.id}`)} />)}

      {subs && (
        <Pressable onPress={() => router.push('/subs')} accessibilityRole="button"
          style={({ pressed }) => [{ flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, borderRadius: 14, backgroundColor: '#fff',
            borderWidth: 1, borderColor: C.line }, pressed && { opacity: 0.85 }]}>
          <Ionicons name="people" size={22} color={C.primary} />
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 16, fontWeight: '800', color: C.ink }}>Substitutes</Text>
            <Text style={{ color: C.muted }}>Schedule a sub, with your sub plans</Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color={C.muted} />
        </Pressable>
      )}

      <CheckoutLists />
    </ScrollView>
  );
}
