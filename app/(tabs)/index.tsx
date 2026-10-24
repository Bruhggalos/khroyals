import { ScrollView, Text, View } from 'react-native';
import { router } from 'expo-router';
import { getCalendar, getNews } from '../../src/api/mockApi';
import { ArticleCard } from '../../src/site/Blocks';
import { C, Card, H, Loading, P, s, useLoad } from '../../src/ui';
import { dateRange, upcoming } from '../../src/site/calendar';

/**
 * Info: what's coming up on the school calendar and the latest news. (The khroyals.com
 * home page's other sections aren't shown here; its F.A.Q.s are in Ask the School.)
 */
export default function Home() {
  const { data } = useLoad(async () => ({ news: await getNews(), cal: await getCalendar() }));
  if (!data) return <Loading />;
  const next = upcoming(data.cal.events, 3);

  return (
    <ScrollView style={s.screen} contentContainerStyle={[s.pad, { gap: 22 }]}>
      <View style={{ gap: 8 }}>
        <H>Coming Up</H>
        {next.length === 0 && <Card><P muted>Nothing on the school calendar right now.</P></Card>}
        {next.map((e) => (
          <Card key={e.id} onPress={() => router.navigate('/calendar')} style={{ flexDirection: 'row', gap: 12, alignItems: 'center' }}>
            <Text style={{ fontWeight: '800', color: C.primary, width: 86 }}>{dateRange(e)}</Text>
            <View style={{ flex: 1 }}><Text style={{ fontWeight: '600', color: C.ink }}>{e.title}</Text><P muted>{e.category}</P></View>
          </Card>
        ))}
        <Text style={{ color: C.primary, fontWeight: '700' }} onPress={() => router.navigate('/calendar')}>Full calendar ›</Text>
      </View>

      <View style={{ gap: 8 }}>
        <H>Latest News</H>
        {data.news.articles.slice(0, 3).map((a) => <ArticleCard key={a.id} a={a} compact />)}
        <Text style={{ color: C.primary, fontWeight: '700' }} onPress={() => router.navigate('/news')}>All news ›</Text>
      </View>
    </ScrollView>
  );
}
