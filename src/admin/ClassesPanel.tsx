/**
 * Classes in the admin portal (people.family): the class sections ("English 10 – Period
 * 3"), each with its teacher and students. They decide who students can message in Ask
 * the Teacher and who gets a class's assignments. A section's teacher can also add and
 * remove its students.
 */
import { useCallback, useEffect, useState } from 'react';
import { Alert, Text, View } from 'react-native';
import {
  adminDeleteSection, adminListPeople, adminListSections, adminSaveSection, adminSectionMember, adminSectionStudents, adminListStudents,
  type AdminPerson, type AdminSection, type AdminStudent, type SectionStudent,
} from '../api/connect';
import { gradeLabel } from '../comms/grades';
import { Button, C, Card, Chip, Field, H, Loading, P, ask, s } from '../ui';

const fail = (e: any) => Alert.alert('Not allowed', e.message);
const name = (p: { firstName: string; lastName: string }) => `${p.firstName} ${p.lastName}`.trim();

/** Search teachers and staff, to lead a class. */
function TeacherSearch({ onPick }: { onPick: (p: AdminPerson) => void }) {
  const [q, setQ] = useState('');
  const [hits, setHits] = useState<AdminPerson[]>([]);
  useEffect(() => {
    if (!q.trim()) { setHits([]); return; }
    const t = setTimeout(() => adminListPeople({ search: q, filter: 'staff', limit: 8 }).then((r) => setHits(r.people)).catch(() => {}), 300);
    return () => clearTimeout(t);
  }, [q]);
  return (
    <View style={{ gap: 6 }}>
      <Field label="Teacher" placeholder="Search teachers and staff" value={q} onChangeText={setQ} />
      {hits.map((p) => <Text key={p.id} style={{ color: C.primary }} onPress={() => { setQ(''); onPick(p); }}>→ {name(p)}</Text>)}
    </View>
  );
}

/** Search students, to add to a class. */
function StudentSearch({ exclude, onPick }: { exclude: string[]; onPick: (x: AdminStudent) => void }) {
  const [q, setQ] = useState('');
  const [hits, setHits] = useState<AdminStudent[]>([]);
  useEffect(() => {
    if (!q.trim()) { setHits([]); return; }
    const t = setTimeout(() => adminListStudents({ search: q, limit: 8 }).then((r) => setHits(r.students.filter((x) => !exclude.includes(x.id)))).catch(() => {}), 300);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q]);
  return (
    <View style={{ gap: 6 }}>
      <Field label="Add a student" placeholder="Search students" value={q} onChangeText={setQ} />
      {hits.map((x) => (
        <Text key={x.id} style={{ color: C.primary }} onPress={() => { setQ(''); onPick(x); }}>+ {name(x)} <Text style={{ color: C.muted }}>· {gradeLabel(x.grade)}</Text></Text>
      ))}
    </View>
  );
}

/** A new class: its name and teacher. */
function NewSection({ onDone }: { onDone: () => void }) {
  const [title, setTitle] = useState('');
  const [teacher, setTeacher] = useState<AdminPerson | null>(null);
  const [busy, setBusy] = useState(false);
  const save = () => {
    if (!title.trim()) return Alert.alert('Almost there', 'Name the class, like "English 10 – Period 3".');
    setBusy(true);
    adminSaveSection({ name: title.trim(), leadId: teacher?.id ?? null }).then(onDone).catch(fail).finally(() => setBusy(false));
  };
  return (
    <Card style={{ gap: 10 }}>
      <H>New class</H>
      <Field label="Class name" placeholder="e.g. English 10 – Period 3" value={title} onChangeText={setTitle} maxLength={80} />
      {teacher ? <P>Teacher: <Text style={{ fontWeight: '700' }}>{name(teacher)}</Text> <Text style={{ color: C.primary }} onPress={() => setTeacher(null)}>Change</Text></P>
        : <TeacherSearch onPick={setTeacher} />}
      <View style={s.row}>
        <View style={{ flex: 1 }}><Button label={busy ? 'Saving…' : 'Add class'} disabled={busy} onPress={save} /></View>
        <View style={{ flex: 1 }}><Button kind="ghost" label="Cancel" onPress={onDone} /></View>
      </View>
    </Card>
  );
}

