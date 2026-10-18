/**
 * Add or edit a game, practice, tryout or tournament (coaches and sports managers).
 * Everyone involved in the sport is told when it's added, moved or cancelled.
 */
import { useEffect, useState } from 'react';
import { Alert, Platform, ScrollView, Text, View } from 'react-native';
import { Stack, router, useLocalSearchParams } from 'expo-router';
import {
  cancelSportEvent, deleteSportEvent, listSports, saveSportEvent, sportSchedule, type SportEvent, type SportEventKind, type SportSeason,
} from '../../src/api/connect';
import { activeSeasons, parseTime, schoolToday, timeLabel } from '../../src/sports/seasons';
import { Button, C, Card, Field, Loading, P, s } from '../../src/ui';

const KINDS: [SportEventKind, string][] = [['game', 'Game'], ['practice', 'Practice'], ['tryout', 'Tryouts'], ['tournament', 'Tournament'], ['other', 'Other']];
const isDate = (v: string) => /^\d{4}-\d{2}-\d{2}$/.test(v);
/** A date and a typed time on the phone's clock → ISO. */
const toIso = (date: string, time: string) => {
  const t = parseTime(time);
  if (!isDate(date) || !t) return null;
  const [y, m, d] = date.split('-').map(Number);
  return new Date(y, m - 1, d, t.h, t.m).toISOString();
};
const localDate = (iso: string) => { const d = new Date(iso); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
const localTime = (iso: string) => { const d = new Date(iso); return timeLabel(d.getHours(), d.getMinutes()); };

export default function EditSportEvent() {
  const { sport, id } = useLocalSearchParams<{ sport: string; id?: string }>();
  const [seasons, setSeasons] = useState<SportSeason[] | null>(null);
  const [existing, setExisting] = useState<SportEvent | null>(null);
  const [season, setSeason] = useState<string | null>(null);
  const [kind, setKind] = useState<SportEventKind>('game');
  const [title, setTitle] = useState('');
  const [date, setDate] = useState(schoolToday());
  const [start, setStart] = useState('');
  const [end, setEnd] = useState('');
  const [location, setLocation] = useState('');
  const [home, setHome] = useState<boolean | null>(true);
  const [notes, setNotes] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    listSports().then(async ({ seasons: all }) => {
      const active = activeSeasons(all, sport, schoolToday());
      setSeasons(active);
      setSeason((cur) => cur ?? active[0]?.id ?? null);
      if (id) {
        const e = (await sportSchedule(all.filter((x) => x.sportId === sport).map((x) => x.id))).find((x) => x.id === id);
        if (e) {
          setExisting(e); setSeason(e.seasonId); setKind(e.kind); setTitle(e.title); setDate(localDate(e.startsAt));
          setStart(localTime(e.startsAt)); setEnd(e.endsAt ? localTime(e.endsAt) : ''); setLocation(e.location ?? '');
          setHome(e.home); setNotes(e.notes);
        }
      }
    });
  }, [sport, id]);
  if (!seasons) return <Loading />;
  if (!seasons.length) return (
    <View style={[s.screen, s.pad]}><Stack.Screen options={{ title: 'Schedule' }} /><Card><P>Add a season first, from the sport's page.</P></Card></View>
  );

  const startsAt = toIso(date, start);
  const endsAt = end.trim() ? toIso(date, end) : null;
  const valid = !!season && !!title.trim() && !!startsAt && (!end.trim() || (!!endsAt && endsAt >= startsAt));
  const withHome = kind === 'game' || kind === 'tournament';
  const save = () => {
    setBusy(true);
    saveSportEvent({
      id: id ?? null, seasonId: season!, kind, title, startsAt: startsAt!, endsAt,
      location: location.trim() || null, home: withHome ? home : null, notes,
    }).then(() => router.back()).catch((e) => Alert.alert('Sports', e.message)).finally(() => setBusy(false));
  };
  const ask = (q: string, ok: string, go: () => void) => {
    if (Platform.OS === 'web') { if (globalThis.confirm?.(q)) go(); return; }
    Alert.alert(q, 'Everyone following or registered is told.', [{ text: 'Back', style: 'cancel' }, { text: ok, style: 'destructive', onPress: go }]);
  };
  const pill = (label: string, on: boolean, onPress: () => void) => (
    <Text key={label} onPress={onPress} accessibilityRole="button" accessibilityState={{ selected: on }}
      style={{ paddingHorizontal: 12, paddingVertical: 6, borderRadius: 999, overflow: 'hidden', borderWidth: 1, borderColor: on ? C.primary : C.line,
        backgroundColor: on ? C.primary : '#fff', color: on ? '#fff' : C.ink, fontWeight: '600' }}>{label}</Text>
  );

  return (
    <ScrollView style={s.screen} contentContainerStyle={s.pad} keyboardShouldPersistTaps="handled">
      <Stack.Screen options={{ title: id ? 'Edit schedule' : 'Add to the schedule' }} />
      <Card style={{ gap: 12 }}>
        {seasons.length > 1 && (
          <View style={{ gap: 6 }}>
            <Text style={{ fontSize: 13, fontWeight: '700', color: C.ink }}>Season</Text>
            <View style={[s.row, { flexWrap: 'wrap' }]}>{seasons.map((x) => pill(x.name, season === x.id, () => setSeason(x.id)))}</View>
          </View>
        )}
        <View style={[s.row, { flexWrap: 'wrap' }]}>{KINDS.map(([k, l]) => pill(l, kind === k, () => setKind(k)))}</View>
        <Field label="Title" placeholder={kind === 'game' ? 'vs. Westminster Christian' : kind === 'practice' ? 'Practice' : 'Title'}
          value={title} onChangeText={setTitle} maxLength={120} />
        <Field label="Date" hint="YYYY-MM-DD" value={date} onChangeText={setDate} autoCapitalize="none" />
        <View style={[s.row, { alignItems: 'flex-start' }]}>
          <Field label="Starts" placeholder="4:30 PM" value={start} onChangeText={setStart} autoCapitalize="none" style={{ flex: 1 }} />
          <Field label="Ends (optional)" placeholder="6:00 PM" value={end} onChangeText={setEnd} autoCapitalize="none" style={{ flex: 1 }} />
        </View>
        <Field label="Where" placeholder="KH Gym" value={location} onChangeText={setLocation} />
        {withHome && <View style={[s.row]}>{pill('Home', home === true, () => setHome(true))}{pill('Away', home === false, () => setHome(false))}</View>}
        <Field label="Notes (optional)" placeholder="Bus leaves at 3:15, wear white…" value={notes} onChangeText={setNotes} multiline />
      </Card>
      <Button label={busy ? 'Saving…' : 'Save'} disabled={busy || !valid} onPress={save} />
      {!startsAt && start.trim() !== '' && <P muted>Times like 4:30 PM or 16:30.</P>}
      {existing && (
        <Button label={existing.cancelled ? 'Put it back on' : 'Cancel this'} kind="ghost"
          onPress={() => ask(existing.cancelled ? 'Put it back on the schedule?' : `Cancel ${existing.title}?`, existing.cancelled ? 'Put back' : 'Cancel it',
            () => cancelSportEvent(existing.id, !existing.cancelled).then(() => router.back()).catch((e) => Alert.alert('Sports', e.message)))} />
      )}
      {existing && (
        <Button label="Delete" kind="ghost" onPress={() => ask(`Delete ${existing.title}?`, 'Delete',
          () => deleteSportEvent(existing.id).then(() => router.back()).catch((e) => Alert.alert('Sports', e.message)))} />
      )}
    </ScrollView>
  );
}
