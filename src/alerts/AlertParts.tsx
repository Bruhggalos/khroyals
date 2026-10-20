/** Pieces of a critical alert: the I'm safe / I need help answer, and the senders' live roll call. */
import { useEffect, useState } from 'react';
import { Alert, Pressable, Text, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { alertStatus, answerAlert, type AlertAnswer, type AlertStatusRow, type CriticalAlert } from '../api/connect';
import { clock } from '../carline/time';
import { C, P, PLACEHOLDER, s } from '../ui';

const GREEN = '#15803D';
const RED = '#B42318';

/**
 * Two big buttons. `dark`: on the full-screen alert's colored background.
 * Choosing I need help asks where you are first; the senders are told right away.
 */
export function AnswerButtons({ alert, answer, dark, onDone }: {
  alert: CriticalAlert; answer?: AlertAnswer; dark?: boolean; onDone?: () => void;
}) {
  const [helping, setHelping] = useState(false);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const send = (status: 'safe' | 'help') => {
    setBusy(true);
    answerAlert(alert.id, status, status === 'help' ? note : null)
      .then(() => { setHelping(false); setNote(''); onDone?.(); })
      .catch((e) => Alert.alert('Critical alert', e.message))
      .finally(() => setBusy(false));
  };
  const ink = dark ? '#fff' : C.ink;

  return (
    <View style={{ gap: 10 }}>
      {answer && (
        <Text style={{ color: ink, fontWeight: '700' }} accessibilityLiveRegion="polite">
          You answered: {answer.status === 'safe' ? "I'm safe" : 'I need help'}{answer.note ? ` · ${answer.note}` : ''}
        </Text>
      )}
      {!helping ? (
        <View style={[s.row, { gap: 10 }]}>
          <Pressable disabled={busy} onPress={() => send('safe')} accessibilityRole="button" accessibilityLabel="I'm safe"
            style={({ pressed }) => [{ flex: 1, flexDirection: 'row', gap: 8, alignItems: 'center', justifyContent: 'center', paddingVertical: 16,
              borderRadius: 14, backgroundColor: dark ? '#fff' : GREEN }, (pressed || busy) && { opacity: 0.7 }]}>
            <Ionicons name="checkmark-circle" size={24} color={dark ? GREEN : '#fff'} />
            <Text style={{ fontSize: 18, fontWeight: '800', color: dark ? GREEN : '#fff' }}>I'm safe</Text>
          </Pressable>
          <Pressable disabled={busy} onPress={() => setHelping(true)} accessibilityRole="button" accessibilityLabel="I need help"
            style={({ pressed }) => [{ flex: 1, flexDirection: 'row', gap: 8, alignItems: 'center', justifyContent: 'center', paddingVertical: 16,
              borderRadius: 14, borderWidth: 2, borderColor: dark ? '#fff' : RED, backgroundColor: dark ? 'transparent' : '#fff' },
              (pressed || busy) && { opacity: 0.7 }]}>
            <Ionicons name="hand-left" size={22} color={dark ? '#fff' : RED} />
            <Text style={{ fontSize: 18, fontWeight: '800', color: dark ? '#fff' : RED }}>I need help</Text>
          </Pressable>
        </View>
      ) : (
        <View style={{ gap: 8 }}>
          <Text style={{ color: ink, fontWeight: '700' }}>Where are you, and what do you need?</Text>
          <TextInput value={note} onChangeText={setNote} placeholder="Room 12, a student is hurt" placeholderTextColor={PLACEHOLDER}
            accessibilityLabel="Where are you, and what do you need?" maxLength={300} autoFocus
            style={[s.input, { backgroundColor: '#fff', color: C.ink }]} />
          <View style={[s.row, { gap: 10 }]}>
            <Pressable disabled={busy} onPress={() => send('help')} accessibilityRole="button"
              style={({ pressed }) => [{ flex: 2, alignItems: 'center', paddingVertical: 14, borderRadius: 14, backgroundColor: dark ? '#fff' : RED },
                (pressed || busy) && { opacity: 0.7 }]}>
              <Text style={{ fontSize: 17, fontWeight: '800', color: dark ? RED : '#fff' }}>{busy ? 'Sending…' : 'Send for help'}</Text>
            </Pressable>
            <Pressable onPress={() => setHelping(false)} accessibilityRole="button"
              style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: 14 }}>
              <Text style={{ color: ink, fontWeight: '700' }}>Back</Text>
            </Pressable>
          </View>
        </View>
      )}
    </View>
  );
}

/** For the senders: who needs help, who hasn't answered and who's safe. `tick` reloads it (live updates). */
export function RollCall({ alertId, tick }: { alertId: string; tick: number }) {
  const [rows, setRows] = useState<AlertStatusRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => { alertStatus(alertId).then((r) => { setRows(r); setError(null); }).catch((e) => setError(e.message)); }, [alertId, tick]);
  if (error) return <P muted>{error}</P>;
  if (!rows) return <P muted>Loading who's answered…</P>;

  const help = rows.filter((r) => r.status === 'help');
  const none = rows.filter((r) => r.status === 'none');
  const safe = rows.filter((r) => r.status === 'safe');
  const count = (n: number, label: string, color: string) => (
    <View style={{ flex: 1, alignItems: 'center', paddingVertical: 8, borderRadius: 12, backgroundColor: `${color}14` }}>
      <Text style={{ fontSize: 24, fontWeight: '900', color }}>{n}</Text>
      <Text style={{ fontSize: 12, fontWeight: '700', color }}>{label}</Text>
    </View>
  );
  return (
    <View style={{ gap: 10 }}>
      <View style={[s.row, { gap: 8 }]}>
        {count(help.length, 'NEED HELP', RED)}
        {count(none.length, 'NO ANSWER', C.muted)}
        {count(safe.length, 'SAFE', GREEN)}
      </View>
      {help.map((r) => (
        <View key={r.id} style={{ padding: 10, borderRadius: 12, borderWidth: 1, borderColor: RED, gap: 2 }}>
          <Text style={{ fontWeight: '800', color: RED }}>🆘 {r.name}{r.updatedAt ? ` · ${clock(r.updatedAt)}` : ''}</Text>
          {!!r.note && <Text style={{ color: C.ink }}>{r.note}</Text>}
        </View>
      ))}
      {none.length > 0 && <P muted>No answer yet: {none.map((r) => r.name).join(', ')}</P>}
      {safe.length > 0 && <P muted>Safe: {safe.map((r) => r.name).join(', ')}</P>}
    </View>
  );
}
