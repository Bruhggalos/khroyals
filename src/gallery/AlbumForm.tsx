/** Start or change a photo album: name, about, date, category, and who sees it. */
import { useState } from 'react';
import { Alert, Switch, Text, View } from 'react-native';
import { errorText, saveAlbum, type AlbumVisibility, type GalleryCategory } from '../api/connect';
import { DateField } from '../forms/DateTimeField';
import { Button, C, Card, Field, H, P, s } from '../ui';

export type AlbumDraft = { id?: string | null; title: string; description: string; takenOn: string; categoryId: string | null; visibility: AlbumVisibility };

export const chip = (label: string, on: boolean, onPress: () => void, key = label) => (
  <Text key={key} onPress={onPress} accessibilityRole="button" accessibilityState={{ selected: on }}
    style={{ paddingHorizontal: 12, paddingVertical: 6, borderRadius: 999, overflow: 'hidden', borderWidth: 1,
      borderColor: on ? C.primary : C.line, backgroundColor: on ? C.primary : '#fff', color: on ? '#fff' : C.ink, fontSize: 14 }}>{label}</Text>
);

export function AlbumForm({ initial, categories, canNotify, onSaved, onCancel }: {
  initial: AlbumDraft; categories: GalleryCategory[]; canNotify: boolean; onSaved: (id: string) => void; onCancel: () => void;
}) {
  const [d, setD] = useState(initial);
  const [notify, setNotify] = useState(false);
  const [busy, setBusy] = useState(false);
  const set = (patch: Partial<AlbumDraft>) => setD({ ...d, ...patch });
  const save = async () => {
    if (!d.categoryId) return Alert.alert('Category', 'Pick a category for the album.');
    setBusy(true);
    try { onSaved(await saveAlbum({ ...d, categoryId: d.categoryId, notify: notify && d.visibility === 'everyone' })); }
    catch (e) { Alert.alert('Album not saved', errorText(e)); }
    setBusy(false);
  };
  return (
    <Card style={{ gap: 10 }}>
      <H>{d.id ? 'Change album' : 'New album'}</H>
      <Field label="Album name" placeholder="Fall Fest 2026" value={d.title} onChangeText={(title) => set({ title })} maxLength={80} />
      <Field label="About (optional)" placeholder="Bounce houses, face painting and the dunk tank" value={d.description}
        onChangeText={(description) => set({ description })} multiline maxLength={500} />
      <DateField label="Date" value={d.takenOn} onChange={(takenOn) => set({ takenOn })} />
      <View style={{ gap: 6 }}>
        <Text style={{ fontSize: 13, fontWeight: '700', color: C.ink }}>Category</Text>
        <View style={[s.row, { flexWrap: 'wrap', gap: 6 }]}>
          {categories.map((c) => chip(`${c.icon} ${c.name}`, d.categoryId === c.id, () => set({ categoryId: c.id }), c.id))}
        </View>
      </View>
      <View style={{ gap: 6 }}>
        <Text style={{ fontSize: 13, fontWeight: '700', color: C.ink }}>Who sees it</Text>
        <View style={[s.row, { flexWrap: 'wrap', gap: 6 }]}>
          {chip('👪 Everyone at school', d.visibility === 'everyone', () => set({ visibility: 'everyone' }))}
          {chip('🔒 Staff only', d.visibility === 'staff', () => set({ visibility: 'staff' }))}
        </View>
        <P muted>{d.visibility === 'everyone'
          ? 'Parents, students, family and staff can see it.'
          : 'Only teachers and staff can see it, e.g. while you put it together. Switch to Everyone when it\'s ready.'}</P>
      </View>
      {canNotify && d.visibility === 'everyone' && (
        <View style={[s.row, { justifyContent: 'space-between' }]}>
          <View style={{ flex: 1 }}>
            <Text style={{ fontWeight: '600', color: C.ink }}>Let everyone know</Text>
            <P muted>Sends a notification to every family and staff member.</P>
          </View>
          <Switch value={notify} onValueChange={setNotify} trackColor={{ true: C.primary }} accessibilityLabel="Let everyone know" />
        </View>
      )}
      <Button label={busy ? 'Saving…' : d.id ? 'Save changes' : 'Create and add photos'} onPress={save}
        disabled={busy || !d.title.trim() || !d.takenOn || !d.categoryId} />
      <Text style={{ color: C.muted, textAlign: 'center' }} onPress={onCancel}>Cancel</Text>
    </Card>
  );
}
