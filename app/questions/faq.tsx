/** The school's F.A.Q.s (from the khroyals.com home page), in Ask the School. Open to everyone, signed in or not. */
import { ScrollView, Text, View } from 'react-native';
import { Stack, router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { getHome } from '../../src/api/mockApi';
import { faqSection } from '../../src/site/faq';
import { SectionView } from '../../src/site/Blocks';
import { Button, C, Card, Loading, P, s, useLoad } from '../../src/ui';

export default function Faq() {
  const { data } = useLoad(getHome);
  const header = <Stack.Screen options={{ title: 'F.A.Q.s' }} />;
  if (!data) return <>{header}<Loading /></>;
  const faq = faqSection(data.sections);

  return (
    <ScrollView style={s.screen} contentContainerStyle={[s.pad, { gap: 16 }]}>
      {header}
      {faq ? <SectionView section={faq} /> : <Card><P muted>There are no F.A.Q.s right now.</P></Card>}
      <Card style={{ gap: 10 }}>
        <View style={s.row}>
          <Ionicons name="chatbubble-ellipses-outline" size={22} color={C.primary} />
          <Text style={{ flex: 1, fontSize: 16, fontWeight: '800', color: C.ink }}>Still have a question?</Text>
        </View>
        <P muted>Ask the school, and the answer comes back to you here.</P>
        <Button label="Ask a question" onPress={() => router.push('/questions/new')} />
      </Card>
    </ScrollView>
  );
}
