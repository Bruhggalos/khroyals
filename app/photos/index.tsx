/**
 * Photo gallery: albums of school photos (events, games, field trips), newest first, by category,
 * with search. Approved accounts see albums shown to everyone; staff also see staff-only ones and
 * start albums. gallery.manage holders keep the category list.
 */
import { useCallback, useEffect, useState } from 'react';
import { Alert, Platform, ScrollView, Text, View } from 'react-native';
import { Stack, router, useFocusEffect } from 'expo-router';
import {
  deleteCategory, errorText, isSchoolStaff, listAlbums, listCategories, live, myAccess, saveCategory, session,
  type GalleryAlbum, type GalleryCategory, type Person,
} from '../../src/api/connect';
import { schoolToday } from '../../src/calendar/past';
import { AlbumCard } from '../../src/gallery/AlbumCard';
import { AlbumForm, chip } from '../../src/gallery/AlbumForm';
import { Button, C, Card, Field, H, Loading, P, s } from '../../src/ui';

export default function Photos() {
  const [albums, setAlbums] = useState<GalleryAlbum[] | null>(null);
  const [categories, setCategories] = useState<GalleryCategory[]>([]);
  const [person, setPerson] = useState<Person | null>(null);
  const [perms, setPerms] = useState<string[]>([]);
  const [category, setCategory] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [creating, setCreating] = useState(false);
  const [editCats, setEditCats] = useState(false);

  const load = useCallback(async () => {
    try {
      const p = live ? await session() : null;
      setPerson(p);
      if (!p || p.pending) { setAlbums([]); return; }
      const [cats, list] = await Promise.all([listCategories(), listAlbums({ category, search })]);
      setCategories(cats);
      setAlbums(list);
      if (isSchoolStaff(p)) setPerms((await myAccess().catch(() => null))?.permissions ?? []);
    } catch (e) {
      Alert.alert('Photos didn\'t load', errorText(e));
      setAlbums([]);
    }
  }, [category, search]);
  useFocusEffect(useCallback(() => { load(); }, [load]));
  // Search as you type, a moment after the last key.
  useEffect(() => { const t = setTimeout(load, 300); return () => clearTimeout(t); }, [search]); // eslint-disable-line react-hooks/exhaustive-deps

  const header = <Stack.Screen options={{ title: 'Photos' }} />;
  if (!albums) return <>{header}<Loading /></>;
  if (!person || person.pending) {
    return <View style={[s.screen, s.pad]}>{header}<Card><P>Log in on the Connect tab to see the school's photos.</P></Card></View>;
  }
  const staff = isSchoolStaff(person);
  const iconOf = new Map(categories.map((c) => [c.id, `${c.icon} ${c.name}`]));
  const filtering = !!category || !!search.trim();

  return (
    <ScrollView style={s.screen} contentContainerStyle={[s.pad, { gap: 12 }]} keyboardShouldPersistTaps="handled">
      {header}
      <P muted>Photos from school events, games and trips, shared by teachers and staff.</P>
      {staff && !creating && <Button label="+ New album" onPress={() => setCreating(true)} />}
      {creating && (
        <AlbumForm categories={categories} canNotify={perms.includes('push.send')}
          initial={{ title: '', description: '', takenOn: schoolToday(), categoryId: category ?? categories[0]?.id ?? null, visibility: 'everyone' }}
          onSaved={(id) => { setCreating(false); router.push(`/photos/${id}?add=1`); }} onCancel={() => setCreating(false)} />
      )}

      <Field label="Search photos" placeholder="Fall Fest, volleyball, 3rd grade…" value={search} onChangeText={setSearch}
        autoCorrect={false} returnKeyType="search" />
      <View style={[s.row, { flexWrap: 'wrap', gap: 6 }]}>
        {chip('All', !category, () => setCategory(null))}
        {categories.map((c) => chip(`${c.icon} ${c.name}`, category === c.id, () => setCategory(category === c.id ? null : c.id), c.id))}
      </View>
      {perms.includes('gallery.manage') && (
        <Text style={{ color: C.primary, fontWeight: '700' }} onPress={() => setEditCats(!editCats)}>{editCats ? 'Done with categories' : 'Edit categories'}</Text>
      )}
      {editCats && <CategoryEditor categories={categories} onChange={load} />}

      {!albums.length ? (
        <Card><P muted>{filtering ? 'No albums match. Try another word or category.' : `No photos yet.${staff ? ' Start an album above.' : ''}`}</P></Card>
      ) : (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12 }}>
          {albums.map((a) => <AlbumCard key={a.id} a={a} category={a.categoryId ? iconOf.get(a.categoryId) : undefined} />)}
        </View>
      )}
    </ScrollView>
  );
}

/** gallery.manage: add, rename and remove categories (a removed category's albums move to another). */
function CategoryEditor({ categories, onChange }: { categories: GalleryCategory[]; onChange: () => void }) {
  const [name, setName] = useState('');
  const [icon, setIcon] = useState('📷');
  const fail = (e: unknown) => Alert.alert('Not saved', errorText(e));
  const [editing, setEditing] = useState<{ id: string; name: string; icon: string } | null>(null);
  const saveEdit = () => editing && saveCategory(editing).then(() => { setEditing(null); onChange(); }).catch(fail);
  const remove = (c: GalleryCategory) => {
    const to = categories.find((x) => x.id !== c.id);
    if (!to) return;
    const go = () => deleteCategory(c.id, to.id).then(onChange).catch(fail);
    const msg = `Its albums move to ${to.icon} ${to.name}.`;
    if (Platform.OS === 'web') { if (globalThis.confirm?.(`Remove ${c.name}?\n\n${msg}`)) go(); return; }
    Alert.alert(`Remove ${c.name}?`, msg, [{ text: 'Cancel', style: 'cancel' }, { text: 'Remove', style: 'destructive', onPress: go }]);
  };
  return (
    <Card style={{ gap: 8 }}>
      <H>Categories</H>
      {categories.map((c) => editing?.id === c.id ? (
        <View key={c.id} style={[s.row, { alignItems: 'flex-end' }]}>
          <Field label="Icon" value={editing.icon} onChangeText={(icon) => setEditing({ ...editing, icon })} style={{ width: 70 }} maxLength={4} />
          <Field label="Name" value={editing.name} onChangeText={(name) => setEditing({ ...editing, name })} style={{ flex: 1, minWidth: 0 }} maxLength={40} />
          <Text style={{ color: C.primary, fontWeight: '700', paddingBottom: 12 }} onPress={saveEdit}>Save</Text>
        </View>
      ) : (
        <View key={c.id} style={[s.row, { justifyContent: 'space-between' }]}>
          <Text style={{ color: C.ink, flex: 1 }}>{c.icon} {c.name}</Text>
          <Text style={{ color: C.primary, marginRight: 16 }} onPress={() => setEditing({ id: c.id, name: c.name, icon: c.icon })}>Rename</Text>
          {categories.length > 1 && <Text style={{ color: C.danger }} onPress={() => remove(c)}>Remove</Text>}
        </View>
      ))}
      <View style={[s.row, { alignItems: 'flex-end' }]}>
        <Field label="Icon" value={icon} onChangeText={setIcon} style={{ width: 70 }} maxLength={4} />
        <Field label="New category" placeholder="Robotics" value={name} onChangeText={setName} style={{ flex: 1, minWidth: 0 }} maxLength={40} />
      </View>
      <Button label="Add category" kind="ghost" disabled={!name.trim()}
        onPress={() => saveCategory({ name, icon }).then(() => { setName(''); setIcon('📷'); onChange(); }).catch(fail)} />
    </Card>
  );
}
