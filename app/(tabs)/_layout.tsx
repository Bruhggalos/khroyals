import type { ComponentProps } from 'react';
import { Image, type ColorValue } from 'react-native';
import { Tabs } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { C, font, header } from '../../src/ui';

type IconName = ComponentProps<typeof Ionicons>['name'];
const icon = (name: IconName) => ({ color, size, focused }: { color: ColorValue; size: number; focused: boolean }) =>
  <Ionicons name={focused ? name : (`${name}-outline` as IconName)} size={size} color={color} />;

/** Crest + "KINGDOM HEIGHTS" wordmark, as in the site header. */
const Logo = () =>
  <Image source={require('../../assets/logo.png')} style={{ height: 46, width: 128 }} resizeMode="contain" accessibilityLabel="Kingdom Heights" />;

export default function TabsLayout() {
  return (
    <Tabs screenOptions={{
      ...header,
      tabBarActiveTintColor: C.primary,
      tabBarInactiveTintColor: C.muted,
      tabBarLabelStyle: { fontFamily: font('600'), fontSize: 11 },
      tabBarStyle: { backgroundColor: '#fff', borderTopColor: C.line },
    }}>
      <Tabs.Screen name="index" options={{ title: 'Home', headerTitle: Logo, headerTitleAlign: 'left', tabBarIcon: icon('home') }} />
      <Tabs.Screen name="news" options={{ title: 'News', tabBarIcon: icon('newspaper') }} />
      <Tabs.Screen name="calendar" options={{ title: 'Calendar', tabBarIcon: icon('calendar') }} />
      <Tabs.Screen name="connect" options={{ title: 'Connect', tabBarIcon: icon('chatbubbles') }} />
      <Tabs.Screen name="more" options={{ title: 'More', tabBarIcon: icon('menu') }} />
    </Tabs>
  );
}
