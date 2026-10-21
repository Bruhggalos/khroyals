/**
 * My children: each linked child's photo, bio, birthday, allergies and health
 * notes (parents edit these directly), plus requests the school office
 * approves: adding a child, or changing a child's name or grade.
 */
import { useCallback, useState } from 'react';
import { Alert, Platform, ScrollView, Text, View } from 'react-native';
import { Stack, useFocusEffect } from 'expo-router';
import {
  cancelFamilyRequest, live, myChildProfiles, myFamilyRequests, removeChildPhoto, requestChild, requestChildEdit, session,
  updateChildDetails, uploadChildPhoto, type Child, type FamilyRequest, type Person,
} from '../src/api/connect';
import { GradePicker } from '../src/comms/GradePicker';
import { pickSquarePhoto } from '../src/photos';
import { gradeLabel } from '../src/comms/grades';
import { Avatar, Button, C, Card, Field, H, Loading, P, s } from '../src/ui';
import { DateField, birthdayMax, birthdayMin, birthdayStart } from '../src/forms/DateTimeField';

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const fail = (e: any) => Alert.alert('Something went wrong', e.message);

function ChildCard({ c, pending, onChange }: { c: Child; pending: FamilyRequest | undefined; onChange: () => void }) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [birthday, setBirthday] = useState(c.birthday ?? '');
  const [bio, setBio] = useState(c.bio);
  const [allergies, setAllergies] = useState(c.allergies);
  const [medical, setMedical] = useState(c.medicalNotes);
  const [edit, setEdit] = useState<{ first: string; last: string; grade: number | null; note: string } | null>(null);

  const step = async (fn: () => Promise<unknown>, done?: string) => {
    setBusy(true);
    try { await fn(); if (done) Alert.alert('Saved', done); onChange(); } catch (e) { fail(e); } finally { setBusy(false); }
  };
  const photo = (camera: boolean) => step(async () => {
    const b64 = await pickSquarePhoto(camera);
    if (b64) await uploadChildPhoto(c.id, b64, c.photoPath);
  });
  const save = () => {
    if (birthday && !DATE.test(birthday)) return Alert.alert('Birthday', 'Choose the birthday again.');
    step(() => updateChildDetails(c.id, { birthday: birthday || null, bio, allergies, medicalNotes: medical }), `${c.firstName}'s details are updated.`);
  };
  const sendEdit = () => edit && step(async () => {
    await requestChildEdit(c.id, { firstName: edit.first, lastName: edit.last, grade: edit.grade ?? c.grade ?? 0, note: edit.note });
    setEdit(null);
  }, 'The school office will review your request.');

  return (
    <Card>
      <View style={[s.row, { gap: 12 }]}>
        <Avatar person={{ firstName: c.firstName, lastName: c.lastName, avatar: c.photo }} size={64} />
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: 18, fontWeight: '800', color: C.ink }}>{c.firstName} {c.lastName}</Text>
          <P muted>{gradeLabel(c.grade)}{c.classOf ? ` · Class of ${c.classOf}` : ''}</P>
          {!!c.pickupNumber && <Text style={{ color: C.primary, fontWeight: '800' }}>🚗 Pickup #{c.pickupNumber}</Text>}
          {c.parents.length > 1 && <P muted>Parents: {c.parents.join(', ')}</P>}
        </View>
      </View>
      {!!c.allergies && <Text style={{ color: C.danger, fontWeight: '600' }}>⚠️ Allergies: {c.allergies}</Text>}
      {pending && <P muted>⏳ Waiting for the office to approve: {pending.details.firstName} {pending.details.lastName}, {gradeLabel(pending.details.grade)}</P>}
      <Text style={{ color: C.primary, fontWeight: '700' }} onPress={() => setOpen(!open)}>{open ? 'Close' : `Edit ${c.firstName}'s details`}</Text>
      {open && (
        <View style={{ gap: 10 }}>
          <View style={[s.row, { flexWrap: 'wrap', gap: 16 }]}>
            {Platform.OS !== 'web' && <Text style={{ color: C.primary, fontWeight: '700' }} onPress={() => photo(true)}>Take photo</Text>}
            <Text style={{ color: C.primary, fontWeight: '700' }} onPress={() => photo(false)}>{c.photo ? 'Change photo' : 'Add a photo'}</Text>
            {!!c.photoPath && <Text style={{ color: C.danger, fontWeight: '600' }} onPress={() => step(() => removeChildPhoto(c.id, c.photoPath))}>Remove photo</Text>}
          </View>
          <DateField label="Birthday" optional value={birthday} onChange={setBirthday} min={birthdayMin()} max={birthdayMax()} initial={birthdayStart()} />
          <Field label="About" placeholder="Interests, favorite subjects…" multiline maxLength={500} value={bio} onChangeText={setBio} style={{ minHeight: 70 }} />
          <Field label="Allergies" placeholder="e.g. Peanuts, bee stings" maxLength={500} value={allergies} onChangeText={setAllergies} />
          <Field label="Health notes for the school" placeholder="Medications, conditions staff should know about" multiline maxLength={1000}
            value={medical} onChangeText={setMedical} style={{ minHeight: 70 }}
            hint="Only you, the child's other parents and school staff can see allergies and health notes." />
          <Button label={busy ? 'Saving…' : 'Save details'} disabled={busy} onPress={save} />
          {edit ? (
            <View style={{ gap: 8, borderTopWidth: 1, borderTopColor: C.line, paddingTop: 10 }}>
              <H>Ask the office to change name or grade</H>
              <View style={s.row}>
                <Field label="First name" value={edit.first} onChangeText={(first) => setEdit({ ...edit, first })} style={{ flex: 1, minWidth: 0 }} />
                <Field label="Last name" value={edit.last} onChangeText={(last) => setEdit({ ...edit, last })} style={{ flex: 1, minWidth: 0 }} />
              </View>
              <GradePicker value={edit.grade} onChange={(grade) => setEdit({ ...edit, grade })} />
              <Field label="Note for the office (optional)" value={edit.note} onChangeText={(note) => setEdit({ ...edit, note })} />
              <Button label="Send request" disabled={busy || !edit.first.trim() || !edit.last.trim()} onPress={sendEdit} />
              <Text style={{ color: C.muted }} onPress={() => setEdit(null)}>Cancel</Text>
            </View>
          ) : (
            <Text style={{ color: C.primary, fontWeight: '600' }}
              onPress={() => setEdit({ first: c.firstName, last: c.lastName, grade: c.grade, note: '' })}>
              Change name or grade… (the office approves)
            </Text>
          )}
        </View>
      )}
    </Card>
  );
}

