/** Profile → Emergency alerts (staff): can critical alerts ring on this phone, and the settings that make them. */
import { useCallback, useEffect, useState } from 'react';
import { AppState, Linking, Platform, Text } from 'react-native';
import { enablePush } from '../comms/push';
import { C, Card, H, P } from '../ui';
import { alertReadiness, openDndAccess, type AlertReadiness } from './loudness';

const Line = ({ ok, children }: { ok: boolean; children: string }) => (
  <Text style={{ color: C.ink }}>{ok ? '✅' : '⚠️'} {children}</Text>
);
const Action = ({ label, onPress }: { label: string; onPress: () => void }) => (
  <Text style={{ color: C.primary, fontWeight: '700' }} accessibilityRole="button" onPress={onPress}>{label}</Text>
);

export function EmergencyAlertsCard() {
  const [ready, setReady] = useState<AlertReadiness | null>(null);
  const check = useCallback(() => { alertReadiness().then(setReady).catch(() => {}); }, []);
  useEffect(() => {
    check();
    // Back from the phone's settings: see what changed.
    const sub = AppState.addEventListener('change', (st) => { if (st === 'active') check(); });
    return () => sub.remove();
  }, [check]);
  if (Platform.OS === 'web' || !ready) return null;
  const android = Platform.OS === 'android';

  return (
    <Card>
      <H>Emergency alerts</H>
      <P muted>Lockdowns, severe weather and other emergencies from the school pop up on this phone even when the app is
        closed or the phone is locked, and you can't turn them off in the app.</P>
      <Line ok={ready.allowed}>{ready.allowed ? 'Notifications are allowed' : 'Notifications are off for KH Royals'}</Line>
      {!ready.allowed && <Action label="Turn on notifications" onPress={() => enablePush({ critical: true }).then(check, check)} />}
      {!ready.allowed && <Action label="Open phone settings" onPress={() => Linking.openSettings()} />}
      {android ? (
        <>
          <Line ok>Ring at alarm volume, even on silent or vibrate</Line>
          <Line ok={ready.ringsThroughDnd}>{ready.ringsThroughDnd ? 'Ring through Do Not Disturb' : 'Silenced by Do Not Disturb'}</Line>
          {ready.allowed && !ready.ringsThroughDnd && (
            <>
              <Action label="Let alerts ring through Do Not Disturb" onPress={openDndAccess} />
              <P muted>Turn on Do Not Disturb access for KH Royals, then come back.</P>
            </>
          )}
        </>
      ) : (
        <>
          <Line ok={ready.allowed}>Break through Focus modes (Time Sensitive)</Line>
          <Line ok={ready.ringsThroughDnd}>{ready.ringsThroughDnd ? 'Ring even on silent' : 'Not on silent: needs Apple\'s approval for the school, then Critical Alerts allowed in Settings'}</Line>
          {ready.allowed && <P muted>In Settings → Notifications → KH Royals, keep Time Sensitive Notifications on.</P>}
        </>
      )}
    </Card>
  );
}
