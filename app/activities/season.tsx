/**
 * Add or edit a season (coaches/directors and activity managers): dates, an online sign-up window,
 * eligible grades, details and an info link. Followers are told when sign-ups open.
 */
import { useEffect, useState } from 'react';
import { Alert, Platform, ScrollView, Text, View } from 'react-native';
import { Stack, router, useLocalSearchParams } from 'expo-router';
import { deleteSeason, listSports, saveSeason } from '../../src/api/connect';
import { GradePicker } from '../../src/comms/GradePicker';
import { Button, C, Card, Field, Loading, P, s } from '../../src/ui';

const isDate = (v: string) => /^\d{4}-\d{2}-\d{2}$/.test(v);

export default function EditSeason() {
  const { sport, id } = useLocalSearchParams<{ sport: string; id?: string }>();
  const [loaded, setLoaded] = useState(!id);
  const [name, setName] = useState('');
  const [starts, setStarts] = useState('');
  const [ends, setEnds] = useState('');
  const [signup, setSignup] = useState(true);
  const [opens, setOpens] = useState(new Date().toISOString().slice(0, 10));
  const [closes, setCloses] = useState('');
  const [minGrade, setMinGrade] = useState<number | null>(6);
  const [maxGrade, setMaxGrade] = useState<number | null>(12);
  const [details, setDetails] = useState('');
  const [infoUrl, setInfoUrl] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!id) return;
    listSports().then(({ seasons }) => {
      const se = seasons.find((x) => x.id === id);
      if (se) {
        setName(se.name); setStarts(se.startsOn); setEnds(se.endsOn); setSignup(!!se.signupOpens);
        if (se.signupOpens) setOpens(se.signupOpens);
        setCloses(se.signupCloses ?? ''); setMinGrade(se.minGrade); setMaxGrade(se.maxGrade);
        setDetails(se.details); setInfoUrl(se.infoUrl ?? '');
      }
      setLoaded(true);
    });
  }, [id]);
  if (!loaded) return <Loading />;

  const datesOk = isDate(starts) && isDate(ends) && ends >= starts && (!signup || (isDate(opens) && isDate(closes) && closes >= opens));
  const save = () => {
    setBusy(true);
    saveSeason({
      id: id ?? null, sportId: sport, name, startsOn: starts, endsOn: ends,
      signupOpens: signup ? opens : null, signupCloses: signup ? closes : null,
      minGrade, maxGrade, details, infoUrl: infoUrl.trim() || null,
    }).then(() => router.back()).catch((e) => Alert.alert('Activities', e.message)).finally(() => setBusy(false));
  };
  const remove = () => {
    const go = () => deleteSeason(id!).then(() => router.back()).catch((e) => Alert.alert('Activities', e.message));
    if (Platform.OS === 'web') { if (globalThis.confirm?.(`Delete ${name}?`)) go(); return; }
    Alert.alert(`Delete ${name}?`, 'Its schedule and sign-ups go too.', [{ text: 'Cancel', style: 'cancel' }, { text: 'Delete', style: 'destructive', onPress: go }]);
  };
  const toggle = (label: string, on: boolean, onPress: () => void) => (
    <Text key={label} onPress={onPress} accessibilityRole="button" accessibilityState={{ selected: on }}
      style={{ paddingHorizontal: 12, paddingVertical: 6, borderRadius: 999, overflow: 'hidden', borderWidth: 1, borderColor: on ? C.primary : C.line,
        backgroundColor: on ? C.primary : '#fff', color: on ? '#fff' : C.ink, fontWeight: '600' }}>{label}</Text>
  );

  return (
    <ScrollView style={s.screen} contentContainerStyle={s.pad} keyboardShouldPersistTaps="handled">
      <Stack.Screen options={{ title: id ? 'Edit season' : 'New season' }} />
      <Card style={{ gap: 12 }}>
        <Field label="Season" placeholder="Fall 2026, Varsity, Spring production…" value={name} onChangeText={setName} maxLength={80} />
        <View style={[s.row, { alignItems: 'flex-start' }]}>
          <Field label="Starts" placeholder="2026-08-03" value={starts} onChangeText={setStarts} autoCapitalize="none" style={{ flex: 1 }} />
          <Field label="Ends" placeholder="2026-10-31" value={ends} onChangeText={setEnds} autoCapitalize="none" style={{ flex: 1 }} />
        </View>
        <P muted>Dates as YYYY-MM-DD.</P>
      </Card>
      <Card style={{ gap: 12 }}>
        <Text style={{ fontSize: 13, fontWeight: '700', color: C.ink }}>Online sign-up</Text>
        <View style={[s.row, { flexWrap: 'wrap' }]}>
          {toggle('Parents sign up in the app', signup, () => setSignup(true))}
          {toggle('No online sign-up', !signup, () => setSignup(false))}
        </View>
        {signup && (
          <View style={[s.row, { alignItems: 'flex-start' }]}>
            <Field label="Opens" value={opens} onChangeText={setOpens} autoCapitalize="none" style={{ flex: 1 }} />
            <Field label="Closes" placeholder="2026-07-31" value={closes} onChangeText={setCloses} autoCapitalize="none" style={{ flex: 1 }} />
          </View>
        )}
        {signup && <P muted>Followers are told the day sign-ups open. You approve each sign-up from the activity's page.</P>}
      </Card>
      <Card style={{ gap: 12 }}>
        <GradePicker label={`Youngest grade${minGrade == null ? ' (any)' : ''}`} value={minGrade} onChange={(g) => setMinGrade(g === minGrade ? null : g)} />
        <GradePicker label={`Oldest grade${maxGrade == null ? ' (any)' : ''}`} value={maxGrade} onChange={(g) => setMaxGrade(g === maxGrade ? null : g)} />
        <P muted>Tap a selected grade again for "any".</P>
      </Card>
      <Card style={{ gap: 12 }}>
        <Field label="Details" placeholder="Tryouts or auditions, practice or rehearsal times, fees, forms…" value={details} onChangeText={setDetails} multiline style={{ minHeight: 100 }} />
        <Field label="Information link (optional)" placeholder="https://www.khroyals.com/s/…pdf" value={infoUrl} onChangeText={setInfoUrl}
          autoCapitalize="none" keyboardType="url" />
      </Card>
      <Button label={busy ? 'Saving…' : 'Save season'} disabled={busy || !name.trim() || !datesOk} onPress={save} />
      {!datesOk && (starts || ends) ? <P muted>Check the dates: each must end on or after it starts.</P> : null}
      {id && <Button label="Delete season" kind="ghost" onPress={remove} />}
    </ScrollView>
  );
}
