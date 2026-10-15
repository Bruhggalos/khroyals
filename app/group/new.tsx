import { useState } from 'react';
import { Alert, ScrollView, Text, TextInput } from 'react-native';
import { Stack, router } from 'expo-router';
import { createGroup } from '../../src/api/mockApi';
import { defaultSettings } from '../../src/comms/presets';
import { SettingsForm } from '../../src/comms/SettingsForm';
import type { AssignmentRule, Group, SchoolRole } from '../../src/comms/types';
import { Button, C, Card, H, P, s } from '../../src/ui';

const ROLES: SchoolRole[] = ['student', 'parent', 'teacher', 'staff'];

export default function NewGroup() {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [icon, setIcon] = useState('💬');
  const [settings, setSettings] = useState(defaultSettings('chat'));
  const [roles, setRoles] = useState<SchoolRole[]>([]);
  const [grades, setGrades] = useState('');

  const create = () => {
    const rules: AssignmentRule[] = roles.length || grades
      ? [{ id: 'r-1', schoolRoles: roles.length ? roles : undefined,
           grades: grades ? grades.split(',').map((g) => Number(g.trim())).filter(Boolean) : undefined,
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
        <TextInput style={s.input} placeholder="Group name" value={name} onChangeText={setName} />
        <TextInput style={s.input} placeholder="Description" value={description} onChangeText={setDescription} />
        <TextInput style={s.input} placeholder="Emoji icon" value={icon} onChangeText={setIcon} maxLength={2} />
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
        <TextInput style={s.input} placeholder="Grades, e.g. 9,10 (optional)" value={grades} onChangeText={setGrades} keyboardType="numbers-and-punctuation" />
      </Card>
      <SettingsForm value={settings} onChange={setSettings} />
      <Button label="Create group" onPress={create} disabled={!name.trim()} />
    </ScrollView>
  );
}
