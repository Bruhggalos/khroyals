/** Add or edit a sport (sports managers): name, emoji and a short description. */
import { useEffect, useState } from 'react';
import { Alert, Platform, ScrollView } from 'react-native';
import { Stack, router, useLocalSearchParams } from 'expo-router';
import { deleteSport, listSports, saveSport } from '../../src/api/connect';
import { Button, Card, Field, Loading, P, s } from '../../src/ui';

export default function EditSport() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  const [loaded, setLoaded] = useState(!id);
  const [name, setName] = useState('');
  const [icon, setIcon] = useState('🏅');
  const [description, setDescription] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!id) return;
    listSports().then(({ sports }) => {
      const sp = sports.find((x) => x.id === id);
      if (sp) { setName(sp.name); setIcon(sp.icon); setDescription(sp.description); }
      setLoaded(true);
    });
  }, [id]);
  if (!loaded) return <Loading />;

  const save = () => {
    setBusy(true);
    saveSport({ id: id ?? null, name, icon, description })
      .then((row) => (id ? router.back() : router.replace(`/sports/${row.id}`)))
      .catch((e) => Alert.alert('Sports', e.message)).finally(() => setBusy(false));
  };
  const remove = () => {
    const go = () => deleteSport(id!).then(() => router.replace('/sports')).catch((e) => Alert.alert('Sports', e.message));
    if (Platform.OS === 'web') { if (globalThis.confirm?.(`Delete ${name}?`)) go(); return; }
    Alert.alert(`Delete ${name}?`, 'Its seasons, schedule, sign-ups and followers go too. This can\'t be undone.', [
      { text: 'Cancel', style: 'cancel' }, { text: 'Delete', style: 'destructive', onPress: go },
    ]);
  };

  return (
    <ScrollView style={s.screen} contentContainerStyle={s.pad} keyboardShouldPersistTaps="handled">
      <Stack.Screen options={{ title: id ? 'Edit sport' : 'New sport' }} />
      <Card style={{ gap: 12 }}>
        <Field label="Name" placeholder="Volleyball" value={name} onChangeText={setName} maxLength={60} />
        <Field label="Emoji" hint="Shown beside the name, like 🏐 🏀 ⚽ 🏈 ⚾ 🎾 🏃 ⛳" value={icon} onChangeText={setIcon} maxLength={4} style={{ width: 90 }} />
        <Field label="Description" placeholder="Who it's for and what to expect" value={description} onChangeText={setDescription} multiline style={{ minHeight: 80 }} />
      </Card>
      <Button label={busy ? 'Saving…' : 'Save'} disabled={busy || !name.trim()} onPress={save} />
      {id ? <Button label="Delete sport" kind="ghost" onPress={remove} /> : <P muted>Then add a season, its schedule and coaches from the sport's page.</P>}
    </ScrollView>
  );
}
