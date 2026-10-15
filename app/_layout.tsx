import { useEffect } from 'react';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import * as SplashScreen from 'expo-splash-screen';
import {
  useFonts,
  Montserrat_300Light, Montserrat_300Light_Italic, Montserrat_400Regular, Montserrat_400Regular_Italic,
  Montserrat_500Medium, Montserrat_600SemiBold, Montserrat_700Bold, Montserrat_700Bold_Italic, Montserrat_800ExtraBold,
} from '@expo-google-fonts/montserrat';
import { header } from '../src/ui';

SplashScreen.preventAutoHideAsync().catch(() => {});

export default function Root() {
  const [loaded, error] = useFonts({
    Montserrat_300Light, Montserrat_300Light_Italic, Montserrat_400Regular, Montserrat_400Regular_Italic,
    Montserrat_500Medium, Montserrat_600SemiBold, Montserrat_700Bold, Montserrat_700Bold_Italic, Montserrat_800ExtraBold,
  });
  const ready = loaded || !!error;
  useEffect(() => { if (ready) SplashScreen.hideAsync().catch(() => {}); }, [ready]);
  if (!ready) return null;

  return (
    <>
      <StatusBar style="dark" />
      <Stack screenOptions={header}>
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      </Stack>
    </>
  );
}