/** One class: rename it, change its teacher, add and remove students, or remove it. */
function SectionCard({ sec, onChange }: { sec: AdminSection; onChange: () => void }) {
  const [open, setOpen] = useState(false);
  const [students, setStudents] = useState<SectionStudent[] | null>(null);
  const [title, setTitle] = useState(sec.name);
  const [changingTeacher, setChangingTeacher] = useState(false);
  const load = useCallback(() => adminSectionStudents(sec.id).then(setStudents).catch((e) => { fail(e); setStudents([]); }), [sec.id]);
  useEffect(() => { if (open) load(); }, [open, load]);
  const save = (patch: { name?: string; leadId?: string | null }) =>
    adminSaveSection({ id: sec.id, name: patch.name ?? sec.name, leadId: patch.leadId !== undefined ? patch.leadId : sec.leadId }).then(onChange).catch(fail);
  const member = (id: string, add: boolean) => adminSectionMember(sec.id, id, add).then(() => { load(); onChange(); }).catch(fail);

  return (
    <Card style={{ gap: 8 }} onPress={open ? undefined : () => setOpen(true)}>
      <View style={s.row}>
        <View style={{ flex: 1, gap: 2 }}>
          <Text style={{ fontSize: 16, fontWeight: '800', color: C.ink }}>{sec.name}</Text>
          <P muted>{sec.leadName ? `Taught by ${sec.leadName}` : 'No teacher yet'} · {sec.students} student{sec.students === 1 ? '' : 's'}</P>
        </View>
        <Text style={{ color: C.primary, fontWeight: '700' }} onPress={() => setOpen(!open)}>{open ? 'Done' : 'Edit'}</Text>
      </View>
      {open && (
        <View style={{ gap: 10 }}>
          <View style={[s.row, { alignItems: 'flex-end' }]}>
            <Field label="Class name" value={title} onChangeText={setTitle} maxLength={80} style={{ flex: 1 }} />
            {title.trim() !== sec.name && !!title.trim() && <Button label="Save" onPress={() => save({ name: title.trim() })} />}
          </View>
          {changingTeacher ? <TeacherSearch onPick={(p) => { setChangingTeacher(false); save({ leadId: p.id }); }} />
            : <Text style={{ color: C.primary, fontWeight: '700' }} onPress={() => setChangingTeacher(true)}>{sec.leadName ? 'Change the teacher' : 'Choose a teacher'}</Text>}
          {!students ? <Loading /> : (
            <View style={{ gap: 6 }}>
              {students.length === 0 && <P muted>No students yet.</P>}
              {students.map((x) => (
                <View key={x.id} style={s.row}>
                  <Text style={{ flex: 1, color: C.ink }}>{name(x)} <Text style={{ color: C.muted }}>· {gradeLabel(x.grade)}</Text></Text>
                  {!x.hasLogin && <Chip label="No login" color={C.muted} />}
                  <Text style={{ color: C.danger, fontWeight: '600' }} onPress={() => member(x.id, false)}>Remove</Text>
                </View>
              ))}
              <StudentSearch exclude={students.map((x) => x.id)} onPick={(x) => member(x.id, true)} />
            </View>
          )}
          <Text style={{ color: C.danger, fontWeight: '600' }}
            onPress={() => ask('Remove this class?', `${sec.name} and its assignments go away. Conversations with its teacher stay.`, 'Remove',
              () => adminDeleteSection(sec.id).then(onChange).catch(fail))}>
            Remove this class
          </Text>
        </View>
      )}
    </Card>
  );
}

export function ClassesPanel() {
  const [sections, setSections] = useState<AdminSection[] | null>(null);
  const [adding, setAdding] = useState(false);
  const load = useCallback(() => adminListSections().then(setSections).catch((e) => { fail(e); setSections([]); }), []);
  useEffect(() => { load(); }, [load]);
  return (
    <>
      <P muted>Each class has a teacher and students. Students message the teachers of their classes in Ask the Teacher, and get their assignments.</P>
      {adding ? <NewSection onDone={() => { setAdding(false); load(); }} /> : <Button label="+ Add a class" onPress={() => setAdding(true)} />}
      {!sections ? <Loading /> : sections.length === 0 ? <Card><P muted>No classes yet.</P></Card>
        : sections.map((sec) => <SectionCard key={`${sec.id}:${sec.name}:${sec.leadId}:${sec.students}`} sec={sec} onChange={load} />)}
    </>
  );
}
