/** Apps: the school's tools as large tiles, opened from the shield button in the middle of the tab bar. */
import type { ComponentProps } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { router, type Href } from 'expo-router';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { NewsCarousel } from '../../src/site/NewsCarousel';
import { C, P, s } from '../../src/ui';

type Glyph = ComponentProps<typeof MaterialCommunityIcons>['name'];
/** A tile shows an Ionicons glyph, or two glyphs that share it (Activities: sports and theater). */
type App = { label: string; color: string; href: Href } & ({ icon: ComponentProps<typeof Ionicons>['name'] } | { pair: [Glyph, Glyph] });

const APPS: App[] = [
  { label: 'Car Line', icon: 'car', color: '#0E7490', href: '/carline' },
  { label: 'Student', icon: 'school', color: C.primary, href: '/student' },
  { label: 'Calendar', icon: 'calendar', color: C.accent, href: '/calendar' },
  { label: 'News', icon: 'newspaper', color: '#CA8A04', href: '/news' },
  { label: 'Activities', pair: ['basketball', 'drama-masks'], color: '#EA580C', href: '/activities' },
  { label: 'Marketplace', icon: 'storefront', color: '#7C3AED', href: '/market' },
  { label: 'Volunteer', icon: 'hand-left', color: '#DB2777', href: '/volunteer' },
  { label: 'Handbook', icon: 'book', color: '#0369A1', href: '/handbook' },
  { label: 'Ask the School', icon: 'help-circle', color: '#16A34A', href: '/questions' },
];

/** Two glyphs on one tile: the first up and to the left, the second down and to the right. */
function PairIcon({ pair: [a, b] }: { pair: [Glyph, Glyph] }) {
  return (
    <View style={{ width: 60, height: 60 }} accessible={false}>
      <MaterialCommunityIcons name={a} size={36} color="#fff" style={{ position: 'absolute', left: 0, top: 0 }} />
      <MaterialCommunityIcons name={b} size={36} color="#fff" style={{ position: 'absolute', right: 0, bottom: 0 }} />
    </View>
  );
}

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
              {'pair' in a ? <PairIcon pair={a.pair} /> : <Ionicons name={a.icon} size={42} color="#fff" />}
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
