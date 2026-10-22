/**
 * Who can pick a child up: the parents (mother and father), Family links from
 * the office, and approved pickup people. A child's parents and the office add
 * approved people by the email of their Royals Connect account, for today, until
 * a date, or until removed.
 */
import { useCallback, useEffect, useState } from 'react';
import { Alert, Platform, Text, View } from 'react-native';
import {
  addPickupPerson, adminSetParentRelation, childPickupPeople, removePickupPerson,
  type ChildPickupPeople, type ParentRelation, type PickupRelationship,
} from '../api/connect';
import { DateField, dateLabel, toDateString } from '../forms/DateTimeField';
import { Button, C, Field, H, P, s } from '../ui';

export const RELATIONSHIPS: [PickupRelationship, string][] = [
  ['grandparent', 'Grandparent'], ['aunt_uncle', 'Aunt or uncle'], ['sibling', 'Older sibling'], ['stepparent', 'Stepparent'],
  ['family_friend', 'Family friend'], ['nanny', 'Nanny or sitter'], ['carpool', 'Carpool'], ['other', 'Other'],
];
type Span = 'today' | 'until' | 'ongoing';

const pill = (label: string, on: boolean, onPress: () => void) => (
  <Text key={label} onPress={onPress} accessibilityRole="button" accessibilityState={{ selected: on }}
    style={{ paddingHorizontal: 10, paddingVertical: 6, borderRadius: 999, overflow: 'hidden', borderWidth: 1, borderColor: on ? C.primary : C.line,
      backgroundColor: on ? C.primary : '#fff', color: on ? '#fff' : C.ink, fontSize: 13, fontWeight: '600' }}>{label}</Text>
);
const ask = (title: string, msg: string, onYes: () => void) => {
  if (Platform.OS === 'web') { if (globalThis.confirm?.(`${title}\n\n${msg}`)) onYes(); return; }
  Alert.alert(title, msg, [{ text: 'Cancel', style: 'cancel' }, { text: 'Remove', style: 'destructive', onPress: onYes }]);
};
const fail = (e: any) => Alert.alert('Pickup', e.message);

export function PickupPeople({ studentId, childName, office = false }: { studentId: string; childName: string; office?: boolean }) {
  const [data, setData] = useState<ChildPickupPeople | null>(null);
  const [adding, setAdding] = useState(false);
  const [email, setEmail] = useState('');
  const [rel, setRel] = useState<PickupRelationship | null>(null);
  const [span, setSpan] = useState<Span>('today');
  const [until, setUntil] = useState('');
  const [busy, setBusy] = useState(false);
  const load = useCallback(() => childPickupPeople(studentId).then(setData).catch(fail), [studentId]);
  useEffect(() => { load(); }, [load]);

  const today = toDateString(new Date());
  const add = async () => {
    if (!rel) return Alert.alert('Pickup', 'Choose how they\'re related.');
    if (span === 'until' && !until) return Alert.alert('Pickup', 'Choose the last day they can pick up.');
    setBusy(true);
    try {
      const r = await addPickupPerson(studentId, email, rel, today, span === 'today' ? today : span === 'until' ? until : null);
      Alert.alert('Added', `${r.name} can pick up ${childName}${span === 'today' ? ' today' : span === 'until' ? ` until ${dateLabel(until)}` : ''}.`
        + (r.pending ? ' Their account is still waiting for school approval, so it starts once the office approves it.' : '')
        + ' They\'ve been notified.');
      setEmail(''); setRel(null); setSpan('today'); setUntil(''); setAdding(false); load();
    } catch (e) { fail(e); } finally { setBusy(false); }
  };
  const setRelation = (id: string, r: ParentRelation) => adminSetParentRelation(id, studentId, r).then(load).catch(fail);

  if (!data) return null;
  const when = (a: ChildPickupPeople['approved'][number]) =>
    a.endsOn === a.startsOn ? (a.startsOn === today ? 'Today only' : dateLabel(a.startsOn))
      : `${a.startsOn > today ? `From ${dateLabel(a.startsOn)}` : 'Now'}${a.endsOn ? ` until ${dateLabel(a.endsOn)}` : ', until removed'}`;

  return (
    <View style={{ gap: 8 }}>
      <H>Who can pick up {childName}</H>
      {data.parents.map((p) => (
        <View key={p.id} style={[s.row, { flexWrap: 'wrap' }]}>
          <Text style={{ color: C.ink }}>👪 {p.name} · {p.relation === 'mother' ? 'Mother' : p.relation === 'father' ? 'Father' : 'Parent'}</Text>
          {office && !p.relation && (
            <>
              <Text style={{ color: C.muted }}>Set:</Text>
              {pill('Mother', false, () => setRelation(p.id, 'mother'))}
              {pill('Father', false, () => setRelation(p.id, 'father'))}
            </>
          )}
        </View>
      ))}
      {data.family.map((f) => <Text key={f.id} style={{ color: C.ink }}>🚗 {f.name} · Family (linked by the office)</Text>)}
      {data.approved.map((a) => (
        <View key={a.id} style={[s.row, { alignItems: 'flex-start' }]}>
          <View style={{ flex: 1 }}>
            <Text style={{ color: C.ink }}>🚗 {a.name} · {a.label}{a.pending ? ' (account waiting for approval)' : ''}</Text>
            <Text style={{ color: C.muted, fontSize: 13 }}>{when(a)}{a.grantedBy ? ` · added by ${a.grantedBy}` : ''}</Text>
          </View>
          <Text style={{ color: C.danger, fontWeight: '600' }}
            onPress={() => ask(`Remove ${a.name}?`, `They won't be able to pick up ${childName} anymore.`,
              () => removePickupPerson(a.id).then(load).catch(fail))}>Remove</Text>
        </View>
      ))}
      {data.approved.length === 0 && data.family.length === 0 && <P muted>Only parents can pick up {childName} right now.</P>}

      {adding ? (
        <View style={{ gap: 8, borderTopWidth: 1, borderTopColor: C.line, paddingTop: 8 }}>
          <Field label="Their Royals Connect email" placeholder="name@example.com" autoCapitalize="none" keyboardType="email-address"
            autoComplete="email" value={email} onChangeText={setEmail}
            hint="They need their own account in the app. If they don't have one yet, ask them to download KH Royals and create one." />
          <Text style={{ fontSize: 13, fontWeight: '700', color: C.ink }}>How they're related</Text>
          <View style={[s.row, { flexWrap: 'wrap', gap: 6 }]}>{RELATIONSHIPS.map(([k, l]) => pill(l, rel === k, () => setRel(k)))}</View>
          <Text style={{ fontSize: 13, fontWeight: '700', color: C.ink }}>For how long</Text>
          <View style={[s.row, { flexWrap: 'wrap', gap: 6 }]}>
            {pill('Today only', span === 'today', () => setSpan('today'))}
            {pill('Until a date', span === 'until', () => setSpan('until'))}
            {pill('Until I remove them', span === 'ongoing', () => setSpan('ongoing'))}
          </View>
          {span === 'until' && <DateField label="Last day" value={until} onChange={setUntil} min={today} />}
          <Button label={busy ? 'Adding…' : 'Add'} disabled={busy || !email.includes('@') || !rel} onPress={add} />
          <Text style={{ color: C.muted }} onPress={() => setAdding(false)}>Cancel</Text>
        </View>
      ) : (
        <Text style={{ color: C.primary, fontWeight: '700' }} onPress={() => setAdding(true)} accessibilityRole="button">
          + Allow someone else to pick up {childName}
        </Text>
      )}
    </View>
  );
}
