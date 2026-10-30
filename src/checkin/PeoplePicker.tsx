/**
 * Who's taking this child? Their pickup list (parents first, then family and approved pickup people),
 * one row each to pick from. Nobody else can be chosen: the database refuses anyone not on it.
 * Give it a `key` of the student's id when the student can change, so it starts fresh.
 */
import { useEffect, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { checkoutPeople, errorText, type CheckoutPerson } from '../api/connect';
import { RELATIONSHIPS } from '../carline/PickupPeople';
import { C, Loading, P } from '../ui';

const relationLabel = (r: string) => (
  r === 'mother' ? 'Mother' : r === 'father' ? 'Father' : r === 'parent' ? 'Parent' : r === 'family' ? 'Family'
    : RELATIONSHIPS.find(([k]) => k === r)?.[1] ?? 'Approved pickup'
);

export function PeoplePicker({ studentId, chosen, onChoose }: { studentId: string; chosen: string | null; onChoose: (p: CheckoutPerson) => void }) {
  const [people, setPeople] = useState<CheckoutPerson[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    checkoutPeople(studentId).then(setPeople).catch((e) => { setPeople([]); setError(errorText(e)); });
  }, [studentId]);

  if (!people) return <Loading />;
  if (error) return <P muted>{error}</P>;
  if (people.length === 0) return <P muted>{"No one is on this child's pickup list. Their parents or the office can add someone."}</P>;
  return (
    <View style={{ gap: 6 }}>
      {people.map((p) => {
        const on = chosen === p.id;
        return (
          <Pressable key={p.id} onPress={() => onChoose(p)} accessibilityRole="radio" accessibilityState={{ checked: on }}
            style={{ flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12, borderRadius: 12, borderWidth: 1,
              borderColor: on ? C.primary : C.line, backgroundColor: on ? C.primary + '12' : '#fff' }}>
            <Ionicons name={on ? 'radio-button-on' : 'radio-button-off'} size={20} color={on ? C.primary : C.muted} />
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 16, fontWeight: '700', color: C.ink }}>{p.name}</Text>
              <Text style={{ fontSize: 13, color: C.muted }}>{relationLabel(p.relation)}</Text>
            </View>
          </Pressable>
        );
      })}
    </View>
  );
}
