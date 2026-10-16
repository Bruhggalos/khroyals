/** Apps: the school's tools as large tiles, opened from the shield button in the middle of the tab bar. */
import type { ComponentProps } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { router, type Href } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { C, P, s } from '../../src/ui';

type App = { label: string; icon: ComponentProps<typeof Ionicons>['name']; color: string; href: Href };

const APPS: App[] = [
  { label: 'Car Line', icon: 'car', color: '#0E7490', href: '/carline' },
  { label: 'Student', icon: 'school', color: C.primary, href: '/student' },
  { label: 'Calendar', icon: 'calendar', color: C.accent, href: '/calendar' },
];

export default function Apps() {
  return (
    <ScrollView style={s.screen} contentContainerStyle={[s.pad, { paddingTop: 24 }]}>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
        {APPS.map((a) => (
          <Pressable key={a.label} onPress={() => router.push(a.href)} accessibilityRole="button" accessibilityLabel={a.label}
            style={({ pressed }) => [{ width: '33.33%', alignItems: 'center', gap: 8, paddingVertical: 14 }, pressed && { opacity: 0.6 }]}>
            <View style={{ width: 84, height: 84, borderRadius: 24, backgroundColor: a.color, alignItems: 'center', justifyContent: 'center' }}>
              <Ionicons name={a.icon} size={42} color="#fff" />
            </View>
            <Text style={{ fontSize: 15, fontWeight: '700', color: C.ink }}>{a.label}</Text>
          </Pressable>
        ))}
      </View>
      <P muted>More school apps will show up here.</P>
    </ScrollView>
  );
}
