/**
 * Send a critical alert (admins with alerts.send): pick the kind, check the title and
 * instructions (each kind starts with a template), and send it to every teacher and staff
 * member at once.
 */
import { useEffect, useState } from 'react';
import { Alert, Platform, Pressable, ScrollView, Text, View } from 'react-native';
import { Stack, router } from 'expo-router';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { isSchoolStaff, myAccess, sendCriticalAlert, session, type Access } from '../../src/api/connect';
import { ALERT_KINDS, alertKind, type AlertKind } from '../../src/alerts/kinds';
import { Button, C, Card, Field, Loading, P, s } from '../../src/ui';

export default function NewAlert() {
  const [access, setAccess] = useState<Access | null | undefined>(undefined);
  const [kind, setKind] = useState<AlertKind | null>(null);
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    session().then((p) => (isSchoolStaff(p) ? myAccess() : null)).then(setAccess).catch(() => setAccess(null));
  }, []);

  const header = <Stack.Screen options={{ title: 'Send a critical alert' }} />;
  if (access === undefined) return <>{header}<Loading /></>;
  if (!access?.permissions.includes('alerts.send')) return (
    <View style={[s.screen, s.pad]}>{header}
      <Card><P>Only admins with "Send critical alerts" can send them, after verifying with their authenticator app in the Admin portal.</P></Card>
    </View>
  );

  const pick = (k: AlertKind) => {
    // Swap in the new kind's template unless the sender has written their own.
    const prev = kind ? alertKind(kind) : null;
    const next = alertKind(k);
    if (!title.trim() || title === prev?.title) setTitle(next.title);
    if (!body.trim() || body === prev?.body) setBody(next.body);
    setKind(k);
  };
  const ready = !!kind && !!title.trim();
  const send = () => {
    const go = () => {
      setBusy(true);
      sendCriticalAlert(kind!, title, body)
        .then(() => router.replace('/alerts'))
        .catch((e) => Alert.alert('Critical alert', e.message))
        .finally(() => setBusy(false));
    };
    const ask = 'Every teacher and staff member gets it right away, with a loud alert on their phone.';
    if (Platform.OS === 'web') { if (globalThis.confirm?.(`Send this critical alert?\n\n${ask}`)) go(); return; }
    Alert.alert('Send this critical alert?', ask, [{ text: 'Cancel', style: 'cancel' }, { text: 'Send now', style: 'destructive', onPress: go }]);
  };

  return (
    <ScrollView style={s.screen} contentContainerStyle={s.pad} keyboardShouldPersistTaps="handled">
      {header}
      <Text style={{ fontSize: 20, fontWeight: '800', color: C.ink }}>What's happening?</Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
        {ALERT_KINDS.map((k) => {
          const on = kind === k.key;
          return (
            <Pressable key={k.key} onPress={() => pick(k.key)} accessibilityRole="button" accessibilityState={{ selected: on }}
              accessibilityLabel={`${k.label}: ${k.hint}`}
              style={({ pressed }) => [{ flexBasis: '47%', flexGrow: 1, padding: 14, borderRadius: 14, borderWidth: 2, gap: 6,
                borderColor: k.color, backgroundColor: on ? k.color : '#fff' }, pressed && { opacity: 0.8 }]}>
              <MaterialCommunityIcons name={k.icon} size={30} color={on ? '#fff' : k.color} />
              <Text style={{ fontWeight: '800', fontSize: 16, color: on ? '#fff' : C.ink }}>{k.label}</Text>
              <Text style={{ fontSize: 13, color: on ? '#fff' : C.muted }}>{k.hint}</Text>
            </Pressable>
          );
        })}
      </View>

      {kind && (
        <Card style={{ gap: 12 }}>
          <Field label="Title" value={title} onChangeText={setTitle} maxLength={120} placeholder="What staff see first" />
          <Field label="Instructions" value={body} onChangeText={setBody} maxLength={1000} multiline style={{ minHeight: 110 }}
            placeholder="What teachers and staff should do now" />
          <P muted>The starting wording is a template. Edit it to match the school's safety plan before you send.</P>
        </Card>
      )}

      <P muted>Goes to every teacher and staff member at once. Parents, students and family members don't get it.</P>
      <Pressable disabled={!ready || busy} onPress={send} accessibilityRole="button"
        style={({ pressed }) => [s.btn, { backgroundColor: kind ? alertKind(kind).color : C.danger, paddingVertical: 18 },
          (!ready || busy) && { opacity: 0.4 }, pressed && { opacity: 0.8 }]}>
        <Text style={[s.btnT, { fontSize: 18 }]}>{busy ? 'Sending…' : 'Send critical alert'}</Text>
      </Pressable>
      <Button kind="ghost" label="Cancel" onPress={() => router.back()} />
    </ScrollView>
  );
}
