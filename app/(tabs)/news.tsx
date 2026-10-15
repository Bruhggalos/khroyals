import { useState } from 'react';
import { FlatList, Image, ScrollView, Text } from 'react-native';
import { router } from 'expo-router';
import { getPage } from '../../src/api/mockApi';
import { C, Card, Chip, Loading, P, s, useLoad } from '../../src/ui';

export default function News() {
  const { data } = useLoad(() => getPage('news'));
  const [cat, setCat] = useState<string | null>(null);
  if (!data) return <Loading />;
  const items = data.articles.filter((a) => !cat || a.category === cat);
  return (
    <FlatList style={s.screen} contentContainerStyle={s.pad} data={items} keyExtractor={(a) => a.id}
      ListHeaderComponent={
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6 }}>
          {[null, ...data.categories].map((c) => (
            <Text key={c ?? 'all'} onPress={() => setCat(c)} style={{ paddingHorizontal: 12, paddingVertical: 6, borderRadius: 999, overflow: 'hidden',
              backgroundColor: cat === c ? C.primary : '#fff', color: cat === c ? '#fff' : C.ink, borderWidth: 1, borderColor: C.line }}>{c ?? 'All'}</Text>
          ))}
        </ScrollView>}
      renderItem={({ item: a }) => (
        <Card onPress={() => router.push(`/news/${a.slug}`)}>
          <Image source={{ uri: a.heroImage }} style={{ height: 140, borderRadius: 10 }} />
          <Chip label={a.category} />
          <Text style={{ fontWeight: '700', fontSize: 16, color: C.ink }}>{a.title}</Text>
          <P muted>{a.publishedAt} · {a.author}</P>
        </Card>
      )} />
  );
}
