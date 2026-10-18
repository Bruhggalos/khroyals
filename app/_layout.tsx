import { useEffect } from 'react';
import { Platform, View } from 'react-native';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { live, onAuthChange, session } from '../src/api/connect';
import { syncCarPass } from '../src/carline/carPass';
import { enablePush, handleNotificationTaps } from '../src/comms/push';
import { C } from '../src/ui';

// A screen opened straight from a link (khroyals://calendar, a web address, a notification
// that starts the app) gets the tabs underneath it, so it always has a back button.
export const unstable_settings = { initialRouteName: '(tabs)' };

/** Open whatever a tapped notification is about; register this device for push (and the car screen) whenever an approved person is signed in. */
function usePush() {
  useEffect(() => handleNotificationTaps(), []);
  useEffect(() => {
    if (!live) return;
    const register = () => session().then((p) => { if (p && !p.pending) { enablePush(); syncCarPass(p); } }).catch(() => {});
    register();
    return onAuthChange(register);
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
      <Stack.Screen name="profile" options={{ title: 'My profile' }} />
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
