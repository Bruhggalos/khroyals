/**
 * Admin portal — same screens on web, Android and iPhone.
 * What each admin sees follows their tier and permissions (the database
 * enforces the same rules), and the whole portal sits behind authenticator-app
 * verification (MfaGate).
 */
import { useCallback, useEffect, useState } from 'react';
import { Alert, Platform, ScrollView, Text, TextInput, View } from 'react-native';
import { Stack, router } from 'expo-router';
import {
  adminGuardianLinks, adminLinkGuardian, adminListPeopleWithAccess, adminSetAccess, adminSetCarlineDuty, adminSetVolunteerLead,
  adminUpdateProfile, getUser, listAudit,
  listMyGroups, listNotifications, listQuestions, me, permissionCatalog, sendNotification, subscribeQuestions, transferDirector,
  type Access, type AdminPerson, type Notice, type PermissionInfo, type SchoolQuestion,
} from '../../src/api/connect';
import { MfaGate } from '../../src/comms/MfaGate';
import { age, ageColor, waiting } from '../../src/questions/format';
import type { Group, SchoolRole } from '../../src/comms/types';
import { Button, C, Card, Chip, H, Loading, P, s } from '../../src/ui';

const ROLES: SchoolRole[] = ['admin', 'teacher', 'staff', 'parent', 'student'];
const TIERS = [
  { key: null, label: 'No admin access' },
  { key: 'office', label: 'Office' },
  { key: 'administrator', label: 'Administrator' },
] as const;
const TIER_LABEL: Record<string, string> = { director: 'Director', administrator: 'Administrator', office: 'Office' };

const pill = (label: string, on: boolean, onPress: () => void, color = C.primary) => (
  <Text key={label} onPress={onPress} style={{ paddingHorizontal: 10, paddingVertical: 5, borderRadius: 999, overflow: 'hidden', borderWidth: 1,
    borderColor: C.line, backgroundColor: on ? color : '#fff', color: on ? '#fff' : C.ink }}>{label}</Text>
);
const confirm = (title: string, msg: string, onYes: () => void) => {
  if (Platform.OS === 'web') { if (globalThis.confirm?.(`${title}\n\n${msg}`)) onYes(); return; }
  Alert.alert(title, msg, [{ text: 'Cancel', style: 'cancel' }, { text: 'Yes', style: 'destructive', onPress: onYes }]);
};
const fail = (e: any) => Alert.alert('Not allowed', e.message);

// ------------------------------------------------------------------ people

