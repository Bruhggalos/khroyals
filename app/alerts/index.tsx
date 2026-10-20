/**
 * Critical alerts (Apps → Alerts; teachers, staff and admins only). Active alerts with
 * I'm safe / I need help; for admins who send them (alerts.send), the live roll call and
 * the all clear. Earlier alerts are listed below.
 */
import { useCallback, useEffect, useState } from 'react';
import { Alert, Platform, ScrollView, Text, View } from 'react-native';
import { Stack, router, useFocusEffect } from 'expo-router';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import {
  endAlert, getUser, isSchoolStaff, listAlerts, live, myAccess, myAlertAnswers, session, subscribeAlerts,
  type Access, type AlertAnswer, type CriticalAlert, type Person,
} from '../../src/api/connect';
import { AnswerButtons, RollCall } from '../../src/alerts/AlertParts';
import { alertKind } from '../../src/alerts/kinds';
import { clock } from '../../src/carline/time';
import { Button, C, Card, Field, H, Loading, P, s } from '../../src/ui';

const when = (iso: string) => `${new Date(iso).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}, ${clock(iso)}`;
const sentBy = (a: CriticalAlert) => {
  const p = a.createdBy ? getUser(a.createdBy) : null;
  return p ? ` by ${p.firstName} ${p.lastName}`.trimEnd() : '';
};

function ActiveAlert({ alert, answer, canSend, tick, onChange }: {
  alert: CriticalAlert; answer?: AlertAnswer; canSend: boolean; tick: number; onChange: () => void;
}) {
  const kind = alertKind(alert.kind);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const allClear = () => {
    const go = () => {
      setBusy(true);
      endAlert(alert.id, note).then(() => { setNote(''); onChange(); }).catch((e) => Alert.alert('Critical alert', e.message)).finally(() => setBusy(false));
    };
    if (Platform.OS === 'web') { if (globalThis.confirm?.('Give the all clear? Every teacher and staff member is told.')) go(); return; }
    Alert.alert('Give the all clear?', 'Every teacher and staff member is told the alert is over.', [
      { text: 'Cancel', style: 'cancel' }, { text: 'All clear', onPress: go },
    ]);
  };
  return (
    <Card style={{ gap: 12, borderWidth: 2, borderColor: kind.color }}>
      <View style={[s.row, { gap: 10 }]}>
        <View style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: kind.color, alignItems: 'center', justifyContent: 'center' }}>
          <MaterialCommunityIcons name={kind.icon} size={26} color="#fff" />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={{ color: kind.color, fontWeight: '900', letterSpacing: 1, fontSize: 12 }}>ACTIVE · {kind.label.toUpperCase()}</Text>
          <Text style={{ fontSize: 20, fontWeight: '800', color: C.ink }}>{alert.title}</Text>
        </View>
      </View>
      {!!alert.body && <Text style={{ fontSize: 16, lineHeight: 23, color: C.ink }}>{alert.body}</Text>}
      <P muted>Sent {when(alert.createdAt)}{sentBy(alert)}</P>
      <AnswerButtons alert={alert} answer={answer} onDone={onChange} />
      {canSend && (
        <View style={{ gap: 10, paddingTop: 8, borderTopWidth: 1, borderTopColor: C.line }}>
          <H>Who's answered</H>
          <RollCall alertId={alert.id} tick={tick} />
          <Field label="All clear message (optional)" placeholder="Police have cleared the building." value={note} onChangeText={setNote} maxLength={500} />
          <Button label={busy ? 'Sending…' : 'Give the all clear'} disabled={busy} onPress={allClear} />
        </View>
      )}
    </Card>
  );
}

export default function Alerts() {
  const [me, setMe] = useState<Person | null | undefined>(undefined);
  const [access, setAccess] = useState<Access | null>(null);
  const [alerts, setAlerts] = useState<CriticalAlert[]>([]);
  const [answers, setAnswers] = useState<AlertAnswer[]>([]);
  const [tick, setTick] = useState(0);

  const refresh = useCallback(async () => {
    try {
      const [a, r] = await Promise.all([listAlerts(20), myAlertAnswers()]);
      setAlerts(a); setAnswers(r); setTick((t) => t + 1);
    } catch { /* offline: keep what's showing */ }
  }, []);
  const load = useCallback(async () => {
    const p = await session().catch(() => null);
    setMe(p);
    if (!isSchoolStaff(p)) return;
    setAccess(await myAccess().catch(() => null));
    await refresh();
  }, [refresh]);
  useFocusEffect(useCallback(() => { load(); }, [load]));
  useEffect(() => subscribeAlerts(refresh), [refresh]);

  const header = <Stack.Screen options={{ title: 'Critical alerts' }} />;
  const box = (body: React.ReactNode) => <View style={[s.screen, s.pad]}>{header}{body}</View>;
  if (!live) return box(<Card><P muted>Critical alerts need the school server; this build is running on demo data.</P></Card>);
  if (me === undefined) return <>{header}<Loading /></>;
  if (!isSchoolStaff(me)) return box(<Card><H>For teachers and staff</H><P muted>Critical alerts go to the school's teachers and staff.</P></Card>);

  const canSend = !!access?.permissions.includes('alerts.send');
  const needsCode = !canSend && !!access?.mfaRequired && !access?.mfaVerified;
  const active = alerts.filter((a) => !a.endedAt);
  const earlier = alerts.filter((a) => a.endedAt);

  return (
    <ScrollView style={s.screen} contentContainerStyle={s.pad} keyboardShouldPersistTaps="handled">
      {header}
      {canSend && <Button label="Send a critical alert" onPress={() => router.push('/alerts/new')} />}
      {needsCode && (
        <Card onPress={() => router.push('/admin')}>
          <P muted>Admins: verify with your authenticator app in the Admin portal to send critical alerts. ›</P>
        </Card>
      )}

      {active.length === 0 && (
        <Card style={{ gap: 6 }}>
          <H>No active alerts</H>
          <P muted>When the administration sends one, your phone alerts you right away and it fills the screen until you answer I'm safe or I need help.</P>
        </Card>
      )}
      {active.map((a) => (
        <ActiveAlert key={a.id} alert={a} answer={answers.find((x) => x.alertId === a.id)} canSend={canSend} tick={tick} onChange={refresh} />
      ))}

      {earlier.length > 0 && (
        <>
          <Text style={{ fontSize: 13, fontWeight: '800', color: C.muted, letterSpacing: 0.5, marginTop: 8 }}>EARLIER ALERTS</Text>
          {earlier.map((a) => {
            const kind = alertKind(a.kind);
            return (
              <Card key={a.id} style={{ flexDirection: 'row', gap: 12, opacity: 0.75 }}>
                <MaterialCommunityIcons name={kind.icon} size={24} color={kind.color} />
                <View style={{ flex: 1, gap: 2 }}>
                  <Text style={{ fontWeight: '700', color: C.ink }}>{a.title}</Text>
                  <P muted>{when(a.createdAt)} · all clear {clock(a.endedAt!)}</P>
                  {!!a.endNote && <P muted>{a.endNote}</P>}
                </View>
              </Card>
            );
          })}
        </>
      )}
    </ScrollView>
  );
}
