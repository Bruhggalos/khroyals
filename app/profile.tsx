/**
 * My profile: photo, name, and which notifications reach this person's phone
 * (overall categories, quiet hours, and a level per group).
 */
import { useCallback, useEffect, useState } from 'react';
import { Alert, Linking, Platform, ScrollView, Switch, Text, View } from 'react-native';
import { Stack, router } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import {
  live, myGroupPrefs, mySettings, removeMyAvatar, session, setNotificationPref, signOut, updateMyName, updateMySettings,
  uploadMyAvatar, type GroupPref, type MySettings, type Person,
} from '../src/api/connect';
import { forgetCarPass } from '../src/carline/carPass';
import { disableAutoCheckIn } from '../src/carline/autoCheckIn';
import { disablePush, enablePush } from '../src/comms/push';
import { Avatar, Button, C, Card, Field, H, Loading, P, s } from '../src/ui';

const PHOTO_SIZE = 512;
const TIME = /^([01]?\d|2[0-3]):[0-5]\d$/;
const LEVELS: [GroupPref['pref'], string][] = [['all', 'Everything'], ['mentions', 'Important only'], ['none', 'Off']];

const Toggle = ({ label, hint, value, onChange, disabled }: { label: string; hint?: string; value: boolean; onChange?: (v: boolean) => void; disabled?: boolean }) => (
  <View style={[s.row, { justifyContent: 'space-between' }]}>
    <View style={{ flex: 1 }}>
      <Text style={{ fontWeight: '600', color: disabled ? C.muted : C.ink }}>{label}</Text>
      {hint && <P muted>{hint}</P>}
    </View>
    <Switch value={value} onValueChange={onChange} disabled={disabled} trackColor={{ true: C.primary }} accessibilityLabel={label} />
  </View>
);
const pill = (label: string, on: boolean, onPress: () => void) => (
  <Text key={label} onPress={onPress} accessibilityRole="button" accessibilityState={{ selected: on }}
    style={{ paddingHorizontal: 10, paddingVertical: 5, borderRadius: 999, overflow: 'hidden', borderWidth: 1, borderColor: C.line,
      backgroundColor: on ? C.primary : '#fff', color: on ? '#fff' : C.ink, fontSize: 13 }}>{label}</Text>
);
const fail = (e: any) => Alert.alert('Something went wrong', e.message);

