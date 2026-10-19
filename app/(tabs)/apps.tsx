/** Apps: the school's tools as large tiles, opened from the shield button in the middle of the tab bar. */
import type { ComponentProps } from 'react';
import { Image, Pressable, ScrollView, Text, View, type ImageSourcePropType } from 'react-native';
import { router, type Href } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { NewsCarousel } from '../../src/site/NewsCarousel';
import { C, P, s } from '../../src/ui';

/** A tile shows its own artwork or an Ionicons glyph. */
type App = { label: string; color: string; href: Href }
  & ({ icon: ComponentProps<typeof Ionicons>['name'] } | { image: ImageSourcePropType });

const APPS: App[] = [
  { label: 'Car Line', image: require('../../assets/apps/carline.png'), color: '#0A1F4D', href: '/carline' },
  { label: 'Student', image: require('../../assets/apps/student.png'), color: '#0A1F4D', href: '/student' },
  { label: 'Calendar', image: require('../../assets/apps/calendar.png'), color: '#0A1F4D', href: '/calendar' },
  { label: 'News', image: require('../../assets/apps/news.png'), color: '#0A1F4D', href: '/news' },
  { label: 'Activities', image: require('../../assets/apps/activities.png'), color: '#0A1F4D', href: '/activities' },
  { label: 'Marketplace', image: require('../../assets/apps/market.png'), color: '#0A1F4D', href: '/market' },
  { label: 'Volunteer', image: require('../../assets/apps/volunteer.png'), color: '#0A1F4D', href: '/volunteer' },
  { label: 'Handbook', image: require('../../assets/apps/handbook.png'), color: '#0A1F4D', href: '/handbook' },
  { label: 'Ask the School', image: require('../../assets/apps/questions.png'), color: '#0A1F4D', href: '/questions' },
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
            <View style={{ width: 84, height: 84, borderRadius: 24, overflow: 'hidden', backgroundColor: a.color, alignItems: 'center', justifyContent: 'center' }}>
              {'image' in a ? <Image source={a.image} style={{ width: 84, height: 84 }} accessible={false} />
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
