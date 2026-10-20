/** Opt-in switch for automatic car line check-in (parents, on phones). */
import { useEffect, useState } from 'react';
import { Linking, Switch, Text, View } from 'react-native';
import { carlineConfig, type CarlineConfig } from '../api/connect';
import { C, Card, P, s } from '../ui';
import { autoCheckInEnabled, autoCheckInSupported, disableAutoCheckIn, enableAutoCheckIn, refreshAutoCheckIn } from './autoCheckIn';
import { hoursLabel } from './format';

export function AutoCheckInCard() {
  const [on, setOn] = useState<boolean | null>(null);
  const [cfg, setCfg] = useState<CarlineConfig | null>(null);
  const [problem, setProblem] = useState<{ text: string; settings: boolean } | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!autoCheckInSupported) return;
    autoCheckInEnabled().then(setOn);
    carlineConfig().then(setCfg).catch(() => {});
    refreshAutoCheckIn();
  }, []);
  if (!autoCheckInSupported || on === null) return null;

  const toggle = async (want: boolean) => {
    setBusy(true); setProblem(null);
    try {
      if (want) {
        const why = await enableAutoCheckIn();
        if (why) { setProblem({ text: why, settings: true }); return; }
      } else {
        await disableAutoCheckIn();
      }
      setOn(want);
    } catch (e: any) {
      console.warn('Automatic check-in', e?.message ?? e);
      setProblem({ text: 'Automatic check-in couldn\'t start on this phone. Update KH Royals and try again, or tap I\'m here when you arrive.', settings: false });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card>
      <View style={s.row}>
        <Text style={{ flex: 1, fontSize: 16, fontWeight: '700', color: C.ink }}>Check in automatically</Text>
        <Switch value={on} disabled={busy} onValueChange={toggle} trackColor={{ true: C.primary }} accessibilityLabel="Check in automatically" />
      </View>
      <P muted>
        When you arrive at the car line on a school day{cfg ? ` (${hoursLabel(cfg.start, cfg.end)})` : ''}, we check in your
        children and send you a notification you can cancel. Your phone notices the arrival itself; your location isn't
        shared with the school.
      </P>
      {problem && (
        <>
          <P>{problem.text}</P>
          {problem.settings && <Text style={{ color: C.primary, fontWeight: '700' }} onPress={() => Linking.openSettings()}>Open Settings</Text>}
        </>
      )}
    </Card>
  );
}
