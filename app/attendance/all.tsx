/**
 * All classes, for the office (checkin.manage, behind the authenticator check): every class section's
 * roll for a school day, the ones without roll taken first, with its teacher. Tap one to see it, or to
 * take roll for a teacher who's out.
 */
import { useCallback, useState } from 'react';
import { RefreshControl, ScrollView, View } from 'react-native';
import { Stack, router, useFocusEffect } from 'expo-router';
import { attendanceOverview, errorText, type ClassRollSummary } from '../../src/api/connect';
import { ClassCard, DayStepper } from '../../src/attendance/parts';
import { schoolToday } from '../../src/calendar/past';
import { MfaGate } from '../../src/comms/MfaGate';
import { Card, Loading, P, s } from '../../src/ui';

export default function AllClasses() {
  return (
    <>
      <Stack.Screen options={{ title: 'All classes' }} />
      <MfaGate>{(access) => access.permissions.includes('checkin.manage')
        ? <Overview />
        : <View style={[s.screen, s.pad]}><P>Every class&apos;s attendance is for the front office.</P></View>}
      </MfaGate>
    </>
  );
}

function Overview() {
  const [day, setDay] = useState(schoolToday());
  const [classes, setClasses] = useState<ClassRollSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const load = useCallback(() => {
    attendanceOverview(day).then((c) => { setClasses(c); setError(null); }).catch((e) => setError(errorText(e)));
  }, [day]);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  const notTaken = (c: ClassRollSummary) => c.students > 0 && c.unmarked === c.students;
  const sorted = classes && [...classes].sort((a, b) => Number(notTaken(b)) - Number(notTaken(a)));
  return (
    <ScrollView style={s.screen} contentContainerStyle={s.pad} refreshControl={<RefreshControl refreshing={false} onRefresh={load} />}>
      <DayStepper day={day} onChange={(d) => { setClasses(null); setDay(d); }} />
      {error ? <Card><P>{error}</P></Card> : !sorted ? <Loading />
        : sorted.length === 0 ? <P muted>No class sections yet. Set them up in Admin portal → Classes.</P>
        : (
          <>
            <P muted>{`${sorted.filter(notTaken).length} of ${sorted.length} classes still need roll taken.`}</P>
            {sorted.map((c) => <ClassCard key={c.id} c={c} teacher onPress={() => router.push({ pathname: '/attendance/[id]', params: { id: c.id, day } })} />)}
          </>
        )}
    </ScrollView>
  );
}
