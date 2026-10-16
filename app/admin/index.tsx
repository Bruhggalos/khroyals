/**
 * Admin portal — same screens on web, Android and iPhone.
 * What each admin sees follows their role and permissions (the database
 * enforces the same rules), and the whole portal sits behind authenticator-app
 * verification (MfaGate).
 */
import { useCallback, useEffect, useState } from 'react';
import { Alert, Platform, ScrollView, Text, View } from 'react-native';
import { Stack } from 'expo-router';
import {
  adminDeleteRole, adminFamilyLinks, adminLinkGuardian, adminListPeople, adminRoles, adminSaveRole, adminSetAccess,
  adminSetCarlineDuty, adminSetDirector, adminSetVolunteerLead, adminUpdateProfile, getUser, listAudit, listMyGroups, listNotifications, me, permissionCatalog,
  sendNotification,
  type Access, type AdminPerson, type AdminRole, type FamilyLink, type Notice, type PeopleFilter, type PermissionInfo,
} from '../../src/api/connect';
import { MfaGate } from '../../src/comms/MfaGate';
import type { Group, SchoolRole } from '../../src/comms/types';
import { Button, C, Card, Chip, Field, H, Loading, P, s } from '../../src/ui';

const PAGE = 20;
const ROLES: SchoolRole[] = ['admin', 'teacher', 'staff', 'parent', 'student'];
const FILTERS: [PeopleFilter, string][] = [
  ['all', 'All'], ['pending', 'Needs approval'], ['staff', 'Staff'], ['parents', 'Parents'], ['students', 'Students'], ['admins', 'Admins'],
];
const STAFF = ['admin', 'teacher', 'staff'];

const pill = (label: string, on: boolean, onPress: () => void, color = C.primary) => (
  <Text key={label} onPress={onPress} accessibilityRole="button" accessibilityState={{ selected: on }}
    style={{ paddingHorizontal: 10, paddingVertical: 5, borderRadius: 999, overflow: 'hidden', borderWidth: 1,
      borderColor: C.line, backgroundColor: on ? color : '#fff', color: on ? '#fff' : C.ink }}>{label}</Text>
);
const link = (label: string, onPress: () => void, color = C.primary) => (
  <Text onPress={onPress} accessibilityRole="button" style={{ color, fontWeight: '700' }}>{label}</Text>
);
const label = (t: string) => <Text style={{ fontSize: 12, fontWeight: '700', color: C.muted, marginTop: 6 }}>{t}</Text>;
const confirm = (title: string, msg: string, onYes: () => void) => {
  if (Platform.OS === 'web') { if (globalThis.confirm?.(`${title}\n\n${msg}`)) onYes(); return; }
  Alert.alert(title, msg, [{ text: 'Cancel', style: 'cancel' }, { text: 'Yes', style: 'destructive', onPress: onYes }]);
};
const fail = (e: any) => Alert.alert('Not allowed', e.message);
const fullName = (p: { firstName: string; lastName: string }) => (p.firstName || p.lastName ? `${p.firstName} ${p.lastName}`.trim() : '(no name yet)');

/** Debounced server search: one page of people matching the term and filter. */
function usePeople(search: string, filter: PeopleFilter, limit: number, offset: number, reload = 0, enabled = true) {
  const [res, setRes] = useState<{ people: AdminPerson[]; total: number } | null>(null);
  useEffect(() => {
    if (!enabled) return;
    let live = true;
    const t = setTimeout(() => adminListPeople({ search, filter, limit, offset })
      .then((r) => live && setRes(r)).catch((e) => { if (live) { setRes({ people: [], total: 0 }); fail(e); } }), search ? 300 : 0);
    return () => { live = false; clearTimeout(t); };
  }, [search, filter, limit, offset, reload, enabled]);
  return res;
}

// ------------------------------------------------------------------ people