function AddChild({ onDone }: { onDone: () => void }) {
  const [first, setFirst] = useState('');
  const [last, setLast] = useState('');
  const [grade, setGrade] = useState<number | null>(null);
  const [birthday, setBirthday] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const send = async () => {
    if (birthday && !DATE.test(birthday)) return Alert.alert('Birthday', 'Choose the birthday again.');
    setBusy(true);
    try {
      await requestChild({ firstName: first, lastName: last, grade: grade!, birthday: birthday || null, note });
      Alert.alert('Request sent', 'The school office will confirm and link your child to your account.');
      onDone();
    } catch (e) { fail(e); } finally { setBusy(false); }
  };
  return (
    <Card>
      <H>Add a child</H>
      <P muted>Children must be students at Kingdom Heights. The school office confirms each one.</P>
      <View style={s.row}>
        <Field label="First name" autoComplete="off" value={first} onChangeText={setFirst} style={{ flex: 1, minWidth: 0 }} />
        <Field label="Last name" autoComplete="off" value={last} onChangeText={setLast} style={{ flex: 1, minWidth: 0 }} />
      </View>
      <GradePicker value={grade} onChange={setGrade} label="Grade this school year" />
      <DateField label="Birthday (optional)" optional value={birthday} onChange={setBirthday} min={birthdayMin()} max={birthdayMax()} initial={birthdayStart()} />
      <Field label="Note for the office (optional)" placeholder="e.g. Already enrolled; other parent is …" value={note} onChangeText={setNote} />
      <Button label={busy ? 'Sending…' : 'Send to the office'} disabled={busy || !first.trim() || !last.trim() || grade === null} onPress={send} />
    </Card>
  );
}

export default function Children() {
  const [person, setPerson] = useState<Person | null | undefined>(undefined);
  const [kids, setKids] = useState<Child[] | null>(null);
  const [requests, setRequests] = useState<FamilyRequest[]>([]);
  const [adding, setAdding] = useState(false);
  const load = useCallback(async () => {
    try {
      const p = await session();
      setPerson(p);
      if (!p || p.pending) return setKids([]);
      const [k, r] = await Promise.all([myChildProfiles(), myFamilyRequests()]);
      setKids(k); setRequests(r);
    } catch (e) { fail(e); setKids([]); }
  }, []);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  const header = <Stack.Screen options={{ title: 'My children' }} />;
  if (!live) return <View style={[s.screen, s.pad]}>{header}<P muted>Needs the school's Royals Connect account.</P></View>;
  if (person === undefined || !kids) return <>{header}<Loading /></>;
  if (person?.schoolRole === 'family') {
    return <View style={[s.screen, s.pad]}>{header}<Card><P>Family accounts don't manage children. The school office links the children you pick up; ask them to add or remove one.</P></Card></View>;
  }
  if (!person || person.pending || person.schoolRole === 'student') {
    return <View style={[s.screen, s.pad]}>{header}<Card><P>Log in with an approved parent or staff account to manage your children.</P></Card></View>;
  }
  const newKids = requests.filter((r) => r.kind === 'add_child');

  return (
    <ScrollView style={s.screen} contentContainerStyle={s.pad} keyboardShouldPersistTaps="handled">
      {header}
      {kids.length === 0 && newKids.length === 0 && <P muted>No children are linked to your account yet. Add yours below, or ask the school office to link them.</P>}
      {kids.map((c) => <ChildCard key={c.id} c={c} pending={requests.find((r) => r.kind === 'edit_child' && r.studentId === c.id)} onChange={load} />)}
      {newKids.map((r) => (
        <Card key={r.id}>
          <Text style={{ fontWeight: '700', color: C.ink }}>{r.details.firstName} {r.details.lastName}</Text>
          <P muted>{gradeLabel(r.details.grade)} · ⏳ Waiting for the school office</P>
          <Text style={{ color: C.danger }} onPress={() => cancelFamilyRequest(r.id).then(load).catch(fail)}>Cancel request</Text>
        </Card>
      ))}
      {adding ? <AddChild onDone={() => { setAdding(false); load(); }} />
        : <Button kind="ghost" label="+ Add a child" onPress={() => setAdding(true)} />}
    </ScrollView>
  );
}
