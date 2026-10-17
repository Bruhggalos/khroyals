/**
 * Admin portal → Students (people.family): requests from parents, adding
 * children (no login), editing name/grade, and linking parents.
 */
import { useCallback, useEffect, useState } from 'react';
import { Alert, Platform, Text, View } from 'react-native';
import {
  adminCreateStudent, adminDecideFamilyRequest, adminDeleteStudent, adminFamilyRequests, adminLinkGuardian, adminListPeople,
  adminListStudents, adminUpdateStudent, type AdminFamilyRequest, type AdminPerson, type AdminStudent,
} from '../api/connect';
import { GradePicker } from '../comms/GradePicker';
import { gradeLabel } from '../comms/grades';
import { Button, C, Card, Chip, Field, H, Loading, P, s } from '../ui';

const PAGE = 20;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const fail = (e: any) => Alert.alert('Not allowed', e.message);
const confirm = (title: string, msg: string, onYes: () => void) => {
  if (Platform.OS === 'web') { if (globalThis.confirm?.(`${title}\n\n${msg}`)) onYes(); return; }
  Alert.alert(title, msg, [{ text: 'Cancel', style: 'cancel' }, { text: 'Yes', style: 'destructive', onPress: onYes }]);
};
const name = (p: { firstName: string; lastName: string }) => `${p.firstName} ${p.lastName}`.trim();

/** Search approved adults (anyone but students) to link as a parent. */
function AdultSearch({ label, onPick, exclude = [] }: { label: string; onPick: (p: AdminPerson) => void; exclude?: string[] }) {
  const [q, setQ] = useState('');
  const [hits, setHits] = useState<AdminPerson[]>([]);
  useEffect(() => {
    if (!q.trim()) { setHits([]); return; }
    const t = setTimeout(() => adminListPeople({ search: q, filter: 'all', limit: 8 })
      .then((r) => setHits(r.people.filter((p) => !p.pending && p.schoolRole !== 'student' && !exclude.includes(p.id)))).catch(() => {}), 300);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q]);
  return (
    <View style={{ gap: 6 }}>
      <Field label={label} placeholder="Search by name or email" autoCapitalize="none" value={q} onChangeText={setQ} />
      {hits.map((p) => (
        <Text key={p.id} style={{ color: C.primary }} onPress={() => { setQ(''); onPick(p); }}>+ {name(p)} <Text style={{ color: C.muted }}>· {p.schoolRole} · {p.email}</Text></Text>
      ))}
    </View>
  );
}

/** Search students (to link a request to a child the school already has). */
function StudentSearch({ label, onPick }: { label: string; onPick: (s: AdminStudent) => void }) {
  const [q, setQ] = useState('');
  const [hits, setHits] = useState<AdminStudent[]>([]);
  useEffect(() => {
    if (!q.trim()) { setHits([]); return; }
    const t = setTimeout(() => adminListStudents({ search: q, limit: 8 }).then((r) => setHits(r.students)).catch(() => {}), 300);
    return () => clearTimeout(t);
  }, [q]);
  return (
    <View style={{ gap: 6 }}>
      <Field label={label} placeholder="Search students" value={q} onChangeText={setQ} />
      {hits.map((x) => (
        <Text key={x.id} style={{ color: C.primary }} onPress={() => { setQ(''); onPick(x); }}>
          → {name(x)} <Text style={{ color: C.muted }}>· {gradeLabel(x.grade)}{x.parents.length ? ` · ${x.parents.map((p) => p.name).join(', ')}` : ''}</Text>
        </Text>
      ))}
    </View>
  );
}

