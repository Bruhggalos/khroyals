/**
 * Pieces of a critical alert: the I'm safe / I need help answer (which sends where the phone is,
 * for people who agreed), and the senders' live roll call, where tapping someone shows where
 * they answered from.
 */
import { useEffect, useState } from 'react';
import { Alert, Linking, Modal, Platform, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import {
  ROLE_LABELS, alertStatus, answerAlert, errorText, myLocationConsent, shareAlertLocation,
  type AlertAnswer, type AlertStatusRow, type CriticalAlert,
} from '../api/connect';
import { clock } from '../carline/time';
import { C, P, PLACEHOLDER, s } from '../ui';
import { locate, type Fix } from './locate';
import { rollCall, type RollCallTab } from './rollCall';
import { accuracyLine, mapsUrl, noLocationReason, placeLine, shortWhere } from './whereabouts';

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
    // Find the phone while the answer goes out, so the answer itself is never held up.
    const where: Promise<Fix | null> = myLocationConsent().then((ok) => (ok ? locate() : null)).catch(() => null);
    answerAlert(alert.id, status, status === 'help' ? note : null)
      .then(() => {
        where.then((fix) => fix && shareAlertLocation(alert.id, fix)).catch(() => {});
        setHelping(false); setNote(''); onDone?.();
      })
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
/**
 * The senders' live roll call: Need help, No answer and Safe counts, each a tab that lists
 * its people (name, role and when they answered). Whoever needs help always shows, with
 * where they are, whichever tab is open.
 */
export function RollCall({ alertId, tick }: { alertId: string; tick: number }) {
  const [rows, setRows] = useState<AlertStatusRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [picked, setPicked] = useState<RollCallTab | null>(null);
  const [person, setPerson] = useState<string | null>(null);
  useEffect(() => { alertStatus(alertId).then((r) => { setRows(r); setError(null); }).catch((e) => setError(errorText(e))); }, [alertId, tick]);
  if (error) return <P muted>{error}</P>;
  if (!rows) return <P muted>Loading who’s answered…</P>;

  const { groups, first } = rollCall(rows);
  const tab = picked ?? first;
  const TABS: { key: RollCallTab; label: string; color: string; empty: string }[] = [
    { key: 'help', label: 'NEED HELP', color: RED, empty: 'Nobody has asked for help.' },
    { key: 'none', label: 'NO ANSWER', color: C.muted, empty: 'Everyone has answered.' },
    { key: 'safe', label: 'SAFE', color: GREEN, empty: 'Nobody has answered safe yet.' },
  ];
  const current = TABS.find((x) => x.key === tab)!;
  const role = (r: AlertStatusRow) => ROLE_LABELS[r.role] ?? r.role;
  const where = (r: AlertStatusRow) => shortWhere(r);
  const helpCard = (r: AlertStatusRow) => (
    <Pressable key={r.id} onPress={() => setPerson(r.id)} accessibilityRole="button" accessibilityHint="Shows where they answered from"
      style={({ pressed }) => [{ padding: 10, borderRadius: 12, borderWidth: 1, borderColor: RED, gap: 2 }, pressed && { opacity: 0.7 }]}>
      <Text style={{ fontWeight: '800', color: RED }}>🆘 {r.name}{r.updatedAt ? ` · ${clock(r.updatedAt)}` : ''}</Text>
      <Text style={{ color: C.muted, fontSize: 13 }}>{role(r)}</Text>
      {!!r.note && <Text style={{ color: C.ink }}>{r.note}</Text>}
      {!!where(r) && <Text style={{ color: C.ink, fontWeight: '700' }}>📍 {where(r)}</Text>}
    </Pressable>
  );
  const open = rows.find((r) => r.id === person) ?? null;

  return (
    <View style={{ gap: 10 }}>
      <View style={[s.row, { gap: 8 }]} accessibilityRole="tablist">
        {TABS.map((x) => {
          const on = x.key === tab;
          return (
            <Pressable key={x.key} onPress={() => setPicked(x.key)} accessibilityRole="tab" accessibilityState={{ selected: on }}
              accessibilityLabel={`${groups[x.key].length} ${x.label.toLowerCase()}`}
              style={({ pressed }) => [{ flex: 1, alignItems: 'center', paddingVertical: 8, borderRadius: 12, backgroundColor: `${x.color}14`,
                borderWidth: 2, borderColor: on ? x.color : 'transparent' }, pressed && { opacity: 0.7 }]}>
              <Text style={{ fontSize: 24, fontWeight: '900', color: x.color }}>{groups[x.key].length}</Text>
              <Text style={{ fontSize: 12, fontWeight: '700', color: x.color }}>{x.label}</Text>
            </Pressable>
          );
        })}
      </View>
      {tab !== 'help' && groups.help.map(helpCard)}
      <Text style={{ fontSize: 12, fontWeight: '800', letterSpacing: 1, color: current.color }}>{current.label} ({groups[tab].length})</Text>
      {groups[tab].length === 0 && <P muted>{current.empty}</P>}
      {tab === 'help' ? groups.help.map(helpCard) : groups[tab].map((r, i) => (
        <Pressable key={r.id} onPress={() => setPerson(r.id)} accessibilityRole="button"
          style={({ pressed }) => [s.row, { gap: 10, paddingVertical: 8, borderTopWidth: i ? 1 : 0, borderTopColor: C.line }, pressed && { opacity: 0.6 }]}>
          <Ionicons name={tab === 'safe' ? 'checkmark-circle' : 'time-outline'} size={20} color={current.color} />
          <View style={{ flex: 1 }}>
            <Text style={{ fontWeight: '700', color: C.ink }}>{r.name}</Text>
            <Text style={{ color: C.muted, fontSize: 13 }}>{[role(r), tab === 'safe' ? where(r) : null].filter(Boolean).join(' · ')}</Text>
          </View>
          {tab === 'safe' && !!r.updatedAt && <Text style={{ color: C.muted }}>{clock(r.updatedAt)}</Text>}
          <Ionicons name="chevron-forward" size={16} color={C.muted} />
        </Pressable>
      ))}
      {open && <PersonDetails r={open} role={role(open)} onClose={() => setPerson(null)} />}
    </View>
  );
}

const STATUS_TEXT = { help: ['🆘 Needs help', RED], safe: ['✅ Safe', GREEN], none: ['No answer yet', C.muted] } as const;

/** For the senders: one person's answer and where they answered from, with a Maps link. Updates live with the roll call. */
function PersonDetails({ r, role, onClose }: { r: AlertStatusRow; role: string; onClose: () => void }) {
  const [label, color] = STATUS_TEXT[r.status];
  const place = placeLine(r);
  const reason = noLocationReason(r);
  const hasGps = r.lat != null && r.lng != null;
  const line = (k: string, v: string | null | undefined) => (v ? (
    <View style={{ flexDirection: 'row', gap: 8 }}>
      <Text style={{ width: 96, color: C.muted, fontWeight: '700' }}>{k}</Text>
      <Text style={{ flex: 1, color: C.ink }} selectable>{v}</Text>
    </View>
  ) : null);
  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <Pressable onPress={onClose} style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'center', padding: 16 }}>
        <Pressable onPress={() => {}} style={[s.sheet, { backgroundColor: '#fff', borderRadius: 16, maxHeight: '90%' }]}>
          <ScrollView contentContainerStyle={{ padding: 18, gap: 10 }}>
            <Text style={{ fontSize: 20, fontWeight: '800', color: C.ink }} accessibilityRole="header">{r.name}</Text>
            <Text style={{ color: C.muted }}>{role}</Text>
            <Text style={{ fontSize: 17, fontWeight: '800', color }}>{label}{r.updatedAt ? ` · ${clock(r.updatedAt)}` : ''}</Text>
            {!!r.note && <Text style={{ color: C.ink, fontSize: 16 }}>“{r.note}”</Text>}
            {r.status !== 'none' && (<>
              <View style={{ height: 1, backgroundColor: C.line, marginVertical: 4 }} />
              <Text style={{ fontWeight: '800', color: C.ink }}>Where they answered from</Text>
              {line('Place', place)}
              {line('Wi-Fi', r.bssid ? `${r.ssid ? `${r.ssid} · ` : ''}${r.bssid}${place ? '' : ' (not on the Alert map)'}` : null)}
              {line('GPS', hasGps ? `${r.lat!.toFixed(5)}, ${r.lng!.toFixed(5)}` : null)}
              {line('Accuracy', hasGps ? accuracyLine(r.accuracy) : null)}
              {line('Found at', r.locatedAt ? clock(r.locatedAt) : null)}
              {!!reason && <P muted>{reason}</P>}
              {hasGps && (
                <Pressable onPress={() => Linking.openURL(mapsUrl(r.lat!, r.lng!, Platform.OS, r.name))} accessibilityRole="link"
                  style={{ flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start', paddingVertical: 8 }}>
                  <Ionicons name="map-outline" size={18} color={C.primary} />
                  <Text style={{ color: C.primary, fontWeight: '800' }}>Open in Maps</Text>
                </Pressable>
              )}
            </>)}
            {r.status === 'none' && r.consent === false && <P muted>They chose not to share their location with alert answers.</P>}
            <Pressable onPress={onClose} accessibilityRole="button" style={{ alignSelf: 'flex-end', padding: 8 }}>
              <Text style={{ color: C.primary, fontWeight: '800' }}>Close</Text>
            </Pressable>
          </ScrollView>
        </Pressable>
      </Pressable>
    </Modal>
  );
}
