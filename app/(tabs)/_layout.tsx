import { Pressable, StyleSheet, Text } from 'react-native';
import { Tabs, router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { C } from '../../src/ui';

const icon = (e: string) => ({ focused }: { focused: boolean }) => <Text style={{ fontSize: 20, opacity: focused ? 1 : 0.5 }}>{e}</Text>;

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

export default function TabsLayout() {
  return (
    <Tabs screenOptions={{
      headerStyle: { backgroundColor: C.primary }, headerTintColor: '#fff',
      headerTitleAlign: 'left',
      headerRight: () => <NotificationsButton />,
      tabBarActiveTintColor: C.primary,
    }}>
      <Tabs.Screen name="index" options={{ title: 'Home', headerTitle: 'Kingdom Heights', tabBarIcon: icon('🏠') }} />
      <Tabs.Screen name="news" options={{ title: 'News', tabBarIcon: icon('📰') }} />
      <Tabs.Screen name="calendar" options={{ title: 'Calendar', tabBarIcon: icon('📅') }} />
      <Tabs.Screen name="connect" options={{ title: 'Connect', tabBarIcon: icon('💬') }} />
      <Tabs.Screen name="more" options={{ title: 'More', tabBarIcon: icon('☰') }} />
    </Tabs>
  );
}

const hs = StyleSheet.create({
  bell: {
    width: 36, height: 36, borderRadius: 18, marginRight: 16,
    alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.18)',
  },
});
