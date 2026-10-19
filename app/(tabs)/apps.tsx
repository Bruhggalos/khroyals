/** Apps: the school's tools as large tiles, opened from the shield button in the middle of the tab bar. */
import { useCallback, useEffect, useState, type ComponentProps } from 'react';
import { Image, Pressable, ScrollView, Text, View, type ImageSourcePropType } from 'react-native';
import { router, useFocusEffect, type Href } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { isFamily, me, onAuthChange, session } from '../../src/api/connect';
import { NewsCarousel } from '../../src/site/NewsCarousel';
import { C, P, s } from '../../src/ui';

/** A tile shows its own artwork or an Ionicons glyph. `family: false` keeps it off Family accounts' page. */
type App = { label: string; color: string; href: Href; family?: false }
  & ({ icon: ComponentProps<typeof Ionicons>['name'] } | { image: ImageSourcePropType });

const APPS: App[] = [
  { label: 'Car Line', image: require('../../assets/apps/carline.png'), color: '#0A1F4D', href: '/carline' },
  { label: 'Student', image: require('../../assets/apps/student.png'), color: '#0A1F4D', href: '/student', family: false },
  { label: 'Calendar', image: require('../../assets/apps/calendar.png'), color: '#0A1F4D', href: '/calendar' },
  { label: 'News', image: require('../../assets/apps/news.png'), color: '#0A1F4D', href: '/news' },
  { label: 'Activities', image: require('../../assets/apps/activities.png'), color: '#0A1F4D', href: '/activities' },
  { label: 'Marketplace', image: require('../../assets/apps/market.png'), color: '#0A1F4D', href: '/market', family: false },
  { label: 'Volunteer', image: require('../../assets/apps/volunteer.png'), color: '#0A1F4D', href: '/volunteer' },
  { label: 'Handbook', image: require('../../assets/apps/handbook.png'), color: '#0A1F4D', href: '/handbook' },
  { label: 'Ask the School', image: require('../../assets/apps/questions.png'), color: '#0A1F4D', href: '/questions', family: false },
];

/** Whether the signed-in person has a Family account (they see fewer apps). */
function useFamily() {
  const [family, setFamily] = useState(() => isFamily(me()));
  useEffect(() => {
    const check = () => session().then((p) => setFamily(isFamily(p))).catch(() => {});
    check();
    return onAuthChange(check);
  }, []);
  useFocusEffect(useCallback(() => { setFamily(isFamily(me())); }, []));
  return family;
}

export default function Apps() {
  const family = useFamily();
  const apps = family ? APPS.filter((a) => a.family !== false) : APPS;
  return (
    <View style={s.screen}>
      {/* Headlines stay put under the banner; the apps scroll below them. */}
      <View style={{ paddingHorizontal: 16, paddingTop: 16 }}><NewsCarousel /></View>
      <ScrollView style={{ flex: 1 }} contentContainerStyle={[s.pad, { paddingTop: 12 }]}>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
        {apps.map((a) => (
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
