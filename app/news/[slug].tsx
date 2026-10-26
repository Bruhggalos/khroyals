import { Image, Linking, Text } from 'react-native';
import { Stack, useLocalSearchParams } from 'expo-router';
import { getArticle } from '../../src/api/mockApi';
import { BlockList, formatDate } from '../../src/site/Blocks';
import { ReadingScroll } from '../../src/Reading';
import { C, Chip, Loading, P, useLoad } from '../../src/ui';

export default function Article() {
  const { slug } = useLocalSearchParams<{ slug: string }>();
  const { data: a } = useLoad(() => getArticle(slug), [slug]);
  if (!a) return <Loading />;
  // The hero image usually repeats as the last body image; don't show it twice.
  const body = a.body.filter((b, i) => !(b.type === 'image' && a.heroImage && b.src === a.heroImage && i === a.body.length - 1));
  return (
    <ReadingScroll doneLabel="Back to News" doneHref="/news">
      <Stack.Screen options={{ title: 'News' }} />
      {a.heroImage && <Image source={{ uri: a.heroImage }} style={{ height: 220, borderRadius: 12 }} />}
      <Chip label={a.category} />
      <Text style={{ fontSize: 24, fontWeight: '800', color: C.ink }}>{a.title}</Text>
      <P muted>{formatDate(a.publishedAt, { month: 'long', day: 'numeric', year: 'numeric' })} · {a.author}</P>
      <BlockList blocks={body} />
      <Text style={{ color: C.primary, fontWeight: '600', marginTop: 8 }} onPress={() => Linking.openURL(a.sourceUrl)}>View on khroyals.com ›</Text>
    </ReadingScroll>
  );
}
