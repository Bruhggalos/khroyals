/** Ask the School's way to the school's F.A.Q.s (app/questions/faq.tsx). */
import { Text, View } from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { C, Card, P } from '../ui';

export function FaqLink() {
  return (
    <Card onPress={() => router.push('/questions/faq')} style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
      <Ionicons name="help-circle-outline" size={30} color={C.primary} />
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={{ fontSize: 16, fontWeight: '800', color: C.ink }}>F.A.Q.s</Text>
        <P muted>Quick answers about admissions, tuition, school hours and more.</P>
      </View>
      <Ionicons name="chevron-forward" size={20} color={C.primary} />
    </Card>
  );
}
