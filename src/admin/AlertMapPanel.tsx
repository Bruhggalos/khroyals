/**
 * Alert map in the admin portal (alerts.map: directors, administrators, IT): the school's Wi-Fi
 * access points and the room or area each one is in. When someone answers a critical alert, the
 * access point their phone is on tells the senders where they are ("Room 112 · Main building").
 * Add them one at a time (on a phone, "Use this phone's access point" fills in the BSSID while
 * standing in the room), or paste the list IT exports.
 */
import { useCallback, useEffect, useState } from 'react';
import { Alert, Platform, Text, View } from 'react-native';
import { deleteAccessPoint, errorText, importAccessPoints, listAccessPoints, saveAccessPoint, type AccessPoint } from '../api/connect';
import { currentAccessPoint } from '../alerts/locate';
import { normalizeMac, parseApList, type ApRow } from '../alerts/whereabouts';
import { Button, C, Card, Field, H, Loading, P, ask } from '../ui';

const EMPTY: ApRow = { bssid: '', place: '', building: '', floor: '', notes: '' };
const fail = (e: unknown) => Alert.alert('Alert map', errorText(e));

export function AlertMapPanel() {
  const [list, setList] = useState<AccessPoint[] | null>(null);
  const [form, setForm] = useState<ApRow>(EMPTY);
  const [editing, setEditing] = useState<string | null>(null);  // the BSSID being changed
  const [here, setHere] = useState<string | null>(null);
  const [paste, setPaste] = useState('');
  const [q, setQ] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => listAccessPoints().then(setList).catch((e) => { fail(e); setList([]); }), []);
  useEffect(() => { load(); }, [load]);
  if (!list) return <Loading />;

  const set = (k: keyof ApRow) => (v: string) => setForm((f) => ({ ...f, [k]: v }));
  const bssid = normalizeMac(form.bssid);
  const save = () => {
    setBusy(true);
    saveAccessPoint({ ...form, bssid: bssid! }, editing).then(() => { setForm(EMPTY); setEditing(null); setHere(null); return load(); })
      .catch(fail).finally(() => setBusy(false));
  };
  const edit = (a: AccessPoint) => { setEditing(a.bssid); setForm({ bssid: a.bssid, place: a.place, building: a.building, floor: a.floor, notes: a.notes }); };
  const remove = () => ask('Remove this access point?', `${form.place} (${editing})`, 'Remove',
    () => deleteAccessPoint(editing!).then(() => { setForm(EMPTY); setEditing(null); return load(); }).catch(fail));
  const useHere = () => currentAccessPoint().then((ap) => {
    if (!ap.bssid) { Alert.alert('No access point', 'Connect this phone to the school Wi-Fi, and allow location for KH Royals, then try again.'); return; }
    const known = list.find((x) => x.bssid === ap.bssid);
    if (known) edit(known); else { setEditing(null); setForm({ ...EMPTY, bssid: ap.bssid }); }
    setHere(ap.ssid ? `Connected to ${ap.ssid}` : 'Connected');
  });
  const parsed = paste.trim() ? parseApList(paste) : null;
  const doImport = () => {
    if (!parsed?.rows.length) return;
    setBusy(true);
    importAccessPoints(parsed.rows).then((n) => { setPaste(''); Alert.alert('Alert map', `${n} access point${n === 1 ? '' : 's'} saved.`); return load(); })
      .catch(fail).finally(() => setBusy(false));
  };

  const needle = q.trim().toLowerCase();
  const shown = list.filter((a) => !needle || [a.bssid, a.place, a.building, a.floor, a.notes].some((x) => x.toLowerCase().includes(needle)));
  const groups = new Map<string, AccessPoint[]>();
  shown.forEach((a) => {
    const k = [a.building, a.floor].filter(Boolean).join(' · ') || 'No building set';
    groups.set(k, [...(groups.get(k) ?? []), a]);
  });

  return (
    <View style={{ gap: 12 }}>
      <Card>
        <H>Alert map</H>
        <P muted>Where each of the school’s Wi-Fi access points is. When someone answers a critical alert, the access point their
          phone is on tells the alert senders the room or area. An access point often has several BSSIDs (one per radio); add
          them all, or add one and answers from the others show as “Probably” that place.</P>
      </Card>

      <Card>
        <H>{editing ? 'Change access point' : 'Add an access point'}</H>
        {Platform.OS !== 'web' && <Button kind="ghost" label="📶 Use this phone's access point" onPress={useHere} />}
        {!!here && <P muted>{here}. Fill in where you’re standing.</P>}
        <Field label="BSSID (MAC address)" placeholder="3c:84:6a:12:34:56" autoCapitalize="none" value={form.bssid} onChangeText={set('bssid')}
          error={form.bssid && !bssid ? 'That isn’t a MAC address.' : null} />
        <Field label="Place" placeholder="Room 112, Gym, Front office" value={form.place} onChangeText={set('place')} maxLength={80} />
        <Field label="Building (optional)" placeholder="Main building" value={form.building} onChangeText={set('building')} maxLength={80} />
        <Field label="Floor (optional)" placeholder="1st floor" value={form.floor} onChangeText={set('floor')} maxLength={40} />
        <Field label="Notes (optional)" placeholder="Ceiling by the door" value={form.notes} onChangeText={set('notes')} maxLength={200} />
        <Button label={busy ? 'Saving…' : editing ? 'Save' : 'Add'} onPress={save} disabled={busy || !bssid || !form.place.trim()} />
        {!!editing && <Button kind="ghost" label="Remove" onPress={remove} />}
        {!!editing && <Text style={{ color: C.primary, fontWeight: '700' }} onPress={() => { setEditing(null); setForm(EMPTY); setHere(null); }}>Cancel</Text>}
      </Card>

      <Card>
        <H>Paste a list</H>
        <P muted>One access point a line: BSSID, place, building, floor, notes (commas, or columns copied from a spreadsheet).
          Ones already on the map are updated.</P>
        <Field label="Access points" placeholder={'3c:84:6a:12:34:56, Room 112, Main building, 1st floor'} value={paste} onChangeText={setPaste}
          multiline autoCapitalize="none" style={{ minHeight: 110, textAlignVertical: 'top', fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace' }} />
        {parsed && <P muted>{parsed.rows.length} ready to save{parsed.errors.length ? `; fix these first:\n${parsed.errors.slice(0, 5).join('\n')}` : '.'}</P>}
        <Button label={busy ? 'Saving…' : 'Save the list'} onPress={doImport} disabled={busy || !parsed?.rows.length || !!parsed?.errors.length} />
      </Card>

      <Field label={`On the map (${list.length})`} placeholder="Search by place, building or BSSID" value={q} onChangeText={setQ} autoCapitalize="none" />
      {list.length === 0 && <Card><P muted>No access points yet. Ask IT for the list of access points and where each one is.</P></Card>}
      {[...groups].map(([g, aps]) => (
        <View key={g} style={{ gap: 6 }}>
          <Text style={{ fontWeight: '800', color: C.muted }}>{g.toUpperCase()}</Text>
          {aps.map((a) => (
            <Card key={a.bssid} onPress={() => edit(a)} style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
              <View style={{ flex: 1 }}>
                <Text style={{ fontWeight: '700', color: C.ink }}>{a.place}</Text>
                <Text style={{ color: C.muted, fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace', fontSize: 12 }}>{a.bssid}</Text>
                {!!a.notes && <P muted>{a.notes}</P>}
              </View>
              <Text style={{ color: C.primary, fontWeight: '700' }}>Edit</Text>
            </Card>
          ))}
        </View>
      ))}
    </View>
  );
}
