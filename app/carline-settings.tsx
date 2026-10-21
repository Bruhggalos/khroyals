/**
 * Car line settings, for car line leads and the office: the pickup spot
 * (stand there and tap "Use my location"), how close parents must be to
 * announce, the hours, and "Open now" for drills, demos or early dismissal.
 */
import { useCallback, useState } from 'react';
import { Alert, Linking, ScrollView, Switch, Text, View } from 'react-native';
import { Stack, useFocusEffect } from 'expo-router';
import { carlineConfig, carlineOpenNow, carlineSetConfig, type CarlineConfig } from '../src/api/connect';
import { hoursLabel } from '../src/carline/format';
import { currentSpot, distanceLabel } from '../src/carline/location';
import { Button, C, Card, Field, H, Loading, P, s } from '../src/ui';
import { TimeField } from '../src/forms/DateTimeField';

const FEET = 3.28084;
const RADII_FT = [100, 250, 500, 1000, 2000];
const TIME = /^([01]?\d|2[0-3]):[0-5]\d$/;

export default function CarlineSettings() {
  const [cfg, setCfg] = useState<CarlineConfig | null>(null);
  const [lat, setLat] = useState('');
  const [lng, setLng] = useState('');
  const [feet, setFeet] = useState('');
  const [start, setStart] = useState('');
  const [end, setEnd] = useState('');
  const [busy, setBusy] = useState(false);
  const [accuracy, setAccuracy] = useState<number | null>(null);

  const show = (c: CarlineConfig) => {
    setCfg(c); setLat(String(c.latitude)); setLng(String(c.longitude)); setFeet(String(Math.round(c.radius * FEET)));
    setStart(c.start); setEnd(c.end);
  };
  useFocusEffect(useCallback(() => { carlineConfig().then(show).catch((e) => Alert.alert('Car line', e.message)); }, []));

  const header = <Stack.Screen options={{ title: 'Car line settings' }} />;
  if (!cfg) return <>{header}<Loading /></>;
  if (!cfg.canEdit) return <View style={[s.screen, s.pad]}>{header}<Card><P>Only car line leads and the school office can change these settings.</P></Card></View>;

  const step = async (fn: () => Promise<CarlineConfig>, done?: string) => {
    setBusy(true);
    try { show(await fn()); if (done) Alert.alert('Saved', done); } catch (e: any) { Alert.alert('Car line', e.message); } finally { setBusy(false); }
  };
  const here = async () => {
    setBusy(true);
    try {
      const at = await currentSpot();
      setLat(at.lat.toFixed(6)); setLng(at.lng.toFixed(6)); setAccuracy(at.accuracy);
    } catch (e: any) { Alert.alert('Location', e.message); } finally { setBusy(false); }
  };
  const save = () => {
    const la = Number(lat), lo = Number(lng), ft = Number(feet);
    if (!Number.isFinite(la) || !Number.isFinite(lo) || !lat || !lng) return Alert.alert('Pickup spot', 'Set the pickup location first.');
    if (!(ft >= 65 && ft <= 9800)) return Alert.alert('Radius', 'Choose between 65 feet and about 2 miles (9,800 feet).');
    if (!TIME.test(start) || !TIME.test(end)) return Alert.alert('Hours', 'Choose when the car line opens and closes.');
    if (end <= start) return Alert.alert('Hours', 'The car line has to close after it opens.');
    step(() => carlineSetConfig({ latitude: la, longitude: lo, radius: ft / FEET, start, end }), 'Parents can now announce from within ' + `${Math.round(ft)} feet of this spot.`);
  };
  const open = cfg.line.state === 'open' && cfg.line.openedNow;

  return (
    <ScrollView style={s.screen} contentContainerStyle={s.pad} keyboardShouldPersistTaps="handled">
      {header}
      <Card>
        <H>Pickup spot</H>
        <P muted>Stand where parents pull up (or the middle of the car line) and tap Use my location. Parents can only announce from within the radius.</P>
        <Button kind="ghost" label={busy ? 'Getting location…' : '📍 Use my location'} disabled={busy} onPress={here} />
        {accuracy != null && <P muted>Accurate to about {distanceLabel(accuracy)}. Wait a moment outdoors and tap again for a better fix.</P>}
        <View style={s.row}>
          <Field label="Latitude" keyboardType="numbers-and-punctuation" value={lat} onChangeText={setLat} style={{ flex: 1, minWidth: 0 }} />
          <Field label="Longitude" keyboardType="numbers-and-punctuation" value={lng} onChangeText={setLng} style={{ flex: 1, minWidth: 0 }} />
        </View>
        <Text style={{ color: C.primary, fontWeight: '600' }}
          onPress={() => Linking.openURL(`https://www.google.com/maps/search/?api=1&query=${lat},${lng}`)}>Check it on a map ↗</Text>
      </Card>

      <Card>
        <H>Radius</H>
        <P muted>How close parents must be to announce they're here.</P>
        <View style={[s.row, { flexWrap: 'wrap', gap: 6 }]}>
          {RADII_FT.map((f) => (
            <Text key={f} onPress={() => setFeet(String(f))} accessibilityRole="button"
              style={{ paddingHorizontal: 10, paddingVertical: 6, borderRadius: 999, overflow: 'hidden', borderWidth: 1, borderColor: C.line,
                backgroundColor: Number(feet) === f ? C.primary : '#fff', color: Number(feet) === f ? '#fff' : C.ink, fontWeight: '600' }}>
              {f.toLocaleString()} ft
            </Text>
          ))}
        </View>
        <Field label="Radius in feet" keyboardType="number-pad" value={feet} onChangeText={setFeet}
          hint={Number(feet) > 0 ? `About ${distanceLabel(Number(feet) / FEET)} (${Math.round(Number(feet) / FEET)} m)` : undefined} />
      </Card>

      <Card>
        <H>Hours</H>
        <P muted>School days only; days marked No School on the school calendar stay closed.</P>
        <View style={s.row}>
          <TimeField label="Opens" value={start} onChange={setStart} initial="14:45" style={{ flex: 1, minWidth: 0 }} />
          <TimeField label="Closes" value={end} onChange={setEnd} initial="15:30" style={{ flex: 1, minWidth: 0 }} />
        </View>
        {TIME.test(start) && TIME.test(end) && <P muted>{hoursLabel(start, end)}</P>}
      </Card>

      <Button label={busy ? 'Saving…' : 'Save settings'} disabled={busy} onPress={save} />

      <Card>
        <View style={[s.row, { justifyContent: 'space-between' }]}>
          <View style={{ flex: 1 }}>
            <H>Open now</H>
            <P muted>Opens the line for the rest of today: drills, demos or early dismissal. It goes back to the normal hours tomorrow.</P>
          </View>
          <Switch value={!!open} disabled={busy} trackColor={{ true: C.primary }} accessibilityLabel="Open the car line now"
            onValueChange={(v) => step(() => carlineOpenNow(v))} />
        </View>
      </Card>
    </ScrollView>
  );
}
