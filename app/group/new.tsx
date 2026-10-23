import { useState } from 'react';
import { Alert, ScrollView, Text } from 'react-native';
import { Stack, router } from 'expo-router';
import { createGroup } from '../../src/api/connect';
import { defaultSettings } from '../../src/comms/presets';
import { SettingsForm } from '../../src/comms/SettingsForm';
import { parseGrades } from '../../src/comms/groupRules';
import type { AssignmentRule, Group, SchoolRole } from '../../src/comms/types';
import { Button, C, Card, Field, H, P, s } from '../../src/ui';

const ROLES: SchoolRole[] = ['student', 'parent', 'teacher', 'staff'];

export default function NewGroup() {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [icon, setIcon] = useState('💬');
  const [settings, setSettings] = useState(defaultSettings('chat'));
  const [roles, setRoles] = useState<SchoolRole[]>([]);
  const [grades, setGrades] = useState('');

  const create = () => {
    let selectedGrades: number[] | undefined;
    try { selectedGrades = parseGrades(grades); }
    catch (error) { Alert.alert('Grades', error instanceof Error ? error.message : String(error)); return; }
    const rules: AssignmentRule[] = roles.length || grades
      ? [{ id: 'r-1', schoolRoles: roles.length ? roles : undefined,
           grades: selectedGrades,
           assignAs: settings.mode === 'broadcast' ? 'subscriber' : 'member' }]
      : [];
    const g: Omit<Group, 'id' | 'createdAt' | 'createdBy'> = {
      name, description, icon, color: C.primary, category: 'class', settings, assignmentRules: rules, parentGroupId: null, tags: [],
    };
    createGroup(g).then((ng) => router.replace(`/group/${ng.id}`)).catch((e) => Alert.alert('Error', e.message));
  };

  return (
    <ScrollView style={s.screen} contentContainerStyle={s.pad}>
      <Stack.Screen options={{ title: 'New group' }} />
      <Card>
        <H>Basics</H>
        <Field label="Group name" placeholder="e.g. 9th Grade Parents" value={name} onChangeText={setName} />
        <Field label="Description" placeholder="What the group is for" value={description} onChangeText={setDescription} />
        <Field label="Emoji icon" placeholder="📣" value={icon} onChangeText={setIcon} maxLength={2} />
      </Card>
      <Card>
        <H>Auto-assign people</H>
        <P muted>Anyone matching is added automatically and kept in sync with the roster.</P>
        <Text style={{ color: C.ink }}>
          {ROLES.map((r) => (
            <Text key={r} onPress={() => setRoles(roles.includes(r) ? roles.filter((x) => x !== r) : [...roles, r])}
              style={{ color: roles.includes(r) ? C.primary : C.muted, fontWeight: roles.includes(r) ? '800' : '400' }}>
              {roles.includes(r) ? '☑' : '☐'} {r}{'   '}
            </Text>
          ))}
        </Text>
        <Field label="Grades (optional)" placeholder="e.g. 9,10" value={grades} onChangeText={setGrades} keyboardType="numbers-and-punctuation" />
      </Card>
      <SettingsForm value={settings} onChange={setSettings} />
      <Button label="Create group" onPress={create} disabled={!name.trim()} />
    </ScrollView>
  );
}