export default function Profile() {
  const [person, setPerson] = useState<Person | null>(null);
  const [first, setFirst] = useState('');
  const [last, setLast] = useState('');
  const [settings, setSettings] = useState<MySettings | null>(null);
  const [quiet, setQuiet] = useState({ on: false, start: '21:00', end: '07:00' });
  const [groups, setGroups] = useState<GroupPref[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [device, setDevice] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);

  const load = useCallback(async () => {
    const p = await session();
    setPerson(p);
    if (!p) return;
    setFirst(p.firstName); setLast(p.lastName);
    const st = await mySettings();
    setSettings(st);
    setQuiet({ on: !!st.quietStart, start: st.quietStart ?? '21:00', end: st.quietEnd ?? '07:00' });
    setGroups(await myGroupPrefs());
  }, []);
  useEffect(() => { load().catch(fail).finally(() => setLoaded(true)); }, [load]);

  if (!live) return <View style={[s.screen, s.pad]}><P muted>Profiles need the school's Royals Connect account.</P></View>;
  if (loaded && !person) {
    return (
      <View style={[s.screen, s.pad]}>
        <Stack.Screen options={{ title: 'My profile' }} />
        <Card><P>Log in on the Connect tab to set up your profile.</P><Button label="Go to Connect" onPress={() => router.replace('/connect')} /></Card>
      </View>
    );
  }
  if (!person || !settings) return <Loading />;

  const adult = person.schoolRole !== 'student';
  const step = async (key: string, fn: () => Promise<unknown>) => {
    setBusy(key);
    try { await fn(); } catch (e: any) { fail(e); } finally { setBusy(null); }
  };

  const pickPhoto = (camera: boolean) => step('photo', async () => {
    if (camera && !(await ImagePicker.requestCameraPermissionsAsync()).granted) {
      return Alert.alert('Camera is off', 'Allow camera access for KH Royals in Settings to take a photo.');
    }
    const options: ImagePicker.ImagePickerOptions = { mediaTypes: ['images'], allowsEditing: true, aspect: [1, 1], quality: 1 };
    const result = camera ? await ImagePicker.launchCameraAsync(options) : await ImagePicker.launchImageLibraryAsync(options);
    const asset = result.canceled ? null : result.assets[0];
    if (!asset) return;
    // Square and small: profile photos only show as circles.
    const ctx = ImageManipulator.manipulate(asset.uri);
    const side = Math.min(asset.width, asset.height);
    if (asset.width !== asset.height) ctx.crop({ originX: (asset.width - side) / 2, originY: (asset.height - side) / 2, width: side, height: side });
    if (side > PHOTO_SIZE) ctx.resize({ width: PHOTO_SIZE, height: PHOTO_SIZE });
    const out = await (await ctx.renderAsync()).saveAsync({ compress: 0.75, format: SaveFormat.JPEG, base64: true });
    if (!out.base64) return;
    await uploadMyAvatar(out.base64);
    setPerson(await session());
  });
  const removePhoto = () => step('photo', async () => { await removeMyAvatar(); setPerson(await session()); });

  const saveName = () => step('name', async () => {
    await updateMyName(first, last);
    setPerson(await session());
    Alert.alert('Saved', 'Your name is updated.');
  });

  const saveSettings = (next: MySettings) => step('settings', async () => setSettings(await updateMySettings(next)));
  const saveQuiet = (q = quiet) => {
    if (q.on && (!TIME.test(q.start) || !TIME.test(q.end))) return Alert.alert('Quiet hours', 'Use 24-hour times like 21:00 and 07:00.');
    const pad = (t: string) => t.padStart(5, '0');
    saveSettings({ ...settings, quietStart: q.on ? pad(q.start) : null, quietEnd: q.on ? pad(q.end) : null });
  };
  const setGroupPref = (g: GroupPref, pref: GroupPref['pref']) => step(`g:${g.groupId}`, async () => {
    await setNotificationPref(g.groupId, pref);
    setGroups(groups.map((x) => (x.groupId === g.groupId ? { ...x, pref } : x)));
  });

  const checkDevice = () => step('device', async () => {
    const r = await enablePush();
    setDevice(r.state === 'on' ? 'Notifications are on for this device.' : r.detail ?? 'Notifications are off for this device.');
    if (r.state === 'denied') {
      Alert.alert('Notifications are off', 'Turn on notifications for KH Royals in your phone\'s settings.', [
        { text: 'Not now', style: 'cancel' }, { text: 'Open settings', onPress: () => Linking.openSettings() },
      ]);
    }
  });

  return (
    <ScrollView style={s.screen} contentContainerStyle={s.pad} keyboardShouldPersistTaps="handled">
      <Stack.Screen options={{ title: 'My profile' }} />

      <Card style={{ alignItems: 'center', gap: 10 }}>
        <Avatar person={person} size={112} />
        <Text style={{ fontSize: 20, fontWeight: '800', color: C.ink }}>{person.firstName} {person.lastName}</Text>
        <P muted>{person.email} · {person.schoolRole}{person.grade != null ? ` · grade ${person.grade}` : ''}</P>
        <View style={[s.row, { flexWrap: 'wrap', justifyContent: 'center', gap: 16 }]}>
          {busy === 'photo' ? <Loading /> : (
            <>
              {Platform.OS !== 'web' && <Text style={{ color: C.primary, fontWeight: '700' }} onPress={() => pickPhoto(true)}>Take photo</Text>}
              <Text style={{ color: C.primary, fontWeight: '700' }} onPress={() => pickPhoto(false)}>{person.avatar ? 'Change photo' : 'Add a photo'}</Text>
              {!!person.avatar && <Text style={{ color: C.danger, fontWeight: '600' }} onPress={removePhoto}>Remove</Text>}
            </>
          )}
        </View>
        <P muted>Everyone at school who uses Royals Connect can see your photo.</P>
      </Card>

      <Card>
        <H>Name</H>
        <View style={s.row}>
          <Field label="First name" autoComplete="given-name" textContentType="givenName" value={first} onChangeText={setFirst} style={{ flex: 1, minWidth: 0 }} />
          <Field label="Last name" autoComplete="family-name" textContentType="familyName" value={last} onChangeText={setLast} style={{ flex: 1, minWidth: 0 }} />
        </View>
        <Button label={busy === 'name' ? 'Saving…' : 'Save name'} onPress={saveName}
          disabled={!!busy || !first.trim() || !last.trim() || (first.trim() === person.firstName && last.trim() === person.lastName)} />
      </Card>

      <Card>
        <H>Notifications</H>
        <P muted>Choose what reaches your phone. Everything still shows under the bell in the app.</P>
        <Toggle label="School announcements" hint="Closures and urgent news always come through." value disabled />
        <Toggle label="Group posts" hint="Fine-tune each group below." value={settings.pushGroups}
          onChange={(v) => saveSettings({ ...settings, pushGroups: v })} />
        {adult && <Toggle label="Marketplace" hint="Dibs, offers and sales on your items." value={settings.pushMarketplace}
          onChange={(v) => saveSettings({ ...settings, pushMarketplace: v })} />}
        {adult && <Toggle label="Volunteering" hint="Sign-ups and changes to opportunities." value={settings.pushVolunteer}
          onChange={(v) => saveSettings({ ...settings, pushVolunteer: v })} />}
        <Toggle label="Quiet hours" hint="No notifications overnight (school announcements still come through)." value={quiet.on}
          onChange={(on) => { const q = { ...quiet, on }; setQuiet(q); saveQuiet(q); }} />
        {quiet.on && (
          <>
            <View style={s.row}>
              <Field label="From" placeholder="21:00" keyboardType="numbers-and-punctuation" maxLength={5}
                value={quiet.start} onChangeText={(start) => setQuiet({ ...quiet, start })} style={{ flex: 1, minWidth: 0 }} />
              <Field label="Until" placeholder="07:00" keyboardType="numbers-and-punctuation" maxLength={5}
                value={quiet.end} onChangeText={(end) => setQuiet({ ...quiet, end })} style={{ flex: 1, minWidth: 0 }} />
            </View>
            <Button kind="ghost" label="Save quiet hours" disabled={!!busy} onPress={() => saveQuiet()} />
          </>
        )}
        {Platform.OS !== 'web' && (
          <>
            <Text style={{ color: C.primary, fontWeight: '700' }} onPress={checkDevice}>Check notifications on this phone</Text>
            {device && <P muted>{device}</P>}
          </>
        )}
      </Card>

      {groups.length > 0 && (
        <Card>
          <H>Your groups</H>
          <P muted>"Important only" still sends announcements and urgent posts.</P>
          {groups.map((g) => (
            <View key={g.groupId} style={{ gap: 6, paddingVertical: 6, borderTopWidth: 1, borderTopColor: C.line, opacity: settings.pushGroups ? 1 : 0.5 }}>
              <Text style={{ fontWeight: '600', color: C.ink }}>{g.icon} {g.name}</Text>
              <View style={[s.row, { flexWrap: 'wrap', gap: 6 }]}>{LEVELS.map(([k, l]) => pill(l, g.pref === k, () => setGroupPref(g, k)))}</View>
            </View>
          ))}
        </Card>
      )}

      <Button kind="ghost" label="Sign out" onPress={() => disablePush().then(disableAutoCheckIn).then(forgetCarPass).then(signOut).then(() => router.replace('/connect'))} />
    </ScrollView>
  );
}
