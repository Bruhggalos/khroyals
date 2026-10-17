/** Apps: the school's tools as large tiles, opened from the shield button in the middle of the tab bar. */
import type { ComponentProps } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { router, type Href } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { LEO, LEO_FACE } from '../../src/leo';
import { NewsCarousel } from '../../src/site/NewsCarousel';
import { C, P, s } from '../../src/ui';

/** A tile shows an Ionicons glyph, or an emoji where no glyph fits (Leo's lion head). */
type App = { label: string; color: string; href: Href } & ({ icon: ComponentProps<typeof Ionicons>['name'] } | { emoji: string });

// Three to a row; Ask Leo sits in the middle of the grid.
const APPS: App[] = [
  { label: 'Car Line', icon: 'car', color: '#0E7490', href: '/carline' },
  { label: 'Student', icon: 'school', color: C.primary, href: '/student' },
  { label: 'Calendar', icon: 'calendar', color: C.accent, href: '/calendar' },
  { label: 'News', icon: 'newspaper', color: '#CA8A04', href: '/news' },
  { label: 'Ask Leo', emoji: LEO_FACE, color: LEO, href: '/assistant' },
  { label: 'Marketplace', icon: 'storefront', color: '#7C3AED', href: '/market' },
  { label: 'Volunteer', icon: 'hand-left', color: '#DB2777', href: '/volunteer' },
  { label: 'Handbook', icon: 'book', color: '#0369A1', href: '/handbook' },
  { label: 'Ask the School', icon: 'help-circle', color: '#16A34A', href: '/questions' },
];

export default function Apps() {
  return (
    <View style={s.screen}>
      {/* Headlines stay put under the banner; the apps scroll below them. */}
      <View style={{ paddingHorizontal: 16, paddingTop: 16 }}><NewsCarousel /></View>
      <ScrollView style={{ flex: 1 }} contentContainerStyle={[s.pad, { paddingTop: 12 }]}>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
        {APPS.map((a) => (
          <Pressable key={a.label} onPress={() => router.push(a.href)} accessibilityRole="button" accessibilityLabel={a.label}
            style={({ pressed }) => [{ width: '33.33%', alignItems: 'center', gap: 8, paddingVertical: 14 }, pressed && { opacity: 0.6 }]}>
            <View style={{ width: 84, height: 84, borderRadius: 24, backgroundColor: a.color, alignItems: 'center', justifyContent: 'center' }}>
              {'emoji' in a
                ? <Text style={{ fontSize: 50, lineHeight: 60 }} accessible={false}>{a.emoji}</Text>
                : <Ionicons name={a.icon} size={42} color="#fff" />}
            </View>
            <Text style={{ fontSize: 15, fontWeight: '700', color: C.ink }}>{a.label}</Text>
          </Pressable>
        ))}
      </View>
      <P muted>More school apps will show up here.</P>
      </ScrollView>
    </View>
  );
}
