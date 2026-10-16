import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Platform, Pressable, StyleSheet, Text, View, type ViewStyle } from 'react-native';
import site from '../content/site/site.json';

export const C = {
  primary: site.school.colors.primary,
  accent: site.school.colors.secondary,
  ink: site.school.colors.ink,
  bg: '#F5F7FC',
  card: '#FFFFFF',
  muted: '#5B6577',
  line: '#E1E6F0',
  danger: '#B42318',
};

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

/** Yes/no question before something that's hard to undo; window.confirm on the web. */
export function ask(title: string, message: string, yes: string, onYes: () => void) {
  if (Platform.OS === 'web') { if (globalThis.confirm?.(`${title}\n\n${message}`)) onYes(); return; }
  Alert.alert(title, message, [{ text: 'Not now', style: 'cancel' }, { text: yes, onPress: onYes }]);
}

export const Loading = () => <View style={s.center}><ActivityIndicator color={C.primary} /></View>;

export const Card = ({ children, style, onPress }: { children: React.ReactNode; style?: ViewStyle; onPress?: () => void }) =>
  onPress ? <Pressable onPress={onPress} style={({ pressed }) => [s.card, style, pressed && { opacity: 0.85 }]}>{children}</Pressable>
          : <View style={[s.card, style]}>{children}</View>;

export const H = ({ children }: { children: React.ReactNode }) => <Text style={s.h}>{children}</Text>;
export const P = ({ children, muted }: { children: React.ReactNode; muted?: boolean }) =>
  <Text style={[s.p, muted && { color: C.muted }]}>{children}</Text>;

export const Chip = ({ label, color = C.primary }: { label: string; color?: string }) =>
  <View style={[s.chip, { backgroundColor: color + '1A' }]}><Text style={[s.chipT, { color }]}>{label}</Text></View>;

export const Button = ({ label, onPress, kind = 'primary', disabled }: { label: string; onPress: () => void; kind?: 'primary' | 'ghost'; disabled?: boolean }) =>
  <Pressable disabled={disabled} onPress={onPress}
    style={[s.btn, kind === 'ghost' && { backgroundColor: 'transparent', borderWidth: 1, borderColor: C.line }, disabled && { opacity: 0.4 }]}>
    <Text style={[s.btnT, kind === 'ghost' && { color: C.primary }]}>{label}</Text>
  </Pressable>;

export const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: C.bg },
  pad: { padding: 16, gap: 12 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  card: { backgroundColor: C.card, borderRadius: 14, padding: 14, borderWidth: 1, borderColor: C.line, gap: 6 },
  h: { fontSize: 18, fontWeight: '700', color: C.ink },
  p: { fontSize: 15, lineHeight: 21, color: C.ink },
  chip: { alignSelf: 'flex-start', borderRadius: 999, paddingHorizontal: 9, paddingVertical: 3 },
  chipT: { fontSize: 12, fontWeight: '600' },
  btn: { backgroundColor: C.primary, borderRadius: 10, paddingVertical: 11, paddingHorizontal: 16, alignItems: 'center' },
  btnT: { color: '#fff', fontWeight: '700', fontSize: 15 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  input: { backgroundColor: '#fff', borderWidth: 1, borderColor: C.line, borderRadius: 10, padding: 12, fontSize: 15, color: C.ink },
});
