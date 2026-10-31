/**
 * Photo gallery, by school year: each grade's album (only its families and staff see it; staff in the Standard
 * view see just their own children's, as a parent would), then the year's other albums (events, games, field
 * trips) by category. Search looks through every year. Staff start albums, and everyone adds photos to the ones
 * they can see; gallery.manage holders keep the category list.
 */
import { useCallback, useEffect, useState } from 'react';
import { Alert, Platform, ScrollView, Text, View } from 'react-native';
import { Stack, router, useFocusEffect } from 'expo-router';
import {
  deleteCategory, errorText, isSchoolStaff, listAlbums, listCategories, live, myAccess, saveCategory, session,
  type GalleryAlbum, type GalleryCategory, type Person,
} from '../../src/api/connect';
import { schoolToday } from '../../src/calendar/past';
import { AlbumCard, GradeTile } from '../../src/gallery/AlbumCard';
import { AlbumForm, chip } from '../../src/gallery/AlbumForm';
import { schoolYearLabel, schoolYearOf } from '../../src/gallery/years';
import { useStaffView } from '../../src/staffView';
import { Button, C, Card, Field, H, Loading, P, s } from '../../src/ui';

export default function Photos() {
  const [albums, setAlbums] = useState<GalleryAlbum[] | null>(null);
  const [categories, setCategories] = useState<GalleryCategory[]>([]);
  const [person, setPerson] = useState<Person | null>(null);
  const [perms, setPerms] = useState<string[]>([]);
  const [year, setYear] = useState(() => schoolYearOf(schoolToday()));
  const [category, setCategory] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [creating, setCreating] = useState(false);
  const [editCats, setEditCats] = useState(false);
  const staffView = useStaffView(person);

  const load = useCallback(async () => {
    try {
      const p = live ? await session() : null;
      setPerson(p);
      if (!p || p.pending) { setAlbums([]); return; }
      const [cats, list] = await Promise.all([listCategories(), listAlbums({ search })]);
      setCategories(cats);
      setAlbums(list);
      if (isSchoolStaff(p)) setPerms((await myAccess().catch(() => null))?.permissions ?? []);
    } catch (e) {
      Alert.alert('Photos didn\'t load', errorText(e));
      setAlbums([]);
    }
  }, [search]);
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
  // Staff in the Standard view see grade albums as a parent does: only the ones on their account.
  const shown = staffView ? albums : albums.filter((a) => a.grade === null || a.mine);
  const searching = !!search.trim();
  const thisYear = schoolYearOf(schoolToday());
  const years = [...new Set([thisYear, ...shown.map((a) => a.schoolYear)])].sort((a, b) => b - a);
  const inView = searching ? shown : shown.filter((a) => a.schoolYear === year);
  const grades = searching ? [] : inView.filter((a) => a.grade !== null).sort((a, b) => a.grade! - b.grade!);
  const rest = inView.filter((a) => searching || a.grade === null);
  const restCats = categories.filter((c) => rest.some((a) => a.categoryId === c.id));
  const others = rest.filter((a) => !category || a.categoryId === category);

  return (
    <ScrollView style={s.screen} contentContainerStyle={[s.pad, { gap: 12 }]} keyboardShouldPersistTaps="handled">
      {header}
      <P muted>Photos from each grade and from school events, games and trips. Open an album to add your own.</P>
      {staff && !creating && <Button label="+ New album" onPress={() => setCreating(true)} />}
      {creating && (
        <AlbumForm categories={categories} canNotify={perms.includes('push.send')}
          initial={{ title: '', description: '', takenOn: schoolToday(), categoryId: category ?? categories.find((c) => c.name === 'Events')?.id ?? categories[0]?.id ?? null, visibility: 'everyone' }}
          onSaved={(id) => { setCreating(false); router.push(`/photos/${id}?add=1`); }} onCancel={() => setCreating(false)} />
      )}

      <Field label="Search photos" placeholder="Harvest Fest, volleyball, 3rd grade…" value={search} onChangeText={setSearch}
        autoCorrect={false} returnKeyType="search" />
      {!searching && (
        <View style={[s.row, { flexWrap: 'wrap', gap: 6 }]}>
          {years.map((y) => chip(y === thisYear ? `This year · ${schoolYearLabel(y)}` : schoolYearLabel(y), y === year, () => { setYear(y); setCategory(null); }, String(y)))}
        </View>
      )}

      {grades.length > 0 && (
        <View style={{ gap: 8 }}>
          <H>🎒 Grades</H>
          <P muted>{staffView ? "Every grade's album. Families see only the grades their children are in." : "Your children's grades. Only their classmates' families and staff see these."}</P>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            {grades.map((a) => <GradeTile key={a.id} a={a} />)}
          </View>
        </View>
      )}

      <View style={{ gap: 8 }}>
        {!searching && <H>📷 {grades.length ? 'Events and more' : 'Albums'}</H>}
        {restCats.length > 1 && (
          <View style={[s.row, { flexWrap: 'wrap', gap: 6 }]}>
            {chip('All', !category, () => setCategory(null))}
            {restCats.map((c) => chip(`${c.icon} ${c.name}`, category === c.id, () => setCategory(category === c.id ? null : c.id), c.id))}
          </View>
        )}
        {perms.includes('gallery.manage') && (
          <Text style={{ color: C.primary, fontWeight: '700' }} onPress={() => setEditCats(!editCats)}>{editCats ? 'Done with categories' : 'Edit categories'}</Text>
        )}
        {editCats && <CategoryEditor categories={categories} onChange={load} />}
        {!others.length ? (
          <Card><P muted>{searching ? 'No albums match. Try another word.'
            : `No ${grades.length ? 'other ' : ''}albums for ${schoolYearLabel(year)} yet.${staff ? ' Start one above.' : ''}`}</P></Card>
        ) : (
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12 }}>
            {others.map((a) => <AlbumCard key={a.id} a={a} category={a.categoryId ? iconOf.get(a.categoryId) : undefined} />)}
          </View>
        )}
      </View>
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
