/**
 * Student app. Shows a parent's linked children (or a student themselves), with a way
 * for parents to read each child's Ask the Teacher conversations.
 * Grades, report cards and schedules live in the school's FACTS Family Portal
 * until the app can read them from FACTS directly.
 */
import { useCallback, useState } from 'react';
import { Linking, ScrollView, Text, View } from 'react-native';
import { Stack, router, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { isFamily, live, myChildren, session, type Person } from '../src/api/connect';
import { gradeLabel } from '../src/carline/format';
import { Button, C, Card, H, Loading, P, s } from '../src/ui';

// The site's "Family Portal" link (content/site/site.json).
const FACTS_PORTAL = 'https://sis.factsmgt.com/family-portal';

export default function Student() {
  const [person, setPerson] = useState<Person | null | undefined>(live ? undefined : null);
  const [kids, setKids] = useState<Person[]>([]);

  const load = useCallback(async () => {
    if (!live) return;
    const p = await session().catch(() => null);
    setKids(p && !p.pending && !isFamily(p) ? await myChildren().catch(() => []) : []);
    setPerson(p);
  }, []);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  const header = <Stack.Screen options={{ title: 'Student' }} />;
  if (person === undefined) return <>{header}<Loading /></>;
  if (isFamily(person)) return (
    <View style={[s.screen, s.pad]}>
      {header}
      <Card>
        <H>Not part of Family accounts</H>
        <P muted>The Student app is for parents and students. You can pick up the children the school linked to you in the Car Line.</P>
        <Button label="Open the Car Line" onPress={() => router.replace('/carline')} />
      </Card>
    </View>
  );
  const students = person?.schoolRole === 'student' ? [person] : kids;

  return (
    <ScrollView style={s.screen} contentContainerStyle={s.pad}>
      {header}
      {!person && live && (
        <Card>
          <H>Sign in to see your students</H>
          <Button label="Sign in" onPress={() => router.navigate('/connect')} />
        </Card>
      )}
      {students.map((k) => (
        <Card key={k.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
          <View style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: C.primary + '1A', alignItems: 'center', justifyContent: 'center' }}>
            <Ionicons name="school" size={22} color={C.primary} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 17, fontWeight: '700', color: C.ink }}>{k.firstName} {k.lastName}</Text>
            {!!gradeLabel(k.grade) && <P muted>{gradeLabel(k.grade)}</P>}
            {person?.schoolRole !== 'student' && (
              <Text style={{ color: C.primary, fontWeight: '700', marginTop: 4 }} accessibilityRole="link"
                onPress={() => router.push({ pathname: '/teachers', params: { child: k.id } })}>
                Messages with teachers ›
              </Text>
            )}
          </View>
        </Card>
      ))}
      {person && person.schoolRole !== 'student' && students.length === 0 && (
        <Card><P muted>No students are linked to your account yet. Add them under My children, or ask the school office.</P></Card>
      )}
      {person && person.schoolRole !== 'student' && <Button kind="ghost" label="My children: photos, allergies, add a child" onPress={() => router.push('/children')} />}
      <Card>
        <H>Grades, report cards and schedules</H>
        <P muted>These are in the FACTS Family Portal for now.</P>
        <Button label="Open FACTS Family Portal" onPress={() => Linking.openURL(FACTS_PORTAL)} />
      </Card>
    </ScrollView>
  );
}
