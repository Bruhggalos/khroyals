import { ScrollView, Text } from 'react-native';
import { router } from 'expo-router';
import { getPage } from '../../src/api/mockApi';
import { C, Card, Loading, s, useLoad } from '../../src/ui';

const IN_TABS = new Set(['home', 'news', 'calendar']);

export default function More() {
  const { data } = useLoad(() => getPage('site'));
  if (!data) return <Loading />;
  return (
    <ScrollView style={s.screen} contentContainerStyle={s.pad}>
      {data.navigation.filter((n) => !IN_TABS.has(n.id)).map((n) => (
        <Card key={n.id} onPress={() => router.push(`/page/${n.id}`)}>
          <Text style={{ fontSize: 16, fontWeight: '600', color: C.ink }}>{n.label}  ›</Text>
        </Card>
      ))}
    </ScrollView>
  );
}
