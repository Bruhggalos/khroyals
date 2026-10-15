import { Image, ImageBackground, Linking, Pressable, ScrollView, View } from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { getPage } from '../../src/api/mockApi';
import { C, Card, Chip, H, Loading, P, s, SectionTitle, Text, useLoad } from '../../src/ui';

const crown = require('../../assets/crown-red.png');

/** Red pill + red circle arrow, the call-to-action style on khroyals.com. */
const Cta = ({ label, onPress }: { label: string; onPress: () => void }) => (
  <Pressable onPress={onPress} style={({ pressed }) => [{ flexDirection: 'row', gap: 4, alignSelf: 'center' }, pressed && { opacity: 0.85 }]}>
    <View style={[s.btn, { width: 230, justifyContent: 'center', minHeight: 50 }]}>
      <Text style={[s.btnT, { textAlign: 'center' }]}>{label}</Text>
    </View>
    <View style={{ width: 50, height: 50, borderRadius: 25, backgroundColor: C.accent, alignItems: 'center', justifyContent: 'center' }}>
      <Ionicons name="arrow-up-outline" size={22} color="#fff" style={{ transform: [{ rotate: '45deg' }] }} />
    </View>
  </Pressable>
);

export default function Home() {
  const { data } = useLoad(async () => ({
    site: await getPage('site'), home: await getPage('home'),
    news: await getPage('news'), cal: await getPage('calendar'),
  }));
  if (!data) return <Loading />;
  const { site, home, news, cal } = data;
  const go = (it: { route?: string; url?: string }) =>
    it.url ? Linking.openURL(it.url) : it.route && router.push(`/page/${it.route.replace(/^\//, '').split('#')[0] || 'home'}`);

  return (
    <ScrollView style={s.screen}>
      {site.alertBanner.active && (
        <View style={{ backgroundColor: C.accent, paddingVertical: 10, paddingHorizontal: 16 }}>
          <Text style={{ color: '#fff', fontWeight: '600', textAlign: 'center' }}>{site.alertBanner.message}</Text>
        </View>
      )}
      {home.blocks.map((b: any, i: number) => {
        switch (b.type) {
          case 'hero': {
            const slide = b.slides[0];
            return (
              <ImageBackground key={i} source={{ uri: slide.image }} style={{ backgroundColor: '#000' }} imageStyle={{ opacity: 0.35 }}>
                <View style={{ paddingHorizontal: 24, paddingVertical: 44, gap: 18 }}>
                  <Text style={{ color: '#fff', fontSize: 28, lineHeight: 36, textAlign: 'center' }}>
                    {slide.headline} <Text style={{ color: C.accent }}>{slide.headlineAccent}</Text>
                  </Text>
                  <Text style={{ color: '#fff', fontSize: 17, lineHeight: 25, textAlign: 'center' }}>{slide.subhead}</Text>
                  <View style={{ gap: 10, marginTop: 8 }}>
                    {slide.ctas?.map((c: any) => <Cta key={c.label} label={c.label} onPress={() => go(c)} />)}
                  </View>
                </View>
              </ImageBackground>
            );
          }
          case 'quickLinks':
            return (
              <View key={i} style={[s.pad, { flexDirection: 'row', flexWrap: 'wrap', gap: 8 }]}>
                {b.items.map((it: any) => (
                  <Pressable key={it.label} onPress={() => go(it)} style={[s.card, { width: '31.5%', alignItems: 'center', padding: 10 }]}>
                    <Text style={{ fontSize: 12, fontWeight: '600', textAlign: 'center', color: C.navy }}>{it.label}</Text>
                  </Pressable>
                ))}
              </View>
            );
          case 'newsFeed':
            // Royal-blue band with the red crown, like the site's "What parents are saying" section.
            return (
              <View key={i} style={{ backgroundColor: C.primary, paddingHorizontal: 16, paddingVertical: 28, gap: 14 }}>
                <Image source={crown} style={{ width: 56, height: 52, alignSelf: 'center' }} resizeMode="contain" />
                <SectionTitle before="The latest " accent="news" after=" from KH" light />
                {news.articles.filter((a) => a.featured).slice(0, b.limit).map((a) => (
                  <Card key={a.id} style={{ borderColor: C.accent, borderWidth: 1.5 }} onPress={() => router.push(`/news/${a.slug}`)}>
                    <Chip label={a.category} /><Text style={{ fontWeight: '700', fontSize: 16, color: C.navy }}>{a.title}</Text>
                    <P muted>{a.summary}</P>
                  </Card>
                ))}
              </View>
            );
          case 'eventFeed':
            return (
              <View key={i} style={[s.pad, { paddingTop: 24 }]}>
                <SectionTitle before="Upcoming " accent="events" />
                {[...cal.events].sort((x, y) => x.date.localeCompare(y.date)).slice(0, b.limit).map((e) => (
                  <Card key={e.id} style={{ flexDirection: 'row', gap: 12 }}>
                    <Text style={{ fontWeight: '800', color: C.accent, width: 54 }}>{e.date.slice(5)}</Text>
                    <View style={{ flex: 1 }}><Text style={{ fontWeight: '600', color: C.navy }}>{e.title}</Text><P muted>{e.location}</P></View>
                  </Card>
                ))}
              </View>
            );
          case 'principalMessage':
            return <View key={i} style={s.pad}><Card><H>From the Principal</H><P muted>{b.name}</P><P>{b.text}</P></Card></View>;
          case 'stats':
            return (
              <View key={i} style={[s.pad, { flexDirection: 'row', flexWrap: 'wrap', gap: 8, paddingBottom: 32 }]}>
                {b.items.map((st: any) => (
                  <Card key={st.label} style={{ width: '48.5%', alignItems: 'center' }}>
                    <Text style={{ fontSize: 22, fontWeight: '800', color: C.primary }}>{st.value}</Text><P muted>{st.label}</P>
                  </Card>
                ))}
              </View>
            );
          default:
            return null;
        }
      })}
    </ScrollView>
  );
}
