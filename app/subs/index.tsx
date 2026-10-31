/**
 * Substitutes, for teachers (their classes) and the office (subs.manage: every class): the sub days
 * coming up and today, who's covering which classes and when, with the sub plans. Tap one to change
 * or cancel it; "+ Schedule a sub" adds one. The sub is notified either way.
 */
import { useCallback, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, Text, View } from 'react-native';
import { Stack, router, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { errorText, subSchedule, type SubDay } from '../../src/api/connect';
import { classList, subWhen } from '../../src/subs/labels';
import { Button, C, Card, Loading, P, s } from '../../src/ui';

const GREEN = '#15803D';

export default function Substitutes() {
  const [days, setDays] = useState<SubDay[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const load = useCallback(() => { subSchedule().then((d) => { setDays(d); setError(null); }).catch((e) => setError(errorText(e))); }, []);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  const header = <Stack.Screen options={{ title: 'Substitutes' }} />;
  if (error && !days) return <View style={[s.screen, s.pad]}>{header}<Card><P>{error}</P></Card></View>;
  if (!days) return <>{header}<Loading /></>;

  return (
    <ScrollView style={s.screen} contentContainerStyle={s.pad} refreshControl={<RefreshControl refreshing={false} onRefresh={load} />}>
      {header}
      <Button label="+ Schedule a sub" onPress={() => router.push('/subs/new')} />
      <P muted>A sub sees the class, takes its roll and reads your sub plans only during the days and hours you set. They get a notification when you schedule, change or cancel.</P>
      {days.length === 0 && <P muted>No sub days coming up.</P>}
      {days.map((d) => (
        <Pressable key={d.id} onPress={() => router.push({ pathname: '/subs/new', params: { id: d.id } })} accessibilityRole="button"
          style={({ pressed }) => [{ padding: 14, borderRadius: 14, backgroundColor: '#fff', borderWidth: 1, borderColor: d.onDuty ? GREEN : C.line, gap: 4 },
            pressed && { opacity: 0.85 }]}>
          <View style={[s.row, { gap: 8 }]}>
            <Ionicons name="person-circle-outline" size={22} color={C.primary} />
            <Text style={{ flex: 1, fontSize: 16, fontWeight: '800', color: C.ink }}>{d.substitute}</Text>
            {d.onDuty && <Text style={{ color: GREEN, fontWeight: '800', fontSize: 12 }}>ON DUTY</Text>}
            <Ionicons name="chevron-forward" size={18} color={C.muted} />
          </View>
          <Text style={{ color: C.primary, fontWeight: '700' }}>{subWhen(d)}</Text>
          <Text style={{ color: C.ink }}>{classList(d)}</Text>
          {!!d.plans && <Text numberOfLines={2} style={{ color: C.muted }}>{d.plans}</Text>}
        </Pressable>
      ))}
    </ScrollView>
  );
}
