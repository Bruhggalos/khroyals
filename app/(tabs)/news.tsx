import { useState } from 'react';
import { FlatList, ScrollView, Text } from 'react-native';
import { getNews } from '../../src/api/mockApi';
import { ArticleCard } from '../../src/site/Blocks';
import { C, Loading, s, useLoad } from '../../src/ui';

export default function News() {
  const { data } = useLoad(getNews);
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
      renderItem={({ item }) => <ArticleCard a={item} />} />
  );
}
