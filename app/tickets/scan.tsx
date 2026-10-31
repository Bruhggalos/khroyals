/**
 * The door (?event=), for the activity's coaches and directors: scan each ticket's QR code with the
 * camera, or type the short code under it. Green lets them in (each ticket admits once); red says why
 * not (already used, another event, not a ticket). The count of who's in keeps up.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, Platform, Text, TextInput, View } from 'react-native';
import { Stack, useLocalSearchParams } from 'expo-router';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { Ionicons } from '@expo/vector-icons';
import { admitTicket, errorText, ticketEvent, type AdmitResult, type TicketEvent } from '../../src/api/connect';
import { Button, C, Loading, P, s } from '../../src/ui';

const GREEN = '#15803D';

export default function ScanTickets() {
  const { event } = useLocalSearchParams<{ event: string }>();
  const [ev, setEv] = useState<TicketEvent | null>(null);
  const [permission, ask] = useCameraPermissions();
  const [result, setResult] = useState<AdmitResult | null>(null);
  const [counts, setCounts] = useState<{ admitted: number; sold: number } | null>(null);
  const [typed, setTyped] = useState('');
  const busy = useRef(false);
  const last = useRef<{ code: string; at: number } | null>(null);

  useEffect(() => {
    ticketEvent(event).then((e) => {
      setEv(e);
      setCounts({ admitted: e.types.reduce((n, t) => n + (t.admitted ?? 0), 0), sold: e.types.reduce((n, t) => n + (t.sold ?? 0), 0) });
    }).catch((e) => Alert.alert('Tickets', errorText(e)));
  }, [event]);

  const admit = useCallback(async (code: string) => {
    // The camera reports the same code many times a second: one try per ticket every few seconds.
    if (busy.current || (last.current?.code === code && Date.now() - last.current.at < 3000)) return;
    busy.current = true;
    last.current = { code, at: Date.now() };
    try {
      const r = await admitTicket(event, code);
      setResult(r);
      if (r.ok && r.admitted != null && r.sold != null) setCounts({ admitted: r.admitted, sold: r.sold });
    } catch (e) { setResult({ ok: false, message: errorText(e) }); } finally { busy.current = false; }
  }, [event]);

  const header = <Stack.Screen options={{ title: 'Scan tickets' }} />;
  if (!ev) return <>{header}<Loading /></>;
  const camera = Platform.OS !== 'web';

  return (
    <View style={[s.screen, { padding: 16, gap: 12 }]}>
      {header}
      <View style={[s.row, { justifyContent: 'space-between' }]}>
        <Text style={{ flex: 1, fontSize: 16, fontWeight: '800', color: C.ink }} numberOfLines={1}>{ev.title}</Text>
        {counts && <Text style={{ fontSize: 16, fontWeight: '900', color: C.primary }}>{counts.admitted} of {counts.sold} in</Text>}
      </View>

      {camera && (permission?.granted ? (
        <View style={{ flex: 1, minHeight: 260, borderRadius: 16, overflow: 'hidden', backgroundColor: '#000' }}>
          <CameraView style={{ flex: 1 }} facing="back" barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
            onBarcodeScanned={({ data }) => { admit(data); }} />
          <View pointerEvents="none" style={{ position: 'absolute', top: '20%', left: '20%', right: '20%', bottom: '20%', borderWidth: 3, borderColor: '#fff', borderRadius: 16, opacity: 0.8 }} />
        </View>
      ) : (
        <View style={{ gap: 8 }}>
          <P>Scanning uses the camera to read each ticket's QR code.</P>
          <Button label="Turn on the camera" onPress={() => ask()} />
          {permission && !permission.canAskAgain && <P muted>Camera access is off for KH Royals. Turn it on in Settings, or type the codes below.</P>}
        </View>
      ))}

      {result && (
        <View accessibilityLiveRegion="assertive" style={{ flexDirection: 'row', alignItems: 'center', gap: 12, padding: 16, borderRadius: 14,
          backgroundColor: result.ok ? GREEN : C.danger }}>
          <Ionicons name={result.ok ? 'checkmark-circle' : 'close-circle'} size={34} color="#fff" />
          <View style={{ flex: 1 }}>
            <Text style={{ color: '#fff', fontSize: 20, fontWeight: '900' }}>{result.ok ? 'Come on in' : 'Not this one'}</Text>
            <Text style={{ color: '#fff', fontWeight: '600' }}>
              {result.ok ? [result.type, result.holder].filter(Boolean).join(' · ') : [result.message, result.holder].filter(Boolean).join(' ')}
            </Text>
          </View>
        </View>
      )}

      <View style={[s.row, { gap: 8 }]}>
        <TextInput style={[s.input, { flex: 1 }]} placeholder="Or type the code under the QR" accessibilityLabel="Ticket code" value={typed}
          onChangeText={setTyped} autoCapitalize="characters" autoCorrect={false} maxLength={40} returnKeyType="done"
          onSubmitEditing={() => { if (typed.trim()) { last.current = null; admit(typed.trim()); setTyped(''); } }} />
        <Button label="Admit" disabled={!typed.trim()} onPress={() => { last.current = null; admit(typed.trim()); setTyped(''); }} />
      </View>
      {!camera && <P muted>On a phone, KH Royals scans the QR codes with the camera.</P>}
    </View>
  );
}
