/**
 * One photo album: a grid of thumbnails; tap one for the full picture (swipe-free: arrows and
 * Close). Staff add photos; whoever posted a photo, the album's creator or gallery.manage remove.
 * A grade album says who sees it; the people on it can take it off their account, and gallery.manage
 * holders see the list of people and put people on or take them off.
 */
import { useCallback, useEffect, useState } from 'react';
import { Alert, Image, Modal, Platform, Pressable, ScrollView, Text, useWindowDimensions, View } from 'react-native';
import { Stack, router, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import {
  addGalleryPhotos, deleteAlbum, deleteGalleryPhoto, errorText, getAlbum, isSchoolStaff, leaveAlbum, listCategories, me, myAccess, saveAlbum, session,
  type GalleryAlbum, type GalleryCategory, type GalleryPhoto,
} from '../../src/api/connect';
import { albumDate } from '../../src/gallery/AlbumCard';
import { AlbumForm } from '../../src/gallery/AlbumForm';
import { AlbumPeople } from '../../src/gallery/AlbumPeople';
import { schoolYearLabel } from '../../src/gallery/years';
import { gradeLabel } from '../../src/comms/grades';
import { pickGalleryPhotos } from '../../src/photos';
import { Button, C, Card, Loading, P, s } from '../../src/ui';

const confirm = (title: string, msg: string, onYes: () => void, yes = 'Delete') => {
  if (Platform.OS === 'web') { if (globalThis.confirm?.(`${title}\n\n${msg}`)) onYes(); return; }
  Alert.alert(title, msg, [{ text: 'Cancel', style: 'cancel' }, { text: yes, style: 'destructive', onPress: onYes }]);
};

/** "the 3rd grade", "Kindergarten", "K4". */
const gradeWords = (g: number) => (g <= 0 ? gradeLabel(g) : `the ${gradeLabel(g)} grade`);

export default function Album() {
  const { id, add } = useLocalSearchParams<{ id: string; add?: string }>();
  const [data, setData] = useState<{ album: GalleryAlbum; photos: GalleryPhoto[] } | null | undefined>(undefined);
  const [staff, setStaff] = useState(false);
  const [manage, setManage] = useState(false);
  const [canNotify, setCanNotify] = useState(false);
  const [categories, setCategories] = useState<GalleryCategory[]>([]);
  const [editing, setEditing] = useState(false);
  const [open, setOpen] = useState<number | null>(null);
  const [upload, setUpload] = useState<{ done: number; of: number } | null>(null);
  const { width } = useWindowDimensions();

  const load = useCallback(async () => {
    try {
      const p = await session();
      setStaff(isSchoolStaff(p));
      if (isSchoolStaff(p)) {
        const perms = (await myAccess().catch(() => null))?.permissions ?? [];
        setManage(perms.includes('gallery.manage'));
        setCanNotify(perms.includes('push.send'));
      }
      const [album, cats] = await Promise.all([getAlbum(id), listCategories()]);
      setCategories(cats);
      setData(album);
    } catch (e) {
      Alert.alert('Album didn\'t load', errorText(e));
      setData(null);
    }
  }, [id]);
  useEffect(() => { load(); }, [load]);

  const addPhotos = async () => {
    try {
      const picked = await pickGalleryPhotos();
      if (!picked.length) return;
      setUpload({ done: 0, of: picked.length });
      await addGalleryPhotos(id, picked, (done) => setUpload({ done, of: picked.length }));
      await load();
    } catch (e) { Alert.alert('Photos not added', errorText(e)); }
    setUpload(null);
  };
  // Straight after creating an album, open the picker.
  useEffect(() => { if (add && data && staff && !data.photos.length) addPhotos(); }, [add, !!data, staff]); // eslint-disable-line react-hooks/exhaustive-deps

  const header = <Stack.Screen options={{ title: data?.album.title ?? 'Photos' }} />;
  if (data === undefined) return <>{header}<Loading /></>;
  if (!data) return <View style={[s.screen, s.pad]}>{header}<P>That album isn't here anymore.</P></View>;
  const { album, photos } = data;
  const started = album.createdBy === me()?.id;
  const canRemove = (ph: GalleryPhoto) => staff && (ph.createdBy === me()?.id || started || manage);
  const leave = () => confirm('Remove this album from your Photos?',
    `You won't see "${album.title}" anymore. The school office can give it back.`,
    () => leaveAlbum(album.id).then(() => router.back()).catch((e) => Alert.alert('Not removed', errorText(e))), 'Remove');
  const cat = categories.find((c) => c.id === album.categoryId);
  const showToEveryone = () => saveAlbum({
    id: album.id, title: album.title, description: album.description, takenOn: album.takenOn,
    categoryId: album.categoryId ?? categories[0]?.id ?? '', visibility: 'everyone',
  }).then(load).catch((e) => Alert.alert('Not changed', errorText(e)));
  const cols = width > 900 ? 5 : width > 600 ? 4 : 3;
  const size = (Math.min(width, 1100) - 32 - (cols - 1) * 4) / cols;
  const shown = open != null ? photos[open] : null;

  return (
    <ScrollView style={s.screen} contentContainerStyle={[s.pad, { gap: 12 }]}>
      {header}
      {editing ? (
        <AlbumForm categories={categories} canNotify={canNotify}
          initial={{ id: album.id, title: album.title, description: album.description, takenOn: album.takenOn, categoryId: album.categoryId, visibility: album.visibility, grade: album.grade }}
          onSaved={() => { setEditing(false); load(); }} onCancel={() => setEditing(false)} />
      ) : (
        <View style={{ gap: 2 }}>
          {!!cat && <Text style={{ color: C.accent, fontSize: 12, fontWeight: '800' }}>{`${cat.icon} ${cat.name}`.toUpperCase()}</Text>}
          <Text style={{ fontSize: 22, fontWeight: '800', color: C.ink }}>{album.title}</Text>
          <P muted>{albumDate(album.takenOn)} · {photos.length} photo{photos.length === 1 ? '' : 's'}</P>
          {!!album.description && <P>{album.description}</P>}
        </View>
      )}
      {album.grade !== null && !editing && (
        <Card style={{ gap: 6 }}>
          <Text style={{ fontWeight: '700', color: C.ink }}>🎒 {gradeLabel(album.grade)} · {schoolYearLabel(album.schoolYear)}</Text>
          <P muted>{`Only staff and the families of ${gradeWords(album.grade)} in ${schoolYearLabel(album.schoolYear)} see this album: `
            + 'the students and their parents. They keep it after the year ends.'}</P>
          {album.mine && <Text style={{ color: C.danger, fontWeight: '600' }} accessibilityRole="button" onPress={leave}>Remove from my Photos</Text>}
        </Card>
      )}
      {album.grade !== null && manage && !editing && <AlbumPeople albumId={album.id} />}
      {staff && album.visibility === 'staff' && !editing && (
        <Card style={{ gap: 6, backgroundColor: '#FFFBEB' }}>
          <Text style={{ fontWeight: '700', color: C.ink }}>🔒 Staff only</Text>
          <P muted>Families and students can't see this album yet.</P>
          {(started || manage) && <Button label="Show to everyone at school" onPress={() => showToEveryone()} />}
        </Card>
      )}
      {staff && (started || manage) && !editing && (
        <Text style={{ color: C.primary, fontWeight: '700' }} accessibilityRole="button" onPress={() => setEditing(true)}>Edit album (name, category, who sees it)</Text>
      )}
      {staff && (upload
        ? <Card><P>Uploading {upload.done} of {upload.of}…</P></Card>
        : <Button label="+ Add photos" onPress={addPhotos} />)}
      {!photos.length && <Card><P muted>No photos in this album yet.</P></Card>}
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 4 }}>
        {photos.map((ph, i) => (
          <Pressable key={ph.id} onPress={() => setOpen(i)} accessibilityRole="imagebutton" accessibilityLabel={ph.caption || `Photo ${i + 1}`}>
            <Image source={{ uri: ph.thumb }} style={{ width: size, height: size, borderRadius: 6, backgroundColor: C.line }} resizeMode="cover" />
          </Pressable>
        ))}
      </View>
      {staff && (started || manage) && (
        <Text style={{ color: C.danger, fontWeight: '600', marginTop: 8 }} accessibilityRole="button"
          onPress={() => confirm('Delete this album?', `"${album.title}" and its ${photos.length} photos will be removed for everyone.`,
            () => deleteAlbum(album.id).then(() => router.back()).catch((e) => Alert.alert('Not deleted', errorText(e))))}>Delete album…</Text>
      )}

      <Modal visible={!!shown} animationType="fade" transparent={false} onRequestClose={() => setOpen(null)}>
        {shown && (
          <View style={{ flex: 1, backgroundColor: '#000' }}>
            <View style={[s.row, { justifyContent: 'space-between', paddingHorizontal: 16, paddingTop: Platform.OS === 'ios' ? 54 : 16, paddingBottom: 8 }]}>
              <Text style={{ color: '#fff', fontWeight: '700' }}>{open! + 1} of {photos.length}</Text>
              <Pressable onPress={() => setOpen(null)} accessibilityRole="button" accessibilityLabel="Close" hitSlop={12}>
                <Ionicons name="close" size={30} color="#fff" />
              </Pressable>
            </View>
            <View style={{ flex: 1 }}>
              <Image source={{ uri: shown.full }} style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }} resizeMode="contain"
                accessibilityLabel={shown.caption || 'Photo'} />
            </View>
            <View style={{ padding: 16, paddingBottom: 34, gap: 10 }}>
              {!!shown.caption && <Text style={{ color: '#fff', textAlign: 'center' }}>{shown.caption}</Text>}
              <View style={[s.row, { justifyContent: 'space-between' }]}>
                <Pressable onPress={() => setOpen(Math.max(0, open! - 1))} disabled={open === 0} accessibilityRole="button" accessibilityLabel="Previous photo" hitSlop={12}>
                  <Ionicons name="chevron-back-circle" size={44} color={open === 0 ? '#555' : '#fff'} />
                </Pressable>
                {canRemove(shown) && (
                  <Text style={{ color: '#FCA5A5', fontWeight: '700' }} accessibilityRole="button"
                    onPress={() => confirm('Delete this photo?', 'It will be removed for everyone.', () => {
                      const at = open!;
                      deleteGalleryPhoto(shown.id).then(load).then(() => setOpen(photos.length > 1 ? Math.min(at, photos.length - 2) : null))
                        .catch((e) => Alert.alert('Not deleted', errorText(e)));
                    })}>Delete photo</Text>
                )}
                <Pressable onPress={() => setOpen(Math.min(photos.length - 1, open! + 1))} disabled={open === photos.length - 1}
                  accessibilityRole="button" accessibilityLabel="Next photo" hitSlop={12}>
                  <Ionicons name="chevron-forward-circle" size={44} color={open === photos.length - 1 ? '#555' : '#fff'} />
                </Pressable>
              </View>
            </View>
          </View>
        )}
      </Modal>
    </ScrollView>
  );
}
