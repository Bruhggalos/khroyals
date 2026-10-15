/**
 * Every khroyals.com page (content/site/pages) renders through the shared
 * block renderer, so re-importing the site needs no new screens.
 */
import { Linking, ScrollView, Text, View } from 'react-native';
import { Stack, useLocalSearchParams } from 'expo-router';
import { getPage } from '../../src/api/mockApi';
import { Sections } from '../../src/site/Blocks';
import { C, Loading, P, s, useLoad } from '../../src/ui';

const titleCase = (t: string) => (t === t.toUpperCase() ? t.toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase()) : t);

export default function Page() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { data, error } = useLoad(() => getPage(id), [id]);
  if (error) return <View style={s.center}><P>Page not found.</P></View>;
  if (!data) return <Loading />;
  return (
    <ScrollView style={s.screen} contentContainerStyle={s.pad}>
      <Stack.Screen options={{ title: titleCase(data.page.title) }} />
      <Sections sections={data.sections} />
      <Text style={{ color: C.primary, fontWeight: '600', marginTop: 8 }} onPress={() => Linking.openURL(data.page.sourceUrl)}>View on khroyals.com ›</Text>
    </ScrollView>
  );
}
