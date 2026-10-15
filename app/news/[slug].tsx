import { Image, ScrollView, Text } from 'react-native';
import { Stack, useLocalSearchParams } from 'expo-router';
import { getArticle } from '../../src/api/mockApi';
import { C, Chip, Loading, P, s, useLoad } from '../../src/ui';

export default function Article() {
  const { slug } = useLocalSearchParams<{ slug: string }>();
  const { data: a } = useLoad(() => getArticle(slug), [slug]);
  if (!a) return <Loading />;
  return (
    <ScrollView style={s.screen} contentContainerStyle={s.pad}>
      <Stack.Screen options={{ title: 'News' }} />
      <Image source={{ uri: a.heroImage }} style={{ height: 200, borderRadius: 12 }} />
      <Chip label={a.category} />
      <Text style={{ fontSize: 24, fontWeight: '800', color: C.ink }}>{a.title}</Text>
      <P muted>{a.publishedAt} · {a.author}</P>
      {a.body.map((b, i) => <P key={i}>{b.text}</P>)}
    </ScrollView>
  );
}
