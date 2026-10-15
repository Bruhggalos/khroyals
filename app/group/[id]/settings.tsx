import { useEffect, useState } from 'react';
import { Alert, ScrollView } from 'react-native';
import { Stack, router, useLocalSearchParams } from 'expo-router';
import { getGroup, updateGroupSettings } from '../../../src/api/mockApi';
import { SettingsForm } from '../../../src/comms/SettingsForm';
import type { GroupSettings } from '../../../src/comms/types';
import { Button, Loading, s } from '../../../src/ui';

export default function GroupSettingsScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [v, setV] = useState<GroupSettings | null>(null);
  useEffect(() => { getGroup(id).then((d) => setV(d.group.settings)); }, [id]);
  if (!v) return <Loading />;
  const save = () => updateGroupSettings(id, v).then(() => router.back()).catch((e) => Alert.alert('Error', e.message));
  return (
    <ScrollView style={s.screen} contentContainerStyle={s.pad}>
      <Stack.Screen options={{ title: 'Group settings' }} />
      <SettingsForm value={v} onChange={setV} />
      <Button label="Save" onPress={save} />
    </ScrollView>
  );
}
