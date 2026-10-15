import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { C } from '../src/ui';

export default function Root() {
  return (
    <>
      <StatusBar style="light" />
      <Stack screenOptions={{ headerStyle: { backgroundColor: C.primary }, headerTintColor: '#fff', headerTitleStyle: { fontWeight: '700' } }}>
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      </Stack>
    </>
  );
}
