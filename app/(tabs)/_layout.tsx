import { Tabs } from 'expo-router';
import { Text } from 'react-native';
import { C } from '../../src/ui';

const icon = (e: string) => ({ focused }: { focused: boolean }) => <Text style={{ fontSize: 20, opacity: focused ? 1 : 0.5 }}>{e}</Text>;

export default function TabsLayout() {
  return (
    <Tabs screenOptions={{
      headerStyle: { backgroundColor: C.primary }, headerTintColor: '#fff',
      tabBarActiveTintColor: C.primary,
    }}>
      <Tabs.Screen name="index" options={{ title: 'Home', tabBarIcon: icon('🏠') }} />
      <Tabs.Screen name="news" options={{ title: 'News', tabBarIcon: icon('📰') }} />
      <Tabs.Screen name="calendar" options={{ title: 'Calendar', tabBarIcon: icon('📅') }} />
      <Tabs.Screen name="connect" options={{ title: 'Connect', tabBarIcon: icon('💬') }} />
      <Tabs.Screen name="more" options={{ title: 'More', tabBarIcon: icon('☰') }} />
    </Tabs>
  );
}
