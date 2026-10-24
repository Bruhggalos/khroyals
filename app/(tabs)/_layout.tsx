import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { Tabs, router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { bottomArc } from '../../src/arcText';
import { headerDate } from '../../src/info/today';
import { edgeLayout, TabBarEdge } from '../../src/ScreenEdge';
import { C } from '../../src/ui';

const BUTTON = 66;          // the shield button's diameter
const LABEL_SIZE = 10;      // same as the other tabs' labels
const INACTIVE = '#8E8E93'; // the other tabs' unselected label color
// "Home" just outside the button's bottom edge, following its curve.
const HOME = bottomArc('Home', BUTTON / 2 + 2 + LABEL_SIZE / 2, LABEL_SIZE, 0);
const LETTER = { width: LABEL_SIZE * 1.2, height: LABEL_SIZE * 1.4 };

const icon = (e: string) => ({ focused }: { focused: boolean }) => <Text style={{ fontSize: 20, opacity: focused ? 1 : 0.5 }}>{e}</Text>;

/** The raised Kingdom Heights shield in the middle of the tab bar, labeled "Home"; opens the Apps page. */
function AppsTabButton({ onPress, 'aria-selected': selected }: { onPress?: (e: any) => void; 'aria-selected'?: boolean }) {
  const on = !!selected;
  return (
    <View style={hs.appsSlot}>
      <View style={hs.appsButton}>
        <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel="Home" accessibilityState={{ selected: on }}
          hitSlop={{ bottom: 16 }}
          style={({ pressed }) => [hs.apps, on && { borderColor: C.accent }, pressed && { transform: [{ scale: 0.94 }] }]}>
          <Image source={require('../../assets/icon.png')} style={hs.shield} />
        </Pressable>
        <View pointerEvents="none" style={StyleSheet.absoluteFill}>
          {HOME.map((l, i) => (
            <Text key={i} accessible={false} style={[hs.letter, {
              left: BUTTON / 2 + l.x - LETTER.width / 2, top: BUTTON / 2 + l.y - LETTER.height / 2,
              transform: [{ rotate: `${l.rotate}deg` }], color: on ? C.primary : INACTIVE,
            }]}>{l.char}</Text>
          ))}
        </View>
      </View>
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
      tabBarBackground: TabBarEdge,
      // The page color around the centered content column on iPads and tablets.
      sceneStyle: { backgroundColor: C.bg },
    }}
      // The red edge line runs down the sides of each tab and on around the tab bar.
      screenLayout={edgeLayout({ bottom: false })}>
      {/* Today's date; the Info screen keeps it current. */}
      <Tabs.Screen name="index" options={{ title: 'Planner', headerTitle: headerDate(), tabBarIcon: icon('🗓️') }} />
      <Tabs.Screen name="share" options={{ title: 'Share', tabBarIcon: icon('📲') }} />
      <Tabs.Screen name="apps" options={{ title: 'Apps', headerTitle: 'Boldly Christian', tabBarButton: (props) => <AppsTabButton {...props} /> }} />
      <Tabs.Screen name="connect" options={{ title: 'Connect', tabBarIcon: icon('💬') }} />
      <Tabs.Screen name="more" options={{ title: 'More', tabBarIcon: icon('☰') }} />
    </Tabs>
  );
}

const hs = StyleSheet.create({
  appsSlot: { flex: 1, alignItems: 'center' },
  appsButton: { width: BUTTON, height: BUTTON, marginTop: -32 },
  apps: {
    width: BUTTON, height: BUTTON, borderRadius: BUTTON / 2, backgroundColor: '#fff',
    borderWidth: 3, borderColor: C.primary, alignItems: 'center', justifyContent: 'center',
    shadowColor: '#000', shadowOpacity: 0.18, shadowRadius: 6, shadowOffset: { width: 0, height: 3 }, elevation: 6,
  },
  shield: { width: 58, height: 58, borderRadius: 29 },
  letter: {
    position: 'absolute', width: LETTER.width, height: LETTER.height, lineHeight: LETTER.height,
    textAlign: 'center', fontSize: LABEL_SIZE, fontWeight: '600',
  },
  bell: {
    width: 36, height: 36, borderRadius: 18, marginRight: 16,
    alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.18)',
  },
});