function RequestCard({ r, onDone }: { r: AdminFamilyRequest; onDone: () => void }) {
  const [note, setNote] = useState('');
  const [linking, setLinking] = useState(false);
  const d = r.details;
  const decide = (approve: boolean, existing?: AdminStudent) =>
    adminDecideFamilyRequest(r.id, approve, { existingStudentId: existing?.id, note }).then(onDone).catch(fail);
  return (
    <Card style={{ borderColor: '#B45309' }}>
      <Text style={{ fontWeight: '700', color: C.ink }}>
        {r.kind === 'add_child' ? `Add ${d.firstName} ${d.lastName} · ${gradeLabel(d.grade)}`
          : `Change ${r.student ? name(r.student) : 'a student'} → ${d.firstName} ${d.lastName} · ${gradeLabel(d.grade)}`}
      </Text>
      <P muted>From {r.requestedBy.name} ({r.requestedBy.role}) · {new Date(r.createdAt).toLocaleDateString()}</P>
      {r.kind === 'edit_child' && r.student && <P muted>Now: {name(r.student)}, {gradeLabel(r.student.grade)}</P>}
      {!!d.birthday && <P muted>Birthday: {d.birthday}</P>}
      {!!d.note && <P>“{d.note}”</P>}
      <Field label="Note to the parent (optional)" value={note} onChangeText={setNote} />
      <View style={[s.row, { flexWrap: 'wrap' }]}>
        <View style={{ flex: 1, minWidth: 140 }}>
          <Button label={r.kind === 'add_child' ? 'Approve: new student' : 'Approve change'} onPress={() => decide(true)} />
        </View>
        <View style={{ flex: 1, minWidth: 100 }}><Button kind="ghost" label="Decline" onPress={() => decide(false)} /></View>
      </View>
      {r.kind === 'add_child' && (linking
        ? <StudentSearch label="Already a student? Link this parent to them" onPick={(x) => confirm('Link to existing student?',
            `${r.requestedBy.name} becomes a parent of ${name(x)} (no new student is created).`, () => decide(true, x))} />
        : <Text style={{ color: C.primary, fontWeight: '600' }} onPress={() => setLinking(true)}>Already a student? Link to them instead…</Text>)}
    </Card>
  );
}

function StudentCard({ x, onChange }: { x: AdminStudent; onChange: () => void }) {
  const [open, setOpen] = useState(false);
  const [first, setFirst] = useState(x.firstName);
  const [last, setLast] = useState(x.lastName);
  const [grade, setGrade] = useState<number | null>(x.grade);
  const changed = first.trim() !== x.firstName || last.trim() !== x.lastName || grade !== x.grade;
  return (
    <Card onPress={open ? undefined : () => setOpen(true)}>
      <View style={s.row}>
        <View style={{ flex: 1 }}>
          <Text style={{ fontWeight: '700', color: C.ink }}>{name(x)}</Text>
          <P muted>{gradeLabel(x.grade)}{x.classOf ? ` · Class of ${x.classOf}` : ''}</P>
          <P muted>{x.parents.length ? `Parents: ${x.parents.map((p) => p.name).join(', ')}` : 'No parents linked'}</P>
        </View>
        {x.managed ? <Chip label="No login" color={C.muted} /> : <Chip label="Has login" />}
      </View>
      {open && (
        <View style={{ gap: 10 }}>
          <View style={s.row}>
            <Field label="First name" value={first} onChangeText={setFirst} style={{ flex: 1, minWidth: 0 }} />
            <Field label="Last name" value={last} onChangeText={setLast} style={{ flex: 1, minWidth: 0 }} />
          </View>
          <GradePicker value={grade} onChange={setGrade} />
          <Button label="Save" disabled={!changed || !first.trim() || !last.trim() || grade === null}
            onPress={() => adminUpdateStudent(x.id, { firstName: first, lastName: last, grade: grade! }).then(onChange).catch(fail)} />
          <H>Parents</H>
          {x.parents.map((p) => (
            <Text key={p.id} style={{ color: C.ink }}>👪 {p.name}{'  '}
              <Text style={{ color: C.danger }} onPress={() => confirm('Unlink parent?', `${p.name} will no longer see ${x.firstName}.`,
                () => adminLinkGuardian(p.id, x.id, false).then(onChange).catch(fail))}>unlink</Text>
            </Text>
          ))}
          <AdultSearch label="Link a parent" exclude={x.parents.map((p) => p.id)}
            onPick={(p) => adminLinkGuardian(p.id, x.id, true).then(onChange).catch(fail)} />
          <View style={[s.row, { justifyContent: 'space-between' }]}>
            {x.managed ? (
              <Text style={{ color: C.danger, fontWeight: '600' }}
                onPress={() => confirm(`Remove ${x.firstName}?`, 'For students who have left the school. Their details, links and car line history are deleted.',
                  () => adminDeleteStudent(x.id).then(onChange).catch(fail))}>Remove student…</Text>
            ) : <View />}
            <Text style={{ color: C.muted }} onPress={() => setOpen(false)}>Close</Text>
          </View>
        </View>
      )}
    </Card>
  );
}

