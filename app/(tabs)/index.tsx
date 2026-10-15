import { Image, Linking, Pressable, ScrollView, Text, View } from 'react-native';
import { router } from 'expo-router';
import { getPage } from '../../src/api/mockApi';
import { C, Card, Chip, H, Loading, P, s, useLoad } from '../../src/ui';

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
    <ScrollView style={s.screen} contentContainerStyle={s.pad}>
      {site.alertBanner.active && (
        <Card style={{ backgroundColor: C.gold + '33', borderColor: C.gold }}><P>⚠️ {site.alertBanner.message}</P></Card>
      )}
      {home.blocks.map((b: any, i: number) => {
        switch (b.type) {
          case 'hero': {
            const slide = b.slides[0];
            return (
              <View key={i} style={{ borderRadius: 16, overflow: 'hidden' }}>
                <Image source={{ uri: slide.image }} style={{ height: 180 }} />
                <View style={{ position: 'absolute', left: 0, right: 0, bottom: 0, padding: 14, backgroundColor: '#0008' }}>
                  <Text style={{ color: '#fff', fontSize: 22, fontWeight: '800' }}>{slide.headline}</Text>
                  <Text style={{ color: '#fff' }}>{slide.subhead}</Text>
                </View>
              </View>
            );
          }
          case 'quickLinks':
            return (
              <View key={i} style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                {b.items.map((it: any) => (
                  <Pressable key={it.label} onPress={() => go(it)} style={[s.card, { width: '31.5%', alignItems: 'center', padding: 10 }]}>
                    <Text style={{ fontSize: 12, fontWeight: '600', textAlign: 'center', color: C.primary }}>{it.label}</Text>
                  </Pressable>
                ))}
              </View>
            );
          case 'newsFeed':
            return (
              <View key={i} style={{ gap: 8 }}>
                <H>Latest News</H>
                {news.articles.filter((a) => a.featured).slice(0, b.limit).map((a) => (
                  <Card key={a.id} onPress={() => router.push(`/news/${a.slug}`)}>
                    <Chip label={a.category} /><Text style={{ fontWeight: '700', fontSize: 16, color: C.ink }}>{a.title}</Text>
                    <P muted>{a.summary}</P>
                  </Card>
                ))}
              </View>
            );
          case 'eventFeed':
            return (
              <View key={i} style={{ gap: 8 }}>
                <H>Upcoming</H>
                {cal.events.slice(0, b.limit).map((e) => (
                  <Card key={e.id} style={{ flexDirection: 'row', gap: 12 }}>
                    <Text style={{ fontWeight: '800', color: C.primary, width: 54 }}>{e.date.slice(5)}</Text>
                    <View style={{ flex: 1 }}><Text style={{ fontWeight: '600', color: C.ink }}>{e.title}</Text><P muted>{e.location}</P></View>
                  </Card>
                ))}
              </View>
            );
          case 'principalMessage':
            return <Card key={i}><H>From the Principal</H><P muted>{b.name}</P><P>{b.text}</P></Card>;
          case 'stats':
            return (
              <View key={i} style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
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