function PersonCard({ p, links, access, roles, onChange }: {
  p: AdminPerson; links: FamilyLink[]; access: Access; roles: AdminRole[]; onChange: () => void;
}) {
  const [open, setOpen] = useState(!!p.pending);
  const [grade, setGrade] = useState(p.grade != null ? String(p.grade) : '');
  const [q, setQ] = useState('');
  const found = usePeople(q.trim(), 'students', 6, 0, 0, q.trim() !== '');
  const can = (x: string) => access.permissions.includes(x);
  const isAdminAccount = !!p.adminTier || p.schoolRole === 'admin';
  const roleOptions = ROLES.filter((r) => {
    if (r === 'admin' || isAdminAccount) return can('admins.manage');
    if (p.pending && (r === 'parent' || r === 'student')) return can('people.approve') || can('people.roles');
    return can('people.roles');
  });
  const setRole = (r: SchoolRole | null) =>
    adminUpdateProfile(p.id, r, r === 'student' && grade !== '' ? Number(grade) : p.grade ?? null).then(onChange).catch(fail);
  const children = links.filter((l) => l.guardianId === p.id);
  const parents = links.filter((l) => l.studentId === p.id);
  const roleName = roles.find((r) => r.id === p.adminTier)?.name ?? p.adminTier;

  return (
    <Card onPress={() => setOpen(!open)}>
      <View style={s.row}>
        <View style={{ flex: 1 }}>
          <Text style={{ fontWeight: '700', color: C.ink }}>{fullName(p)}</Text>
          <P muted>{p.email}{p.grade != null ? ` · grade ${p.grade}` : ''}</P>
        </View>
        {roleName && <Chip label={roleName} color={C.accent} />}
        {p.carlineDuty && <Chip label="Car line" color="#15803D" />}
        {p.volunteerLead && <Chip label="Volunteer lead" color="#DB2777" />}
        {p.pending ? <Chip label="Needs approval" color="#B45309" /> : <Chip label={p.schoolRole} />}
      </View>
      {(children.length > 0 || parents.length > 0) && (
        <P muted>{children.length ? `Parent of ${children.map((c) => c.studentName).join(', ')}` : `Parents: ${parents.map((c) => c.guardianName).join(', ')}`}</P>
      )}
      {open && (
        <View style={{ gap: 8 }}>
          {roleOptions.length > 0 && p.adminTier !== 'director' && (
            <View style={[s.row, { flexWrap: 'wrap' }]}>
              {roleOptions.map((r) => pill(r, p.schoolRole === r && !p.pending, () => setRole(r)))}
              {!p.pending && p.id !== me()?.id && pill('revoke access', false, () => confirm('Revoke access?', `${p.firstName} will lose access to Royals Connect.`, () => setRole(null)), C.danger)}
            </View>
          )}
          {p.adminTier === 'director' && <P muted>Directors are managed under Admins & roles.</P>}
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
            <View style={[s.row, { alignItems: 'flex-end' }]}>
              <Field label="Grade" hint="K2 = -2, K = 0 … 12" keyboardType="numbers-and-punctuation" value={grade} onChangeText={setGrade} style={{ flex: 1 }} />
              <Button label="Save grade" kind="ghost" onPress={() => setRole('student')} />
            </View>
          )}
          {p.schoolRole === 'parent' && can('people.family') && (
            <View style={{ gap: 6 }}>
              {children.map((c) => (
                <Text key={c.studentId} style={{ color: C.ink }}>👪 {c.studentName}{'  '}
                  <Text style={{ color: C.danger }} onPress={() => adminLinkGuardian(p.id, c.studentId, false).then(onChange).catch(fail)}>unlink</Text>
                </Text>
              ))}
              <Field label="Link a student" placeholder="Search by name" value={q} onChangeText={setQ} />
              {q.trim() !== '' && found?.people.filter((x) => !children.some((c) => c.studentId === x.id)).map((x) => (
                <Text key={x.id} style={{ color: C.primary }} onPress={() => { setQ(''); adminLinkGuardian(p.id, x.id).then(onChange).catch(fail); }}>
                  + {fullName(x)} (grade {x.grade ?? '?'})
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

function Pager({ offset, total, onPage }: { offset: number; total: number; onPage: (o: number) => void }) {
  if (total <= PAGE) return null;
  return (
    <View style={[s.row, { justifyContent: 'space-between' }]}>
      <Button label="‹ Previous" kind="ghost" disabled={offset === 0} onPress={() => onPage(Math.max(0, offset - PAGE))} />
      <Text style={{ color: C.muted }}>{offset + 1}–{Math.min(offset + PAGE, total)} of {total}</Text>
      <Button label="Next ›" kind="ghost" disabled={offset + PAGE >= total} onPress={() => onPage(offset + PAGE)} />
    </View>
  );
}

function People({ access, roles }: { access: Access; roles: AdminRole[] }) {
  const [q, setQ] = useState('');
  const [filter, setFilter] = useState<PeopleFilter>('all');
  const [offset, setOffset] = useState(0);
  const [reload, setReload] = useState(0);
  const [links, setLinks] = useState<FamilyLink[]>([]);
  const page = usePeople(q.trim(), filter, PAGE, offset, reload);
  const loadLinks = useCallback(() => adminFamilyLinks().then(setLinks).catch(() => setLinks([])), []);
  useEffect(() => { loadLinks(); }, [loadLinks]);
  useEffect(() => setOffset(0), [q, filter]);
  const changed = () => { setReload((n) => n + 1); loadLinks(); };

  return (
    <>
      <Field label="Search people" placeholder="Name or email" autoCapitalize="none" value={q} onChangeText={setQ} />
      <View style={[s.row, { flexWrap: 'wrap' }]}>{FILTERS.map(([k, l]) => pill(l, filter === k, () => setFilter(k)))}</View>
      {!page ? <Loading /> : (
        <>
          <P muted>{page.total === 0 ? 'Nobody matches.' : `${page.total} ${page.total === 1 ? 'person' : 'people'}`}</P>
          {page.people.map((p) => <PersonCard key={p.id} p={p} links={links} access={access} roles={roles} onChange={changed} />)}
          <Pager offset={offset} total={page.total} onPage={setOffset} />
        </>
      )}
    </>
  );
}

// ------------------------------------------------------------------ admins & roles (directors)

function PermissionChecks({ catalog, value, fixed = [], onChange, disabled }: {
  catalog: PermissionInfo[]; value: string[]; fixed?: string[]; onChange: (v: string[]) => void; disabled?: boolean;
}) {
  return (
    <View style={{ gap: 6 }}>
      {catalog.filter((c) => c.key !== 'admins.manage').map((c) => {
        const fromRole = fixed.includes(c.key);
        const on = fromRole || value.includes(c.key);
        return (
          <Text key={c.key} accessibilityRole="checkbox" accessibilityState={{ checked: on, disabled: fromRole || disabled }}
            onPress={fromRole || disabled ? undefined : () => onChange(on ? value.filter((g) => g !== c.key) : [...value, c.key])}
            style={{ color: fromRole ? C.muted : C.ink }}>
            {on ? '☑' : '☐'} <Text style={{ fontWeight: '700' }}>{c.label}</Text>{fromRole ? ' (from role)' : ''}{'\n'}
            <Text style={{ color: C.muted, fontSize: 13 }}>{c.description}</Text>
          </Text>
        );
      })}
    </View>
  );
}

function RoleCard({ role, catalog, onChange, startOpen = false, onCancel }: {
  role: AdminRole | null; catalog: PermissionInfo[]; onChange: () => void; startOpen?: boolean; onCancel?: () => void;
}) {
  const [open, setOpen] = useState(startOpen);
  const [name, setName] = useState(role?.name ?? '');
  const [description, setDescription] = useState(role?.description ?? '');
  const [perms, setPerms] = useState<string[]>(role?.permissions ?? []);
  const save = () => adminSaveRole({ id: role?.id ?? null, name, description, permissions: perms })
    .then(() => { if (!role) onCancel?.(); else setOpen(false); onChange(); }).catch(fail);

  if (role?.isSystem) {
    return (
      <Card>
        <View style={s.row}><Text style={{ flex: 1, fontWeight: '800', color: C.ink }}>{role.name}</Text><Chip label="Built in" color={C.accent} /></View>
        <P muted>{role.description}</P>
      </Card>
    );
  }
  return (
    <Card onPress={open ? undefined : () => setOpen(true)}>
      {role && (
        <View style={s.row}>
          <View style={{ flex: 1 }}>
            <Text style={{ fontWeight: '800', color: C.ink }}>{role.name}</Text>
            <P muted>{role.description || 'No description'} · {role.permissions.length} permission{role.permissions.length === 1 ? '' : 's'}</P>
          </View>
          {open && link('Close', () => setOpen(false), C.muted)}
        </View>
      )}
      {open && (
        <View style={{ gap: 10 }}>
          <Field label="Role name" placeholder="e.g. Athletics Director" value={name} onChangeText={setName} maxLength={60} />
          <Field label="Description" placeholder="What this role is for" value={description} onChangeText={setDescription} maxLength={200} />
          {label('PERMISSIONS')}
          <PermissionChecks catalog={catalog} value={perms} onChange={setPerms} />
          <Button label={role ? 'Save role' : 'Create role'} disabled={!name.trim()} onPress={save} />
          {role ? link('Delete role…', () => confirm(`Delete "${role.name}"?`, 'Everyone with this role loses the admin access it gave them.',
            () => adminDeleteRole(role.id).then(onChange).catch(fail)), C.danger)
            : link('Cancel', () => onCancel?.(), C.muted)}
        </View>
      )}
    </Card>
  );
}

function AccessCard({ p, roles, catalog, onChange }: { p: AdminPerson; roles: AdminRole[]; catalog: PermissionInfo[]; onChange: () => void }) {
  const [open, setOpen] = useState(false);
  const [role, setRole] = useState<string | null>(p.adminTier);
  const [granted, setGranted] = useState<string[]>(p.granted);
  const staff = STAFF.includes(p.schoolRole);
  const assignable = roles.filter((r) => !r.isSystem);
  const fixed = roles.find((r) => r.id === role)?.permissions ?? [];
  const roleName = roles.find((r) => r.id === p.adminTier)?.name ?? p.adminTier;
  const save = () => adminSetAccess(p.id, role, granted.filter((g) => !fixed.includes(g))).then(() => { setOpen(false); onChange(); }).catch(fail);

  return (
    <Card onPress={open ? undefined : () => setOpen(true)}>
      <View style={s.row}>
        <View style={{ flex: 1 }}>
          <Text style={{ fontWeight: '700', color: C.ink }}>{fullName(p)}</Text>
          <P muted>{p.email} · {p.schoolRole}{p.granted.length ? ` · +${p.granted.length} permission${p.granted.length > 1 ? 's' : ''}` : ''}</P>
        </View>
        {roleName && <Chip label={roleName} color={C.accent} />}
      </View>
      {open && (
        <View style={{ gap: 10 }}>
          {label('ROLE')}
          {staff ? (
            <View style={[s.row, { flexWrap: 'wrap' }]}>
              {pill('No admin role', role === null, () => setRole(null))}
              {assignable.map((r) => pill(r.name, role === r.id, () => setRole(r.id)))}
            </View>
          ) : <P muted>Admin roles are for staff accounts; you can still grant individual permissions.</P>}
          {label('EXTRA PERMISSIONS')}
          <PermissionChecks catalog={catalog} value={granted} fixed={fixed} onChange={setGranted} disabled={p.schoolRole === 'student'} />
          <Button label="Save access" onPress={save} />
          <View style={[s.row, { justifyContent: 'space-between', flexWrap: 'wrap' }]}>
            {staff ? link(`Make ${p.firstName || 'them'} a director…`, () => confirm('Add a director?',
              `${fullName(p)} gets every permission, including managing admins, roles and other directors.`,
              () => adminSetDirector(p.id, true).then(onChange).catch(fail)), C.danger) : <View />}
            {link('Close', () => setOpen(false), C.muted)}
          </View>
        </View>
      )}
    </Card>
  );
}

function Admins({ catalog, roles, reloadRoles }: { catalog: PermissionInfo[]; roles: AdminRole[]; reloadRoles: () => void }) {
  const [reload, setReload] = useState(0);
  const [q, setQ] = useState('');
  const [offset, setOffset] = useState(0);
  const [newRole, setNewRole] = useState(false);
  const admins = usePeople('', 'admins', 100, 0, reload);
  const search = usePeople(q.trim(), 'all', PAGE, offset, reload, q.trim() !== '');
  useEffect(() => setOffset(0), [q]);
  const changed = () => { setReload((n) => n + 1); reloadRoles(); };
  const meId = me()?.id;
  if (!admins) return <Loading />;
  const directors = admins.people.filter((p) => p.adminTier === 'director');
  const others = admins.people.filter((p) => p.adminTier !== 'director');

  return (
    <>
      <H>Directors</H>
      <P muted>Directors have every permission and manage admins and roles. You can have several, but never none — add the new director before the old one steps down.</P>
      {directors.map((p) => (
        <Card key={p.id}>
          <View style={s.row}>
            <View style={{ flex: 1 }}>
              <Text style={{ fontWeight: '800', color: C.ink }}>{fullName(p)}{p.id === meId ? ' (you)' : ''}</Text>
              <P muted>{p.email}</P>
            </View>
            <Chip label="Director" color={C.accent} />
          </View>
          {directors.length > 1
            ? link(p.id === meId ? 'Step down as director…' : 'Remove director…', () => confirm(p.id === meId ? 'Step down?' : 'Remove director?',
                `${p.id === meId ? 'You' : fullName(p)} will become an Administrator.`, () => adminSetDirector(p.id, false).then(changed).catch(fail)), C.danger)
            : <P muted>The only director. To hand over, make someone else a director first, then step down.</P>}
        </Card>
      ))}

      <H>Roles</H>
      <P muted>Roles bundle permissions. Create one for each job (for example "Athletics Director" with calendar and notifications), then assign it below.</P>
      {roles.map((r) => <RoleCard key={`${r.id}:${r.name}:${r.permissions.join()}`} role={r} catalog={catalog} onChange={changed} />)}
      {newRole ? <RoleCard role={null} catalog={catalog} onChange={changed} startOpen onCancel={() => setNewRole(false)} />
        : <Button label="+ New role" kind="ghost" onPress={() => setNewRole(true)} />}

      <H>People with admin access</H>
      {others.length === 0 ? <P muted>Nobody else yet.</P>
        : others.map((p) => <AccessCard key={`${p.id}:${p.adminTier}:${p.granted.join()}`} p={p} roles={roles} catalog={catalog} onChange={changed} />)}

      <H>Give someone access</H>
      <Field label="Find a person" placeholder="Name or email" autoCapitalize="none" value={q} onChangeText={setQ} />
      {q.trim() !== '' && (!search ? <Loading /> : (
        <>
          {search.people.filter((p) => !p.pending && p.adminTier !== 'director').map((p) =>
            <AccessCard key={`${p.id}:${p.adminTier}:${p.granted.join()}`} p={p} roles={roles} catalog={catalog} onChange={changed} />)}
          {search.total === 0 && <P muted>Nobody matches.</P>}
          <Pager offset={offset} total={search.total} onPage={setOffset} />
        </>
      ))}
    </>
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
          <Field label="Title" placeholder="e.g. Weather closure" value={title} onChangeText={setTitle} maxLength={80} />
          <Field label="Message" multiline value={body} onChangeText={setBody} maxLength={400} style={{ minHeight: 80 }} />
          <Button label="Send" onPress={send} disabled={!title.trim() || !body.trim() || (audience === 'group' && !groupId) || (audience === 'roles' && !roles.length)} />
          <P muted>Goes to everyone in the audience who has the app with notifications on, and appears in their notification list.</P>
        </Card>
      ) : <P muted>You don't have permission to send school-wide notifications.</P>}
      {label('RECENT')}
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

// ------------------------------------------------------------------ portal

function Audit() {
  const [rows, setRows] = useState<any[] | null>(null);
  useEffect(() => { listAudit().then(setRows).catch((e) => { setRows([]); fail(e); }); }, []);
  if (!rows) return <Loading />;
  const name = (id: string) => { const p = getUser(id); return p ? fullName(p) : 'someone'; };
  return rows.length === 0 ? <P muted>No activity yet.</P> : (
    <>{rows.map((a) => (
      <Card key={a.id}>
        <Text style={{ fontWeight: '700', color: C.ink }}>{a.action}</Text>
        <P muted>{name(a.actor_id)}{a.groups?.name ? ` · ${a.groups.name}` : ''} · {new Date(a.at).toLocaleString()}</P>
        {a.target_id && getUser(a.target_id) && <P muted>→ {name(a.target_id)}</P>}
      </Card>
    ))}</>
  );
}

function Portal({ access }: { access: Access }) {
  const can = (x: string) => access.permissions.includes(x);
  const tabs = [
    can('people.view') && ['people', 'People'],
    can('admins.manage') && ['admins', 'Admins & roles'],
    ['notify', 'Notifications'],
    can('audit.view') && ['audit', 'Activity log'],
  ].filter(Boolean) as [string, string][];
  const [tab, setTab] = useState(tabs[0][0]);
  const [catalog, setCatalog] = useState<PermissionInfo[]>([]);
  const [roles, setRoles] = useState<AdminRole[]>([]);
  const loadRoles = useCallback(() => { adminRoles().then(setRoles).catch(() => setRoles([])); }, []);
  useEffect(() => { permissionCatalog().then(setCatalog).catch(fail); loadRoles(); }, [loadRoles]);

  return (
    <ScrollView style={s.screen} contentContainerStyle={s.pad} keyboardShouldPersistTaps="handled">
      <P muted>{access.isDirector ? 'Director' : access.roleName ?? 'Custom permissions'} · {me()?.email}</P>
      <View style={[s.row, { flexWrap: 'wrap' }]}>{tabs.map(([k, l]) => pill(l, tab === k, () => setTab(k)))}</View>
      {tab === 'people' && <People access={access} roles={roles} />}
      {tab === 'admins' && <Admins catalog={catalog} roles={roles} reloadRoles={loadRoles} />}
      {tab === 'notify' && <Notifications access={access} />}
      {tab === 'audit' && <Audit />}
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
