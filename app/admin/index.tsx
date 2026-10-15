/**
 * Admin console (school admins only; the database enforces it too):
 * approve sign-ups, set roles and grades, link parents to students, review the audit log.
 * Groups and calendars are managed from the Connect and Calendar tabs.
 */
import { useCallback, useEffect, useState } from 'react';
import { Alert, ScrollView, Text, TextInput, View } from 'react-native';
import { Stack } from 'expo-router';
import {
  adminGuardianLinks, adminLinkGuardian, adminListPeople, adminUpdateProfile, listAudit, me, type Person,
} from '../../src/api/connect';
import type { SchoolRole } from '../../src/comms/types';
import { C, Card, Chip, Loading, P, s } from '../../src/ui';

const ROLES: SchoolRole[] = ['admin', 'teacher', 'staff', 'parent', 'student'];
const pill = (label: string, on: boolean, onPress: () => void, color = C.primary) => (
  <Text key={label} onPress={onPress} style={{ paddingHorizontal: 10, paddingVertical: 5, borderRadius: 999, overflow: 'hidden', borderWidth: 1,
    borderColor: C.line, backgroundColor: on ? color : '#fff', color: on ? '#fff' : C.ink }}>{label}</Text>
);

function PersonCard({ p, people, links, onChange }: {
  p: Person; people: Person[]; links: { guardianId: string; studentId: string }[]; onChange: () => void;
}) {
  const [open, setOpen] = useState(!!p.pending);
  const [grade, setGrade] = useState(p.grade ? String(p.grade) : '');
  const [q, setQ] = useState('');
  const fail = (e: any) => Alert.alert('Not allowed', e.message);
  const setRole = (r: SchoolRole | null) =>
    adminUpdateProfile(p.id, r, r === 'student' && grade ? Number(grade) : null).then(onChange).catch(fail);
  const children = links.filter((l) => l.guardianId === p.id).map((l) => people.find((x) => x.id === l.studentId)).filter(Boolean) as Person[];
  const parents = links.filter((l) => l.studentId === p.id).map((l) => people.find((x) => x.id === l.guardianId)).filter(Boolean) as Person[];
  const term = q.trim().toLowerCase();
  const students = term ? people.filter((x) => x.schoolRole === 'student' && `${x.firstName} ${x.lastName}`.toLowerCase().includes(term)).slice(0, 6) : [];

  return (
    <Card onPress={() => setOpen(!open)}>
      <View style={s.row}>
        <View style={{ flex: 1 }}>
          <Text style={{ fontWeight: '700', color: C.ink }}>{p.firstName || p.lastName ? `${p.firstName} ${p.lastName}` : '(no name)'}</Text>
          <P muted>{p.email}{p.grade ? ` · grade ${p.grade}` : ''}</P>
        </View>
        {p.pending ? <Chip label="Needs approval" color="#B45309" /> : <Chip label={p.schoolRole} />}
      </View>
      {(children.length > 0 || parents.length > 0) && (
        <P muted>{children.length ? `Parent of ${children.map((c) => c.firstName).join(', ')}` : `Parents: ${parents.map((c) => `${c.firstName} ${c.lastName}`).join(', ')}`}</P>
      )}
      {open && (
        <View style={{ gap: 8 }}>
          <View style={[s.row, { flexWrap: 'wrap' }]}>
            {ROLES.map((r) => pill(r, p.schoolRole === r && !p.pending, () => setRole(r)))}
            {!p.pending && p.id !== me()?.id && pill('revoke access', false, () => setRole(null), C.danger)}
          </View>
          {p.schoolRole === 'student' && (
            <View style={s.row}>
              <TextInput style={[s.input, { flex: 1, padding: 8 }]} placeholder="Grade (K2 = -2 … 12)" keyboardType="numbers-and-punctuation" value={grade} onChangeText={setGrade} />
              <Text style={{ color: C.primary, fontWeight: '700' }} onPress={() => setRole('student')}>Save grade</Text>
            </View>
          )}
          {p.schoolRole === 'parent' && (
            <View style={{ gap: 6 }}>
              {children.map((c) => (
                <Text key={c.id} style={{ color: C.ink }}>👪 {c.firstName} {c.lastName}{'  '}
                  <Text style={{ color: C.danger }} onPress={() => adminLinkGuardian(p.id, c.id, false).then(onChange).catch(fail)}>unlink</Text>
                </Text>
              ))}
              <TextInput style={[s.input, { padding: 8 }]} placeholder="Link a student: search by name" value={q} onChangeText={setQ} />
              {students.map((x) => (
                <Text key={x.id} style={{ color: C.primary }} onPress={() => { setQ(''); adminLinkGuardian(p.id, x.id).then(onChange).catch(fail); }}>
                  + {x.firstName} {x.lastName} (grade {x.grade ?? '?'})
                </Text>
              ))}
              <P muted>Linked parents join their student's family groups automatically.</P>
            </View>
          )}
        </View>
      )}
    </Card>
  );
}

export default function Admin() {
  const [tab, setTab] = useState<'people' | 'audit'>('people');
  const [people, setPeople] = useState<Person[] | null>(null);
  const [links, setLinks] = useState<{ guardianId: string; studentId: string }[]>([]);
  const [audit, setAudit] = useState<any[]>([]);
  const [q, setQ] = useState('');

  const load = useCallback(async () => {
    try {
      const [p, l, a] = await Promise.all([adminListPeople(), adminGuardianLinks(), listAudit()]);
      setPeople(p); setLinks(l); setAudit(a);
    } catch (e: any) { Alert.alert('Admin console', e.message); setPeople([]); }
  }, []);
  useEffect(() => { load(); }, [load]);
  if (!people) return <Loading />;

  const term = q.trim().toLowerCase();
  const shown = people.filter((p) => !term || `${p.firstName} ${p.lastName} ${p.email} ${p.schoolRole}`.toLowerCase().includes(term));
  const pending = shown.filter((p) => p.pending);
  const name = (id: string) => { const p = people.find((x) => x.id === id); return p ? `${p.firstName} ${p.lastName}` : 'someone'; };

  return (
    <ScrollView style={s.screen} contentContainerStyle={s.pad} keyboardShouldPersistTaps="handled">
      <Stack.Screen options={{ title: 'Admin console' }} />
      <View style={s.row}>{pill(`People (${people.length})`, tab === 'people', () => setTab('people'))}{pill('Activity log', tab === 'audit', () => setTab('audit'))}</View>
      {tab === 'people' ? (
        <>
          <TextInput style={s.input} placeholder="Search people" value={q} onChangeText={setQ} />
          {pending.length > 0 && <Text style={{ fontWeight: '800', color: '#B45309' }}>{pending.length} waiting for approval</Text>}
          {shown.map((p) => <PersonCard key={p.id} p={p} people={people} links={links} onChange={load} />)}
        </>
      ) : (
        audit.length === 0 ? <P muted>No activity yet.</P> : audit.map((a) => (
          <Card key={a.id}>
            <Text style={{ fontWeight: '700', color: C.ink }}>{a.action}</Text>
            <P muted>{name(a.actor_id)}{a.groups?.name ? ` · ${a.groups.name}` : ''} · {new Date(a.at).toLocaleString()}</P>
            {a.target_id && people.some((p) => p.id === a.target_id) && <P muted>→ {name(a.target_id)}</P>}
          </Card>
        ))
      )}
    </ScrollView>
  );
}
