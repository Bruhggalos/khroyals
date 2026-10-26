/**
 * Photo gallery: albums of school photos (events, games, field trips), newest first. Every
 * approved account sees them; staff start albums and add photos.
 */
import { useCallback, useState } from 'react';
import { Alert, ScrollView, Switch, Text, View } from 'react-native';
import { Stack, router, useFocusEffect } from 'expo-router';
import {
  errorText, isSchoolStaff, listAlbums, live, myAccess, saveAlbum, session, type GalleryAlbum, type Person,
} from '../../src/api/connect';
import { schoolToday } from '../../src/calendar/past';
import { DateField } from '../../src/forms/DateTimeField';
import { AlbumCard } from '../../src/gallery/AlbumCard';
import { Button, C, Card, Field, H, Loading, P, s } from '../../src/ui';

export default function Photos() {
  const [albums, setAlbums] = useState<GalleryAlbum[] | null>(null);
  const [person, setPerson] = useState<Person | null>(null);
  const [canNotify, setCanNotify] = useState(false);
  const [draft, setDraft] = useState<{ title: string; description: string; takenOn: string; notify: boolean } | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const p = live ? await session() : null;
      setPerson(p);
      setAlbums(p && !p.pending ? await listAlbums() : []);
      if (isSchoolStaff(p)) setCanNotify(!!(await myAccess().catch(() => null))?.permissions.includes('push.send'));
    } catch (e) {
      Alert.alert('Photos didn\'t load', errorText(e));
      setAlbums([]);
    }
  }, []);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  const create = async () => {
    if (!draft) return;
    setBusy(true);
    try {
      const id = await saveAlbum(draft);
      setDraft(null);
      router.push(`/photos/${id}?add=1`);
    } catch (e) { Alert.alert('Album not created', errorText(e)); }
    setBusy(false);
  };

  const header = <Stack.Screen options={{ title: 'Photos' }} />;
  if (!albums) return <>{header}<Loading /></>;
  if (!person || person.pending) {
    return <View style={[s.screen, s.pad]}>{header}<Card><P>Log in on the Connect tab to see the school's photos.</P></Card></View>;
  }
  const staff = isSchoolStaff(person);

  return (
    <ScrollView style={s.screen} contentContainerStyle={[s.pad, { gap: 12 }]} keyboardShouldPersistTaps="handled">
      {header}
      <P muted>Photos from school events, games and trips, shared by teachers and staff.</P>
      {staff && !draft && <Button label="+ New album" onPress={() => setDraft({ title: '', description: '', takenOn: schoolToday(), notify: false })} />}
      {draft && (
        <Card style={{ gap: 10 }}>
          <H>New album</H>
          <Field label="Album name" placeholder="Fall Fest 2026" value={draft.title} onChangeText={(title) => setDraft({ ...draft, title })} maxLength={80} />
          <Field label="About (optional)" placeholder="Bounce houses, face painting and the dunk tank" value={draft.description}
            onChangeText={(description) => setDraft({ ...draft, description })} multiline maxLength={500} />
          <DateField label="Date" value={draft.takenOn} onChange={(takenOn) => setDraft({ ...draft, takenOn })} />
          {canNotify && (
            <View style={[s.row, { justifyContent: 'space-between' }]}>
              <View style={{ flex: 1 }}>
                <Text style={{ fontWeight: '600', color: C.ink }}>Let everyone know</Text>
                <P muted>Sends a notification to every family and staff member.</P>
              </View>
              <Switch value={draft.notify} onValueChange={(notify) => setDraft({ ...draft, notify })} trackColor={{ true: C.primary }} accessibilityLabel="Let everyone know" />
            </View>
          )}
          <Button label={busy ? 'Creating…' : 'Create and add photos'} onPress={create} disabled={busy || !draft.title.trim() || !draft.takenOn} />
          <Text style={{ color: C.muted, textAlign: 'center' }} onPress={() => setDraft(null)}>Cancel</Text>
        </Card>
      )}
      {!albums.length ? <Card><P muted>No photos yet.{staff ? ' Start an album above.' : ''}</P></Card> : (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12 }}>
          {albums.map((a) => <AlbumCard key={a.id} a={a} />)}
        </View>
      )}
    </ScrollView>
  );
}
