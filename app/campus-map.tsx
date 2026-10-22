/**
 * Campus Map: the school's map (pinch to zoom on iPhone), with its places numbered, and
 * the list of places with directions or a call button. Until the school adds its map
 * (src/campus/campus.ts) it shows the places only. Signed in, the car line pickup spot
 * is one of them. Open to everyone.
 */
import { useEffect, useState } from 'react';
import { Image, Linking, Platform, Pressable, ScrollView, Text, View } from 'react-native';
import { Stack } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { carlineConfig, live, me, type CarlineConfig } from '../src/api/connect';
import { CAMPUS_ADDRESS, CAMPUS_IMAGE, PLACES, type Place } from '../src/campus/campus';
import { hoursLabel } from '../src/carline/format';
import { directionsUrl } from '../src/sports/events';
import { GOLD, NAVY } from '../src/sports/ui';
import { C, Card, H, P, s } from '../src/ui';

export default function CampusMap() {
  const [carline, setCarline] = useState<CarlineConfig | null>(null);
  useEffect(() => {
    if (live && me()) carlineConfig().then(setCarline).catch(() => setCarline(null));
  }, []);

  const places: Place[] = [
    ...PLACES,
    ...(carline?.latitude && carline.longitude ? [{
      id: 'carline', name: 'Car line pickup', icon: 'car-outline' as const, directionsTo: `${carline.latitude},${carline.longitude}`,
      detail: `School days, ${hoursLabel(carline.start, carline.end)}. Check in from the Car Line app when you get there.`,
    }] : []),
  ];
  const go = (to: string) => { const url = directionsUrl(null, to, Platform.OS); if (url) Linking.openURL(url); };
  const aspect = CAMPUS_IMAGE ? (() => { const r = Image.resolveAssetSource(CAMPUS_IMAGE); return r?.width && r.height ? r.width / r.height : 4 / 3; })() : 4 / 3;

  return (
    <ScrollView style={s.screen} contentContainerStyle={s.pad}>
      <Stack.Screen options={{ title: 'Campus Map' }} />
      {CAMPUS_IMAGE ? (
        <View style={{ borderRadius: 16, overflow: 'hidden', borderWidth: 1, borderColor: C.line, backgroundColor: '#fff' }}>
          <ScrollView maximumZoomScale={4} minimumZoomScale={1} centerContent bouncesZoom
            showsHorizontalScrollIndicator={false} showsVerticalScrollIndicator={false}>
            <View style={{ width: '100%', aspectRatio: aspect }}>
              <Image source={CAMPUS_IMAGE} style={{ width: '100%', height: '100%' }} resizeMode="contain" accessibilityLabel="Map of the Kingdom Heights campus" />
              {places.map((p, i) => p.pin && (
                <View key={p.id} accessible={false} style={{ position: 'absolute', left: `${p.pin.x * 100}%`, top: `${p.pin.y * 100}%`,
                  width: 26, height: 26, marginLeft: -13, marginTop: -13, borderRadius: 13, backgroundColor: NAVY, borderWidth: 2, borderColor: GOLD,
                  alignItems: 'center', justifyContent: 'center' }}>
                  <Text style={{ color: '#fff', fontWeight: '900', fontSize: 12 }}>{i + 1}</Text>
                </View>
              ))}
            </View>
          </ScrollView>
        </View>
      ) : (
        <Card style={{ alignItems: 'center', gap: 10, paddingVertical: 22, backgroundColor: NAVY, borderColor: NAVY }}>
          <Ionicons name="map" size={54} color={GOLD} />
          <H><Text style={{ color: '#fff' }}>Campus map coming soon</Text></H>
          <Text style={{ color: 'rgba(255,255,255,0.85)', textAlign: 'center' }}>
            The school will add a map of the buildings here. Until then, here's how to find what you need.
          </Text>
          <Pressable onPress={() => go(CAMPUS_ADDRESS)} accessibilityRole="button"
            style={({ pressed }) => [s.row, { gap: 8, paddingHorizontal: 18, paddingVertical: 11, borderRadius: 999, backgroundColor: GOLD }, pressed && { opacity: 0.8 }]}>
            <Ionicons name="navigate" size={18} color="#fff" />
            <Text style={{ color: '#fff', fontWeight: '800', fontSize: 15 }}>Directions to campus</Text>
          </Pressable>
        </Card>
      )}

      {places.map((p, i) => (
        <Card key={p.id} style={{ gap: 8 }}>
          <View style={s.row}>
            <View style={{ width: 34, height: 34, borderRadius: 10, backgroundColor: `${C.primary}1A`, alignItems: 'center', justifyContent: 'center' }}>
              {CAMPUS_IMAGE && p.pin ? <Text style={{ color: C.primary, fontWeight: '900' }}>{i + 1}</Text>
                : <Ionicons name={p.icon} size={18} color={C.primary} />}
            </View>
            <Text style={{ flex: 1, fontSize: 17, fontWeight: '800', color: C.ink }}>{p.name}</Text>
          </View>
          <P muted>{p.detail}</P>
          <View style={[s.row, { gap: 16 }]}>
            {!!p.directionsTo && (
              <Text style={{ color: C.primary, fontWeight: '800' }} onPress={() => go(p.directionsTo!)} accessibilityRole="link">Directions ›</Text>
            )}
            {!!p.phone && (
              <Text style={{ color: C.primary, fontWeight: '800' }} onPress={() => Linking.openURL(`tel:${p.phone!.replace(/\D/g, '')}`)} accessibilityRole="link">
                Call ›
              </Text>
            )}
          </View>
        </Card>
      ))}
    </ScrollView>
  );
}
