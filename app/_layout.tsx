import { useEffect, useState } from 'react';
import { Platform, View } from 'react-native';
import { Stack, usePathname, useSegments } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { isSchoolStaff, live, onAuthChange, session } from '../src/api/connect';
import { AccountGate, useAccountGate } from '../src/AccountGate';
import type { Gate } from '../src/gate';
import { AlertTakeover } from '../src/alerts/AlertTakeover';
import { LocationConsent } from '../src/alerts/LocationConsent';
import { offerDndAccess } from '../src/alerts/loudness';
import { syncCarPass } from '../src/carline/carPass';
import { enablePush, handleNotificationTaps } from '../src/comms/push';
import { edgeLayout } from '../src/ScreenEdge';
import { C } from '../src/ui';

// A screen opened straight from a link (khroyals://calendar, a web address, a notification
// that starts the app) gets the tabs underneath it, so it always has a back button.
export const unstable_settings = { initialRouteName: '(tabs)' };

/** Open whatever a tapped notification is about; register this device for push (and the car screen) whenever an approved person is signed in. */
function usePush() {
  useEffect(() => handleNotificationTaps(), []);
  useEffect(() => {
    if (!live) return;
    const register = () => session().then(async (p) => {
      if (!p || p.pending) return;
      syncCarPass(p);
      const staff = isSchoolStaff(p);
      await enablePush({ critical: staff });
      if (staff) await offerDndAccess();  // so critical alerts ring through Do Not Disturb
    }).catch(() => {});
    register();
    return onAuthChange(register);
  }, []);
}

export default function Root() {
  usePush();
  // Only approved accounts use the app: everyone else sees the welcome screen over it.
  const { gate, recheck } = useAccountGate();
  const open = gate === 'in';
  // Signing in (or being approved) on the welcome screen: it stays up a moment, as it was, while its
  // shield flies into the Home button. Opening the app already signed in just opens it.
  const [seen, setSeen] = useState(gate);
  const [leaving, setLeaving] = useState<Gate | null>(null);
  if (gate !== seen) {
    setSeen(gate);
    setLeaving(gate === 'in' && (seen === 'out' || seen === 'waiting') ? seen : null);
  }
  const path = usePathname();
  // The car line board is for a big screen: dark and the full width of the monitor.
  const board = useSegments()[0] === 'carline-board';
  const stack = (
    <Stack screenOptions={{
      headerStyle: { backgroundColor: C.primary }, headerTintColor: '#fff', headerTitleStyle: { fontWeight: '700' },
      // Back arrow only; otherwise iOS labels it with the tab group's route name, "(tabs)".
      headerBackButtonDisplayMode: 'minimal',
      // The page color around the centered content column on iPads and tablets.
      contentStyle: { backgroundColor: C.bg },
    }}
      // The red edge line under the header; the tabs draw their own, and the video player and car line board are dark.
      screenLayout={edgeLayout({ bottom: true, skip: ['(tabs)', 'video', 'carline-board'] })}>
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      <Stack.Screen name="profile" options={{ title: 'My profile' }} />
    </Stack>
  );
  return (
    <View style={{ flex: 1 }}>
      <StatusBar style={open ? 'light' : 'dark'} />
      {/* Hidden from screen readers while the welcome screen covers it. */}
      <View style={{ flex: 1 }} importantForAccessibility={open ? 'auto' : 'no-hide-descendants'} accessibilityElementsHidden={!open} aria-hidden={!open}>
        {Platform.OS === 'web'
          // On a computer the app (and admin portal) sits in a readable centered column; the car line board fills the screen.
          ? <View style={{ flex: 1, backgroundColor: '#E9EDF5' }}><View style={{ flex: 1, width: '100%', maxWidth: board ? undefined : 960, alignSelf: 'center' }}>{stack}</View></View>
          : stack}
      </View>
      {/* Teachers and staff: asked once about sharing their location with alert answers, and an
          active critical alert covers the app until they answer it. */}
      <LocationConsent />
      <AlertTakeover />
      {(!open || leaving) && <AccountGate gate={leaving ?? gate} recheck={recheck} linking={path === '/auth'}
        leaving={!!leaving} onGone={() => setLeaving(null)} />}
    </View>
  );
}
