import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, Text as RNText, StyleSheet, View, type TextProps, type ViewStyle } from 'react-native';
import site from '../mock-db/site/site.json';

/** Kingdom Heights brand palette (sampled from the logo and khroyals.com). */
export const C = {
  primary: site.school.colors.primary, // royal blue: section bands, links, active tab
  navy: site.school.colors.navy,       // crest outline and wordmark
  accent: site.school.colors.accent,   // red: buttons and highlighted words
  ink: site.school.colors.ink,
  bg: '#FAFAF9',
  card: '#FFFFFF',
  muted: '#5F6170',
  line: '#E6E5EA',
  danger: '#B42318',
};

/** Montserrat is the site's typeface; each weight is a separate font family. */
const WEIGHTS: Record<string, string> = {
  '100': '100Thin', '200': '200ExtraLight', '300': '300Light', '400': '400Regular', normal: '400Regular',
  '500': '500Medium', '600': '600SemiBold', '700': '700Bold', bold: '700Bold', '800': '800ExtraBold', '900': '900Black',
};
export const font = (weight: keyof typeof WEIGHTS = '400', italic = false) =>
  `Montserrat_${WEIGHTS[weight]}${italic ? '_Italic' : ''}`;

/** Drop-in for react-native's Text that maps fontWeight/fontStyle onto Montserrat. */
export function Text({ style, ...rest }: TextProps) {
  const flat = StyleSheet.flatten(style) ?? {};
  const family = flat.fontFamily ?? font(String(flat.fontWeight ?? '400'), flat.fontStyle === 'italic');
  return <RNText {...rest} style={[style, { fontFamily: family, fontWeight: 'normal', fontStyle: 'normal' }]} />;
}

/** Header style shared by every stack and tab screen: off-white bar, navy type, like the site header. */
export const header = {
  headerStyle: { backgroundColor: C.bg },
  headerTintColor: C.navy,
  headerTitleStyle: { fontFamily: font('700'), color: C.navy },
  headerShadowVisible: false,
} as const;

/** Tiny data hook around the mock API. */
export function useLoad<T>(fn: () => Promise<T>, deps: unknown[] = []) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [n, setN] = useState(0);
  useEffect(() => {
    let live = true;
    fn().then((d) => live && setData(d)).catch((e) => live && setError(String(e.message ?? e)));
    return () => { live = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, n]);
  return { data, error, reload: () => setN((x) => x + 1) };
}

export const Loading = () => <View style={s.center}><ActivityIndicator color={C.primary} /></View>;

export const Card = ({ children, style, onPress }: { children: React.ReactNode; style?: ViewStyle; onPress?: () => void }) =>
  onPress ? <Pressable onPress={onPress} style={({ pressed }) => [s.card, style, pressed && { opacity: 0.85 }]}>{children}</Pressable>
          : <View style={[s.card, style]}>{children}</View>;

export const H = ({ children }: { children: React.ReactNode }) => <Text style={s.h}>{children}</Text>;
export const P = ({ children, muted }: { children: React.ReactNode; muted?: boolean }) =>
  <Text style={[s.p, muted && { color: C.muted }]}>{children}</Text>;

export const Chip = ({ label, color = C.primary }: { label: string; color?: string }) =>
  <View style={[s.chip, { backgroundColor: color + '14' }]}><Text style={[s.chipT, { color }]}>{label}</Text></View>;

/** Red pill button, as on khroyals.com ("SCHEDULE A TOUR"). */
export const Button = ({ label, onPress, kind = 'primary', disabled }: { label: string; onPress: () => void; kind?: 'primary' | 'ghost'; disabled?: boolean }) =>
  <Pressable disabled={disabled} onPress={onPress}
    style={({ pressed }) => [s.btn, kind === 'ghost' && { backgroundColor: 'transparent', borderWidth: 1.5, borderColor: C.navy }, disabled && { opacity: 0.4 }, pressed && { opacity: 0.85 }]}>
    <Text style={[s.btnT, kind === 'ghost' && { color: C.navy }]}>{label}</Text>
  </Pressable>;

/** Section heading in the site's style: light uppercase with one red italic word ("WHAT PARENTS ARE SAYING"). */
export const SectionTitle = ({ before = '', accent, after = '', light }: { before?: string; accent: string; after?: string; light?: boolean }) =>
  <Text style={[s.section, light && { color: '#fff' }]}>
    {before}<Text style={{ color: C.accent, fontWeight: '300', fontStyle: 'italic' }}>{accent}</Text>
    <Text style={{ fontWeight: '700' }}>{after}</Text>
  </Text>;

export const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: C.bg },
  pad: { padding: 16, gap: 12 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  card: { backgroundColor: C.card, borderRadius: 14, padding: 14, borderWidth: 1, borderColor: C.line, gap: 6 },
  h: { fontSize: 18, fontWeight: '700', color: C.navy },
  section: { fontSize: 22, fontWeight: '300', color: C.navy, textTransform: 'uppercase', textAlign: 'center' },
  p: { fontSize: 15, lineHeight: 21, color: C.ink },
  chip: { alignSelf: 'flex-start', borderRadius: 999, paddingHorizontal: 9, paddingVertical: 3 },
  chipT: { fontSize: 12, fontWeight: '600' },
  btn: { backgroundColor: C.accent, borderRadius: 999, paddingVertical: 12, paddingHorizontal: 20, alignItems: 'center' },
  btnT: { color: '#fff', fontWeight: '500', fontSize: 15, textTransform: 'uppercase', letterSpacing: 0.3 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  input: { backgroundColor: '#fff', borderWidth: 1, borderColor: C.line, borderRadius: 10, padding: 12, fontSize: 15, color: C.ink, fontFamily: font('400') },
});