function PersonCard({ p, people, links, access, onChange }: {
  p: AdminPerson; people: AdminPerson[]; links: { guardianId: string; studentId: string }[]; access: Access; onChange: () => void;
}) {
  const [open, setOpen] = useState(!!p.pending);
  const [grade, setGrade] = useState(p.grade != null ? String(p.grade) : '');
  const [q, setQ] = useState('');
  const can = (x: string) => access.permissions.includes(x);
  const isAdminAccount = !!p.adminTier || p.schoolRole === 'admin';
  const roleOptions = ROLES.filter((r) => {
    if (r === 'admin' || isAdminAccount) return can('admins.manage');
    if (p.pending && (r === 'parent' || r === 'student')) return can('people.approve') || can('people.roles');
    return can('people.roles');
  });
  const setRole = (r: SchoolRole | null) =>
    adminUpdateProfile(p.id, r, r === 'student' && grade !== '' ? Number(grade) : p.grade ?? null).then(onChange).catch(fail);
  const children = links.filter((l) => l.guardianId === p.id).map((l) => people.find((x) => x.id === l.studentId)).filter(Boolean) as AdminPerson[];
  const parents = links.filter((l) => l.studentId === p.id).map((l) => people.find((x) => x.id === l.guardianId)).filter(Boolean) as AdminPerson[];
  const term = q.trim().toLowerCase();
  const students = term ? people.filter((x) => x.schoolRole === 'student' && `${x.firstName} ${x.lastName}`.toLowerCase().includes(term)).slice(0, 6) : [];

  return (
    <Card onPress={() => setOpen(!open)}>
      <View style={s.row}>
        <View style={{ flex: 1 }}>
          <Text style={{ fontWeight: '700', color: C.ink }}>{p.firstName || p.lastName ? `${p.firstName} ${p.lastName}` : '(no name yet)'}</Text>
          <P muted>{p.email}{p.grade != null ? ` · grade ${p.grade}` : ''}</P>
        </View>
        {p.adminTier && <Chip label={TIER_LABEL[p.adminTier]} color={C.accent} />}
        {p.carlineDuty && <Chip label="Car line" color="#15803D" />}
        {p.volunteerLead && <Chip label="Volunteer lead" color="#DB2777" />}
        {p.pending ? <Chip label="Needs approval" color="#B45309" /> : <Chip label={p.schoolRole} />}
      </View>
      {(children.length > 0 || parents.length > 0) && (
        <P muted>{children.length ? `Parent of ${children.map((c) => c.firstName).join(', ')}` : `Parents: ${parents.map((c) => `${c.firstName} ${c.lastName}`).join(', ')}`}</P>
      )}
      {open && (
        <View style={{ gap: 8 }}>
          {roleOptions.length > 0 && p.adminTier !== 'director' && (
            <View style={[s.row, { flexWrap: 'wrap' }]}>
              {roleOptions.map((r) => pill(r, p.schoolRole === r && !p.pending, () => setRole(r)))}
              {!p.pending && p.id !== me()?.id && pill('revoke access', false, () => confirm('Revoke access?', `${p.firstName} will lose access to Royals Connect.`, () => setRole(null)), C.danger)}
            </View>
          )}
          {!p.pending && ['admin', 'teacher', 'staff'].includes(p.schoolRole) && can('people.family') && (
            <View style={[s.row, { flexWrap: 'wrap' }]}>
              {pill(p.carlineDuty ? '🚗 On car line duty' : '🚗 Put on car line duty', !!p.carlineDuty,
                () => adminSetCarlineDuty(p.id, !p.carlineDuty).then(onChange).catch(fail), '#15803D')}
            </View>
          )}
          {!p.pending && p.schoolRole !== 'student' && can('people.family') && (
            <View style={[s.row, { flexWrap: 'wrap' }]}>
              {pill(p.volunteerLead ? '🙋 Volunteer Leader' : '🙋 Make Volunteer Leader', !!p.volunteerLead,
                () => adminSetVolunteerLead(p.id, !p.volunteerLead).then(onChange).catch(fail), '#DB2777')}
            </View>
          )}
          {p.schoolRole === 'student' && can('people.family') && (
            <View style={s.row}>
              <TextInput style={[s.input, { flex: 1, padding: 8 }]} placeholder="Grade (K2 = -2 … 12)" keyboardType="numbers-and-punctuation" value={grade} onChangeText={setGrade} />
              <Text style={{ color: C.primary, fontWeight: '700' }} onPress={() => setRole('student')}>Save grade</Text>
            </View>
          )}
          {p.schoolRole === 'parent' && can('people.family') && (
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

// ------------------------------------------------------------------ admins & permissions (director)

function AccessCard({ p, catalog, onChange }: { p: AdminPerson; catalog: PermissionInfo[]; onChange: () => void }) {
  const [open, setOpen] = useState(false);
  const [tier, setTier] = useState<Access['tier']>(p.adminTier);
  const [granted, setGranted] = useState<string[]>(p.granted);
  const staff = ['admin', 'teacher', 'staff'].includes(p.schoolRole);
  const tierPerms = (t: Access['tier']) => (t === 'administrator' ? catalog.map((c) => c.key).filter((k) => k !== 'admins.manage')
    : t === 'office' ? ['people.view', 'people.approve', 'people.family', 'calendar.school', 'push.send', 'questions.manage', 'audit.view'] : []);
  const save = () => adminSetAccess(p.id, tier, granted).then(onChange).catch(fail);

  if (p.adminTier === 'director') {
    return (
      <Card>
        <View style={s.row}><Text style={{ flex: 1, fontWeight: '800', color: C.ink }}>{p.firstName} {p.lastName}</Text><Chip label="Director" color={C.accent} /></View>
        <P muted>The director has every permission and is the only one who manages admins.</P>
      </Card>
    );
  }
  return (
    <Card onPress={() => setOpen(!open)}>
      <View style={s.row}>
        <View style={{ flex: 1 }}>
          <Text style={{ fontWeight: '700', color: C.ink }}>{p.firstName} {p.lastName}</Text>
          <P muted>{p.schoolRole}{p.granted.length ? ` · +${p.granted.length} permission${p.granted.length > 1 ? 's' : ''}` : ''}</P>
        </View>
        {p.adminTier && <Chip label={TIER_LABEL[p.adminTier]} color={C.accent} />}
      </View>
      {open && (
        <View style={{ gap: 10 }}>
          {staff ? (
            <View style={[s.row, { flexWrap: 'wrap' }]}>{TIERS.map((t) => pill(t.label, tier === t.key, () => setTier(t.key)))}</View>
          ) : <P muted>Admin tiers are for staff accounts; you can still grant individual permissions.</P>}
          <Text style={{ fontSize: 12, fontWeight: '700', color: C.muted }}>PERMISSIONS</Text>
          {catalog.filter((c) => c.key !== 'admins.manage').map((c) => {
            const fromTier = tierPerms(tier).includes(c.key);
            const on = fromTier || granted.includes(c.key);
            return (
              <Text key={c.key} onPress={fromTier || p.schoolRole === 'student' ? undefined : () => setGranted(on ? granted.filter((g) => g !== c.key) : [...granted, c.key])}
                style={{ color: fromTier ? C.muted : C.ink }}>
                {on ? '☑' : '☐'} <Text style={{ fontWeight: '700' }}>{c.label}</Text>{fromTier ? ' (from tier)' : ''}{'\n'}
                <Text style={{ color: C.muted, fontSize: 13 }}>{c.description}</Text>
              </Text>
            );
          })}
          <Button label="Save access" onPress={save} />
          {staff && (
            <Text style={{ color: C.danger, fontWeight: '600' }}
              onPress={() => confirm('Transfer the director role?', `${p.firstName} ${p.lastName} becomes the director and you become an administrator.`,
                () => transferDirector(p.id).then(onChange).catch(fail))}>
              Make {p.firstName} the director…
            </Text>
          )}
        </View>
      )}
    </Card>
  );
}

// ------------------------------------------------------------------ notifications

function Notifications({ access }: { access: Access }) {
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [audience, setAudience] = useState<'everyone' | 'roles' | 'group'>('everyone');
  const [roles, setRoles] = useState<SchoolRole[]>(['parent']);
  const [groups, setGroups] = useState<Group[]>([]);
  const [groupId, setGroupId] = useState<string>();
  const [history, setHistory] = useState<Notice[] | null>(null);
  const load = useCallback(() => listNotifications(30).then(setHistory), []);
  useEffect(() => { load(); listMyGroups().then(setGroups); }, [load]);
  const canSend = access.permissions.includes('push.send');

  const send = () => confirm('Send notification?', `"${title}" goes to ${audience === 'everyone' ? 'everyone' : audience === 'roles' ? roles.join(', ') : groups.find((g) => g.id === groupId)?.name}.`,
    () => sendNotification(title, body, audience, { roles, groupId }).then(() => { setTitle(''); setBody(''); load(); }).catch(fail));

  return (
    <View style={{ gap: 12 }}>
      {canSend ? (
        <Card>
          <H>Send a push notification</H>
          <View style={[s.row, { flexWrap: 'wrap' }]}>
            {pill('Everyone', audience === 'everyone', () => setAudience('everyone'))}
            {pill('By role', audience === 'roles', () => setAudience('roles'))}
            {pill('A group', audience === 'group', () => setAudience('group'))}
          </View>
          {audience === 'roles' && (
            <View style={[s.row, { flexWrap: 'wrap' }]}>
              {(['parent', 'student', 'teacher', 'staff'] as SchoolRole[]).map((r) => pill(r, roles.includes(r), () => setRoles(roles.includes(r) ? roles.filter((x) => x !== r) : [...roles, r])))}
            </View>
          )}
          {audience === 'group' && (
            <View style={[s.row, { flexWrap: 'wrap' }]}>{groups.map((g) => pill(`${g.icon} ${g.name}`, g.id === groupId, () => setGroupId(g.id)))}</View>
          )}
          <TextInput style={s.input} placeholder="Title (e.g. Weather closure)" value={title} onChangeText={setTitle} maxLength={80} />
          <TextInput style={[s.input, { minHeight: 80 }]} multiline placeholder="Message" value={body} onChangeText={setBody} maxLength={400} />
          <Button label="Send" onPress={send} disabled={!title.trim() || !body.trim() || (audience === 'group' && !groupId) || (audience === 'roles' && !roles.length)} />
          <P muted>Goes to everyone in the audience who has the app with notifications on, and appears in their notification list.</P>
        </Card>
      ) : <P muted>You don't have permission to send school-wide notifications.</P>}
      <Text style={{ fontSize: 12, fontWeight: '700', color: C.muted }}>RECENT</Text>
      {!history ? <Loading /> : history.map((n) => (
        <Card key={n.id}>
          <Text style={{ fontWeight: '700', color: C.ink }}>{n.title}</Text>
          <P>{n.body}</P>
          <P muted>{new Date(n.createdAt).toLocaleString()} · {n.audience} · {n.status}{n.status === 'sent' ? ` to ${n.sentCount} device${n.sentCount === 1 ? '' : 's'}` : ''}</P>
        </Card>
      ))}
    </View>
  );
}

// ------------------------------------------------------------------ questions (routing)

/** Questions sent to the school: oldest waiting first, so nothing sits too long. */
function QuestionsPanel() {
  const [qs, setQs] = useState<SchoolQuestion[] | null>(null);
  const [filter, setFilter] = useState<'waiting' | 'answered' | 'closed'>('waiting');
  const [, setTick] = useState(0);
  const load = useCallback(() => listQuestions().then(setQs).catch(() => setQs([])), []);
  useEffect(() => { load(); return subscribeQuestions(load); }, [load]);
  useEffect(() => { const t = setInterval(() => setTick((n) => n + 1), 60_000); return () => clearInterval(t); }, []);
  if (!qs) return <Loading />;

  const open = qs.filter(waiting).sort((a, b) => (a.waitingSince ?? '').localeCompare(b.waitingSince ?? ''));
  const unassigned = open.filter((q) => !q.assigneeId).length;
  const shown = filter === 'waiting' ? open : qs.filter((q) => q.status === filter);
  const name = (id: string | null) => { const p = id ? getUser(id) : undefined; return p ? `${p.firstName} ${p.lastName}` : 'someone'; };

  return (
    <>
      <Card>
        <Text style={{ fontSize: 16, fontWeight: '800', color: C.ink }}>
          {open.length} waiting · {unassigned} unassigned{open.length ? ` · oldest ${age(open[0].waitingSince)}` : ''}
        </Text>
        <P muted>Open a question to assign it to faculty or staff, or answer it yourself. Ages turn amber after a day and red after three.</P>
      </Card>
      <View style={[s.row, { flexWrap: 'wrap' }]}>
        {(['waiting', 'answered', 'closed'] as const).map((f) => pill(f === 'waiting' ? `Waiting (${open.length})` : f === 'answered' ? 'Answered' : 'Closed', filter === f, () => setFilter(f)))}
      </View>
      {shown.length === 0 && <P muted>{filter === 'waiting' ? 'Nothing is waiting. 🎉' : 'None yet.'}</P>}
      {shown.map((q) => (
        <Card key={q.id} onPress={() => router.push(`/questions/${q.id}`)} style={{ flexDirection: 'row', gap: 12, alignItems: 'center' }}>
          {waiting(q) && (
            <View style={{ width: 54, alignItems: 'center' }}>
              <Text style={{ fontSize: 18, fontWeight: '800', color: ageColor(q.waitingSince) }}>{age(q.waitingSince)}</Text>
              <Text style={{ fontSize: 11, color: C.muted }}>waiting</Text>
            </View>
          )}
          <View style={{ flex: 1, gap: 2 }}>
            <Text style={{ fontWeight: '700', color: C.ink }}>{q.subject}</Text>
            <P muted>From {name(q.askerId)} · {q.topic}</P>
            <Text style={{ color: q.assigneeId ? C.muted : '#B45309', fontWeight: q.assigneeId ? '400' : '700' }}>
              {q.assigneeId ? `Assigned to ${name(q.assigneeId)}` : 'Unassigned'}
            </Text>
          </View>
        </Card>
      ))}
    </>
  );
}

// ------------------------------------------------------------------ portal

function Portal({ access }: { access: Access }) {
  const can = (x: string) => access.permissions.includes(x);
  const tabs = [
    can('people.view') && ['people', 'People'],
    can('admins.manage') && ['admins', 'Admins & permissions'],
    ['notify', 'Notifications'],
    can('questions.manage') && ['questions', 'Questions'],
    can('audit.view') && ['audit', 'Activity log'],
  ].filter(Boolean) as [string, string][];
  const [tab, setTab] = useState(tabs[0][0]);
  const [people, setPeople] = useState<AdminPerson[] | null>(null);
  const [links, setLinks] = useState<{ guardianId: string; studentId: string }[]>([]);
  const [catalog, setCatalog] = useState<PermissionInfo[]>([]);
  const [audit, setAudit] = useState<any[]>([]);
  const [q, setQ] = useState('');

  const load = useCallback(async () => {
    try {
      const [p, l, c, a] = await Promise.all([
        can('people.view') ? adminListPeopleWithAccess() : Promise.resolve([]),
        adminGuardianLinks(), permissionCatalog(), can('audit.view') ? listAudit() : Promise.resolve([]),
      ]);
      setPeople(p); setLinks(l); setCatalog(c); setAudit(a);
    } catch (e: any) { Alert.alert('Admin portal', e.message); setPeople([]); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => { load(); }, [load]);
  if (!people) return <Loading />;

  const term = q.trim().toLowerCase();
  const shown = people.filter((p) => !term || `${p.firstName} ${p.lastName} ${p.email} ${p.schoolRole}`.toLowerCase().includes(term));
  const name = (id: string) => { const p = people.find((x) => x.id === id); return p ? `${p.firstName} ${p.lastName}` : 'someone'; };

  return (
    <ScrollView style={s.screen} contentContainerStyle={s.pad} keyboardShouldPersistTaps="handled">
      <P muted>{access.tier ? TIER_LABEL[access.tier] : 'Custom permissions'} · {me()?.email}</P>
      <View style={[s.row, { flexWrap: 'wrap' }]}>{tabs.map(([k, label]) => pill(label, tab === k, () => setTab(k)))}</View>

      {tab === 'people' && (
        <>
          <TextInput style={s.input} placeholder="Search people" value={q} onChangeText={setQ} />
          {shown.some((p) => p.pending) && <Text style={{ fontWeight: '800', color: '#B45309' }}>{shown.filter((p) => p.pending).length} waiting for approval</Text>}
          {shown.map((p) => <PersonCard key={p.id} p={p} people={people} links={links} access={access} onChange={load} />)}
        </>
      )}
      {tab === 'admins' && (
        <>
          <P muted>Give staff an admin tier, or grant individual permissions to anyone (for example, a teacher who runs the school calendar).</P>
          <TextInput style={s.input} placeholder="Search people" value={q} onChangeText={setQ} />
          {[...shown].filter((p) => !p.pending && p.schoolRole !== 'student')
            .sort((a, b) => Number(!!b.adminTier || b.granted.length > 0) - Number(!!a.adminTier || a.granted.length > 0))
            .map((p) => <AccessCard key={p.id} p={p} catalog={catalog} onChange={load} />)}
        </>
      )}
      {tab === 'notify' && <Notifications access={access} />}
      {tab === 'questions' && <QuestionsPanel />}
      {tab === 'audit' && (audit.length === 0 ? <P muted>No activity yet.</P> : audit.map((a) => (
        <Card key={a.id}>
          <Text style={{ fontWeight: '700', color: C.ink }}>{a.action}</Text>
          <P muted>{name(a.actor_id)}{a.groups?.name ? ` · ${a.groups.name}` : ''} · {new Date(a.at).toLocaleString()}</P>
          {a.target_id && people.some((p) => p.id === a.target_id) && <P muted>→ {name(a.target_id)}</P>}
        </Card>
      )))}
    </ScrollView>
  );
}

export default function Admin() {
  return (
    <>
      <Stack.Screen options={{ title: 'Admin portal' }} />
      <MfaGate>{(access) => <Portal access={access} />}</MfaGate>
    </>
  );
}