function AddStudent({ onDone }: { onDone: () => void }) {
  const [first, setFirst] = useState('');
  const [last, setLast] = useState('');
  const [grade, setGrade] = useState<number | null>(null);
  const [birthday, setBirthday] = useState('');
  const [parent, setParent] = useState<AdminPerson | null>(null);
  const save = () => {
    if (birthday && !DATE.test(birthday)) return Alert.alert('Birthday', 'Use the format YYYY-MM-DD.');
    adminCreateStudent({ firstName: first, lastName: last, grade: grade!, birthday: birthday || null, guardianId: parent?.id ?? null })
      .then(() => { Alert.alert('Added', `${first} is set up${parent ? ` and linked to ${name(parent)}` : ''}.`); onDone(); }).catch(fail);
  };
  return (
    <Card>
      <H>Add a student</H>
      <P muted>For children without their own login. Grades move up automatically every July 1.</P>
      <View style={s.row}>
        <Field label="First name" value={first} onChangeText={setFirst} style={{ flex: 1, minWidth: 0 }} />
        <Field label="Last name" value={last} onChangeText={setLast} style={{ flex: 1, minWidth: 0 }} />
      </View>
      <GradePicker value={grade} onChange={setGrade} label="Grade this school year" />
      <Field label="Birthday (optional)" placeholder="YYYY-MM-DD" keyboardType="numbers-and-punctuation" maxLength={10} value={birthday} onChangeText={setBirthday} />
      {parent
        ? <Text style={{ color: C.ink }}>👪 Parent: {name(parent)}  <Text style={{ color: C.danger }} onPress={() => setParent(null)}>change</Text></Text>
        : <AdultSearch label="Parent (optional; you can link more later)" onPick={setParent} />}
      <Button label="Add student" disabled={!first.trim() || !last.trim() || grade === null} onPress={save} />
    </Card>
  );
}

export function StudentsPanel() {
  const [requests, setRequests] = useState<AdminFamilyRequest[] | null>(null);
  const [q, setQ] = useState('');
  const [offset, setOffset] = useState(0);
  const [page, setPage] = useState<{ students: AdminStudent[]; total: number } | null>(null);
  const [adding, setAdding] = useState(false);
  const [reload, setReload] = useState(0);

  const loadRequests = useCallback(() => adminFamilyRequests().then(setRequests).catch((e) => { fail(e); setRequests([]); }), []);
  useEffect(() => { loadRequests(); }, [loadRequests, reload]);
  useEffect(() => setOffset(0), [q]);
  useEffect(() => {
    let live = true;
    const t = setTimeout(() => adminListStudents({ search: q, limit: PAGE, offset })
      .then((r) => live && setPage(r)).catch((e) => { if (live) { setPage({ students: [], total: 0 }); fail(e); } }), q ? 300 : 0);
    return () => { live = false; clearTimeout(t); };
  }, [q, offset, reload]);
  const changed = () => setReload((n) => n + 1);

  return (
    <>
      {requests && requests.length > 0 && (
        <>
          <Text style={{ fontWeight: '800', color: '#B45309' }}>{requests.length} request{requests.length > 1 ? 's' : ''} from parents</Text>
          {requests.map((r) => <RequestCard key={r.id} r={r} onDone={changed} />)}
        </>
      )}
      {adding ? <AddStudent onDone={() => { setAdding(false); changed(); }} />
        : <Button label="+ Add a student" onPress={() => setAdding(true)} />}
      <Field label="Search students" placeholder="Student or parent name" value={q} onChangeText={setQ} />
      {!page ? <Loading /> : (
        <>
          <P muted>{page.total === 0 ? 'No students match.' : `${page.total} student${page.total === 1 ? '' : 's'}`}</P>
          {page.students.map((x) => <StudentCard key={`${x.id}:${x.grade}:${x.parents.length}:${x.firstName}${x.lastName}`} x={x} onChange={changed} />)}
          {page.total > PAGE && (
            <View style={[s.row, { justifyContent: 'space-between' }]}>
              <Button label="‹ Previous" kind="ghost" disabled={offset === 0} onPress={() => setOffset(Math.max(0, offset - PAGE))} />
              <Text style={{ color: C.muted }}>{offset + 1}–{Math.min(offset + PAGE, page.total)} of {page.total}</Text>
              <Button label="Next ›" kind="ghost" disabled={offset + PAGE >= page.total} onPress={() => setOffset(offset + PAGE)} />
            </View>
          )}
        </>
      )}
    </>
  );
}
