/** Profile → Location with alert answers (staff): the yes/no from LocationConsent, and whether this phone allows it. */
import { useCallback, useEffect, useState } from 'react';
import { AppState, Linking, Platform, Switch, Text, View } from 'react-native';
import * as Location from 'expo-location';
import { errorText, myLocationConsent, setLocationConsent } from '../api/connect';
import { C, Card, H, P } from '../ui';
import { allowAlertLocation } from './LocationConsent';

export function AlertLocationCard() {
  const [consent, setConsent] = useState<boolean | null | undefined>(undefined);
  const [phoneAllows, setPhoneAllows] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const check = useCallback(() => {
    myLocationConsent().then(setConsent).catch(() => setConsent(null));
    if (Platform.OS !== 'web') Location.getForegroundPermissionsAsync().then((p) => setPhoneAllows(p.granted)).catch(() => {});
  }, []);
  useEffect(() => {
    check();
    const sub = AppState.addEventListener('change', (st) => { if (st === 'active') check(); });
    return () => sub.remove();
  }, [check]);
  if (consent === undefined) return null;

  const change = (on: boolean) => {
    setConsent(on); setError(null);
    (on ? allowAlertLocation() : setLocationConsent(false)).catch((e) => setError(errorText(e))).finally(check);
  };
  return (
    <Card>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <View style={{ flex: 1 }}><H>Location with alert answers</H></View>
        <Switch value={!!consent} onValueChange={change} trackColor={{ true: C.primary }} accessibilityLabel="Send my location with alert answers" />
      </View>
      <P muted>When you answer a critical alert, send where you are (your phone’s location and the school Wi-Fi access point
        it’s on) so the office can find you. Only alert senders see it, and it’s erased after the alert.</P>
      {!!consent && !phoneAllows && (<>
        <Text style={{ color: C.ink }}>⚠️ Location is off for KH Royals on this phone, so none will be sent.</Text>
        <Text style={{ color: C.primary, fontWeight: '700' }} accessibilityRole="button" onPress={() => Linking.openSettings()}>Open phone settings</Text>
      </>)}
      {!!error && <P muted>{error}</P>}
    </Card>
  );
}
