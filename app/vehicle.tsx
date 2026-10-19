/**
 * Add or edit a vehicle you drive to pickup (My profile → My vehicles, or the Car Line):
 * make, type and color. Car line staff see "Silver Honda SUV" on the board when you
 * arrive. `?id=` edits one of yours.
 */
import { useEffect, useState } from 'react';
import { Alert, Platform, Pressable, ScrollView, Text, View } from 'react-native';
import { Stack, router, useLocalSearchParams } from 'expo-router';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { deleteVehicle, live, myVehicles, saveVehicle, session, chooseVehicle, type Person } from '../src/api/connect';
import { COMMON_MAKES, VEHICLE_COLORS, VEHICLE_KINDS, vehicleLabel, type VehicleColor, type VehicleKind } from '../src/carline/vehicles';
import { Button, C, Card, Field, Loading, P, s } from '../src/ui';

const Section = ({ eyebrow, title, children }: { eyebrow: string; title: string; children: React.ReactNode }) => (
  <Card style={{ gap: 12 }}>
    <View style={{ gap: 2 }}>
      <Text style={{ fontSize: 13, fontWeight: '800', letterSpacing: 1.2, color: C.muted }}>{eyebrow}</Text>
      <Text style={{ fontSize: 17, fontWeight: '700', color: C.ink }}>{title}</Text>
    </View>
    {children}
  </Card>
);

/** Four to a row, like the type and color pickers in a car app. */
const grid = { flexDirection: 'row', flexWrap: 'wrap', rowGap: 14 } as const;
const cell = { width: '25%', alignItems: 'center', gap: 6 } as const;

export default function VehicleScreen() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  const [me, setMe] = useState<Person | null | undefined>(undefined);
  const [loaded, setLoaded] = useState(!id);
  const [make, setMake] = useState('');
  const [kind, setKind] = useState<VehicleKind | null>(null);
  const [color, setColor] = useState<VehicleColor | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    session().then(setMe).catch(() => setMe(null));
    if (!id) return;
    myVehicles().then((list) => {
      const v = list.find((x) => x.id === id);
      if (v) { setMake(v.make); setKind(v.kind); setColor(v.color); }
      setLoaded(true);
    }).catch(() => setLoaded(true));
  }, [id]);

  const header = <Stack.Screen options={{ title: id ? 'Edit vehicle' : 'Add a vehicle' }} />;
  if (me === undefined || !loaded) return <>{header}<Loading /></>;
  if (!live || !me || me.pending || me.schoolRole === 'student') return (
    <View style={[s.screen, s.pad]}>{header}<Card><P>Sign in with an approved parent, family or staff account to save the vehicles you drive to pickup.</P></Card></View>
  );

  const typed = make.trim().toLowerCase();
  const picks = COMMON_MAKES.filter((m) => m.toLowerCase() !== typed && (!typed || m.toLowerCase().startsWith(typed))).slice(0, 8);
  const ready = !!make.trim() && !!kind && !!color;

  const save = () => {
    if (!ready) return;
    setBusy(true);
    saveVehicle({ id: id ?? null, make, kind: kind!, color: color! })
      // A vehicle you just added is the one you're about to drive: it becomes the default.
      .then((v) => (id ? undefined : chooseVehicle(v.id)))
      .then(() => router.back())
      .catch((e) => Alert.alert('Vehicle', e.message))
      .finally(() => setBusy(false));
  };
  const remove = () => {
    const go = () => deleteVehicle(id!).then(() => router.back()).catch((e) => Alert.alert('Vehicle', e.message));
    if (Platform.OS === 'web') { if (globalThis.confirm?.('Delete this vehicle?')) go(); return; }
    Alert.alert('Delete this vehicle?', 'Pickups you already made in it stay on record.', [
      { text: 'Cancel', style: 'cancel' }, { text: 'Delete', style: 'destructive', onPress: go },
    ]);
  };

  return (
    <ScrollView style={s.screen} contentContainerStyle={s.pad} keyboardShouldPersistTaps="handled">
      {header}
      <Text style={{ fontSize: 22, fontWeight: '800', color: C.ink, textAlign: 'center', marginVertical: 4 }}>What vehicle will you be driving?</Text>

      <Section eyebrow="VEHICLE MAKE" title="Add your vehicle make">
        <Field label="Make" placeholder="Toyota, Honda, Ford…" value={make} onChangeText={setMake} maxLength={40} autoCapitalize="words" />
        {picks.length > 0 && (
          <View style={[s.row, { flexWrap: 'wrap', gap: 8 }]}>
            {picks.map((m) => (
              <Text key={m} onPress={() => setMake(m)} accessibilityRole="button"
                style={{ paddingHorizontal: 12, paddingVertical: 6, borderRadius: 999, overflow: 'hidden', borderWidth: 1, borderColor: C.line, color: C.ink }}>
                {m}
              </Text>
            ))}
          </View>
        )}
      </Section>

      <Section eyebrow="VEHICLE TYPE" title="Select your vehicle type">
        <View style={grid}>
          {VEHICLE_KINDS.map((k) => {
            const on = kind === k.key;
            return (
              <Pressable key={k.key} onPress={() => setKind(k.key)} style={cell} accessibilityRole="button" accessibilityLabel={k.label} accessibilityState={{ selected: on }}>
                <View style={{ width: 64, height: 64, borderRadius: 32, borderWidth: 2, borderColor: on ? C.primary : C.ink,
                  backgroundColor: on ? C.primary : '#fff', alignItems: 'center', justifyContent: 'center' }}>
                  <MaterialCommunityIcons name={k.icon} size={32} color={on ? '#fff' : C.ink} />
                </View>
                <Text style={{ color: on ? C.primary : C.ink, fontWeight: on ? '700' : '400', fontSize: 13 }}>{k.label}</Text>
              </Pressable>
            );
          })}
        </View>
      </Section>

      <Section eyebrow="VEHICLE COLOR" title="Select a color for your vehicle">
        <View style={grid}>
          {VEHICLE_COLORS.map((c) => {
            const on = color === c.key;
            return (
              <Pressable key={c.key} onPress={() => setColor(c.key)} style={cell} accessibilityRole="button" accessibilityLabel={c.label} accessibilityState={{ selected: on }}>
                <View style={{ width: 60, height: 60, borderRadius: 30, padding: 3, borderWidth: 3, borderColor: on ? C.primary : 'transparent' }}>
                  <View style={{ flex: 1, borderRadius: 27, backgroundColor: c.hex, borderWidth: c.ring ? 1 : 0, borderColor: C.line,
                    alignItems: 'center', justifyContent: 'center' }}>
                    {on && <Ionicons name="checkmark" size={24} color={c.ring ? C.ink : '#fff'} />}
                  </View>
                </View>
                <Text style={{ color: on ? C.primary : C.ink, fontWeight: on ? '700' : '400', fontSize: 13 }}>{c.label}</Text>
              </Pressable>
            );
          })}
        </View>
      </Section>

      {ready && <P muted>Car line staff will see: {vehicleLabel({ make, kind: kind!, color: color! })}</P>}
      <Button label={busy ? 'Saving…' : 'Save vehicle'} disabled={busy || !ready} onPress={save} />
      {!ready && <P muted>Add the make, then pick a type and a color.</P>}
      {!!id && <Button label="Delete vehicle" kind="ghost" onPress={remove} />}
    </ScrollView>
  );
}
