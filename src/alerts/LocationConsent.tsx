/**
 * Asked once, after a teacher or staff member first signs in to the app: may it send where they
 * are when they answer a critical alert? Yes asks the phone for location permission (the system
 * prompt) and records it; No records that too. Either can be changed in My profile. Nobody else
 * is ever asked, and nothing is sent until they answer an alert.
 */
import { useCallback, useEffect, useState } from 'react';
import { Modal, Platform, Pressable, ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import * as Location from 'expo-location';
import { isSchoolStaff, listAlerts, live, me, myLocationConsent, onAuthChange, session, setLocationConsent } from '../api/connect';
import { C } from '../ui';

const NAVY = '#0A1F4D';

/** Yes: ask the phone for location while the app is open (the web asks when it's first used). */
export async function allowAlertLocation() {
  if (Platform.OS !== 'web') await Location.requestForegroundPermissionsAsync().catch(() => null);
  await setLocationConsent(true);
}

export function LocationConsent() {
  const insets = useSafeAreaInsets();
  const [ask, setAsk] = useState(false);
  const [busy, setBusy] = useState(false);

  const check = useCallback(async () => {
    const p = me();
    if (!live || !isSchoolStaff(p)) { setAsk(false); return; }
    // Never on top of an active alert (that screen comes first); asked again next time.
    const [consent, alerts] = await Promise.all([myLocationConsent().catch(() => true), listAlerts(5).catch(() => [])]);
    setAsk(consent === null && !alerts.some((a) => !a.endedAt));
  }, []);
  useEffect(() => {
    if (!live) return;
    const signedIn = () => session().then(check).catch(() => {});
    signedIn();
    return onAuthChange(signedIn);
  }, [check]);

  if (!ask) return null;
  const answer = (yes: boolean) => {
    setBusy(true);
    (yes ? allowAlertLocation() : setLocationConsent(false)).catch(() => {}).finally(() => { setBusy(false); setAsk(false); });
  };

  return (
    <Modal visible animationType="slide" onRequestClose={() => {}} statusBarTranslucent>
      <ScrollView style={{ backgroundColor: '#fff' }}
        contentContainerStyle={{ padding: 24, paddingTop: insets.top + 32, paddingBottom: insets.bottom + 24, gap: 16, maxWidth: 560, width: '100%', alignSelf: 'center' }}>
        <MaterialCommunityIcons name="map-marker-radius" size={56} color={NAVY} />
        <Text style={{ fontSize: 26, fontWeight: '900', color: NAVY }} accessibilityRole="header">Your location in an emergency</Text>
        <Text style={{ fontSize: 17, lineHeight: 25, color: C.ink }}>
          When there’s a critical alert (an active threat, severe weather or another danger) and you tap I’m safe or I need help,
          KH Royals can send where you are along with your answer, so the office can find you and get help to you faster.
        </Text>
        {[
          ['crosshairs-gps', 'Your phone’s location and the school Wi-Fi access point it’s on, which tells the office the room or area.'],
          ['clock-outline', 'Only at the moment you answer an alert. Never in the background, and never at any other time.'],
          ['account-lock', 'Only the people who send critical alerts see it.'],
          ['delete-clock', 'It’s erased automatically after the alert is over.'],
        ].map(([icon, text]) => (
          <View key={icon} style={{ flexDirection: 'row', gap: 12, alignItems: 'flex-start' }}>
            <MaterialCommunityIcons name={icon as 'clock-outline'} size={24} color={NAVY} />
            <Text style={{ flex: 1, fontSize: 16, lineHeight: 23, color: C.ink }}>{text}</Text>
          </View>
        ))}
        <Text style={{ color: C.muted, fontSize: 14 }}>
          You can change this any time in My profile.{Platform.OS !== 'web' ? ' Your phone will ask you to allow location for KH Royals next.' : ''}
        </Text>
        <Pressable disabled={busy} onPress={() => answer(true)} accessibilityRole="button"
          style={({ pressed }) => ({ backgroundColor: NAVY, borderRadius: 14, padding: 16, alignItems: 'center', opacity: pressed || busy ? 0.7 : 1 })}>
          <Text style={{ color: '#fff', fontSize: 17, fontWeight: '800' }}>Yes, share my location with alert answers</Text>
        </Pressable>
        <Pressable disabled={busy} onPress={() => answer(false)} accessibilityRole="button" style={{ padding: 12, alignItems: 'center' }}>
          <Text style={{ color: NAVY, fontSize: 16, fontWeight: '700' }}>No thanks</Text>
        </Pressable>
      </ScrollView>
    </Modal>
  );
}
