import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { Tabs, router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { C } from '../../src/ui';

const icon = (e: string) => ({ focused }: { focused: boolean }) => <Text style={{ fontSize: 20, opacity: focused ? 1 : 0.5 }}>{e}</Text>;

/** The raised Kingdom Heights shield in the middle of the tab bar; opens Apps. */
function AppsTabButton({ onPress, 'aria-selected': selected }: { onPress?: (e: any) => void; 'aria-selected'?: boolean }) {
  const on = !!selected;
  return (
    <View style={hs.appsSlot}>
      <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel="Apps" accessibilityState={{ selected: on }}
        style={({ pressed }) => [hs.apps, on && { borderColor: C.accent }, pressed && { transform: [{ scale: 0.94 }] }]}>
        <Image source={require('../../assets/icon.png')} style={hs.shield} />
      </Pressable>
    </View>
  );
}

/** Round bell in the top bar; opens the signed-in person's notifications. */
function NotificationsButton() {
  return (
    <Pressable onPress={() => router.push('/notifications')} hitSlop={8}
      accessibilityRole="button" accessibilityLabel="Notifications"
      style={({ pressed }) => [hs.bell, pressed && { opacity: 0.6 }]}>
      <Ionicons name="notifications-outline" size={20} color="#fff" />
    </Pressable>
  );
}

/** Round person button next to the bell; opens My profile (photo, name, notification settings). */
function ProfileButton() {
  return (
    <Pressable onPress={() => router.push('/profile')} hitSlop={8}
      accessibilityRole="button" accessibilityLabel="My profile"
      style={({ pressed }) => [hs.bell, { marginRight: 10 }, pressed && { opacity: 0.6 }]}>
      <Ionicons name="person-outline" size={20} color="#fff" />
    </Pressable>
  );
}

export default function TabsLayout() {
  return (
    <Tabs screenOptions={{
      headerStyle: { backgroundColor: C.primary }, headerTintColor: '#fff',
      headerTitleAlign: 'left',
      headerRight: () => <View style={{ flexDirection: 'row' }}><ProfileButton /><NotificationsButton /></View>,
      tabBarActiveTintColor: C.primary,
    }}>
      <Tabs.Screen name="index" options={{ title: 'Home', headerTitle: 'Kingdom Heights', tabBarIcon: icon('🏠') }} />
      <Tabs.Screen name="news" options={{ title: 'News', tabBarIcon: icon('📰') }} />
      <Tabs.Screen name="apps" options={{ title: 'Apps', headerTitle: 'Boldly Christian', tabBarButton: (props) => <AppsTabButton {...props} /> }} />
      <Tabs.Screen name="connect" options={{ title: 'Connect', tabBarIcon: icon('💬') }} />
      <Tabs.Screen name="more" options={{ title: 'More', tabBarIcon: icon('☰') }} />
    </Tabs>
  );
}

const hs = StyleSheet.create({
  appsSlot: { flex: 1, alignItems: 'center' },
  apps: {
    width: 66, height: 66, borderRadius: 33, marginTop: -24, backgroundColor: '#fff',
    borderWidth: 3, borderColor: C.primary, alignItems: 'center', justifyContent: 'center',
    shadowColor: '#000', shadowOpacity: 0.18, shadowRadius: 6, shadowOffset: { width: 0, height: 3 }, elevation: 6,
  },
  shield: { width: 58, height: 58, borderRadius: 29 },
  bell: {
    width: 36, height: 36, borderRadius: 18, marginRight: 16,
    alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.18)',
  },
});
