/** Apps: the school's tools as large tiles, opened from the shield button in the middle of the tab bar. */
import { useCallback, useEffect, useState, type ComponentProps } from 'react';
import { Image, Pressable, ScrollView, Text, View, type ImageSourcePropType } from 'react-native';
import { router, useFocusEffect, type Href } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import {
  isFamily, isSchoolStaff, listAlerts, me, onAuthChange, session, subscribeAlerts, type CriticalAlert, type Person,
} from '../../src/api/connect';
import { alertKind } from '../../src/alerts/kinds';
import { NewsCarousel } from '../../src/site/NewsCarousel';
import { C, P, s } from '../../src/ui';

/**
 * A tile shows its own artwork or an Ionicons glyph. `family: false` keeps it off Family
 * accounts' page; `staffOnly` shows it only to teachers, staff and admins.
 */
type App = { label: string; color: string; href: Href; family?: false; staffOnly?: true }
  & ({ icon: ComponentProps<typeof Ionicons>['name'] } | { image: ImageSourcePropType });

const APPS: App[] = [
  { label: 'Alerts', icon: 'warning', color: '#B42318', href: '/alerts', staffOnly: true },
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

/** The signed-in person (which apps they see depends on their role). */
function usePerson() {
  const [person, setPerson] = useState<Person | null>(() => me());
  useEffect(() => {
    const check = () => session().then(setPerson).catch(() => {});
    check();
    return onAuthChange(check);
  }, []);
  useFocusEffect(useCallback(() => { setPerson(me()); }, []));
  return person;
}

/** Teachers and staff: any critical alert still active. */
function useActiveAlerts(staff: boolean) {
  const [active, setActive] = useState<CriticalAlert[]>([]);
  useEffect(() => {
    if (!staff) { setActive([]); return; }
    const load = () => listAlerts(5).then((a) => setActive(a.filter((x) => !x.endedAt))).catch(() => {});
    load();
    return subscribeAlerts(load);
  }, [staff]);
  return active;
}

export default function Apps() {
  const person = usePerson();
  const staff = isSchoolStaff(person);
  const active = useActiveAlerts(staff);
  const apps = APPS.filter((a) => (a.staffOnly ? staff : !(isFamily(person) && a.family === false)));
  return (
    <View style={s.screen}>
      {/* Headlines stay put under the banner; the apps scroll below them. */}
      <View style={{ paddingHorizontal: 16, paddingTop: 16 }}><NewsCarousel /></View>
      <ScrollView style={{ flex: 1 }} contentContainerStyle={[s.pad, { paddingTop: 12 }]}>
      {active.map((a) => (
        <Pressable key={a.id} onPress={() => router.push('/alerts')} accessibilityRole="button" accessibilityLabel={`Critical alert: ${a.title}. Open`}
          style={({ pressed }) => [{ flexDirection: 'row', alignItems: 'center', gap: 10, padding: 14, borderRadius: 14,
            backgroundColor: alertKind(a.kind).color }, pressed && { opacity: 0.85 }]}>
          <Ionicons name="warning" size={26} color="#fff" />
          <View style={{ flex: 1 }}>
            <Text style={{ color: '#fff', fontWeight: '900', fontSize: 12, letterSpacing: 1 }}>CRITICAL ALERT · ACTIVE</Text>
            <Text style={{ color: '#fff', fontWeight: '800', fontSize: 16 }}>{a.title}</Text>
          </View>
          <Ionicons name="chevron-forward" size={22} color="#fff" />
        </Pressable>
      ))}
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
