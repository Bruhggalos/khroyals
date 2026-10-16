import { useEffect } from 'react';
import { Platform, View } from 'react-native';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { live, onAuthChange, session } from '../src/api/connect';
import { syncCarPass } from '../src/carline/carPass';
import { enablePush, handleNotificationTaps } from '../src/comms/push';
import { C } from '../src/ui';

/** Register this device for push (and the car screen) whenever an approved person is signed in. */
function usePush() {
  useEffect(() => {
    if (!live) return;
    const register = () => session().then((p) => { if (p && !p.pending) { enablePush(); syncCarPass(p); } }).catch(() => {});
    register();
    const offAuth = onAuthChange(register);
    const offTaps = handleNotificationTaps();
    return () => { offAuth(); offTaps(); };
  }, []);
}

export default function Root() {
  usePush();
  const stack = (
    <Stack screenOptions={{
      headerStyle: { backgroundColor: C.primary }, headerTintColor: '#fff', headerTitleStyle: { fontWeight: '700' },
      // Back arrow only; otherwise iOS labels it with the tab group's route name, "(tabs)".
      headerBackButtonDisplayMode: 'minimal',
    }}>
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
    </Stack>
  );
  return (
    <>
      <StatusBar style="light" />
      {Platform.OS === 'web'
        // On a computer the app (and admin portal) sits in a readable centered column.
        ? <View style={{ flex: 1, backgroundColor: '#E9EDF5' }}><View style={{ flex: 1, width: '100%', maxWidth: 960, alignSelf: 'center' }}>{stack}</View></View>
        : stack}
    </>
  );
}
