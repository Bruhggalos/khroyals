/** Number tiles for post and group stats. */
import { Text, View } from 'react-native';
import { C } from '../ui';

/** Whole-number percentage, 0 when there's nothing to divide by. */
export const pct = (n: number, of: number) => (of > 0 ? Math.round((n / of) * 100) : 0);

export function Tile({ value, label, hint }: { value: string | number; label: string; hint?: string }) {
  return (
    <View style={{ flexGrow: 1, flexBasis: 140, backgroundColor: '#fff', borderRadius: 12, borderWidth: 1, borderColor: C.line, padding: 12, gap: 2 }}>
      <Text style={{ fontSize: 26, fontWeight: '800', color: C.ink }}>{value}</Text>
      <Text style={{ fontSize: 13, fontWeight: '700', color: C.ink }}>{label}</Text>
      {hint ? <Text style={{ fontSize: 12, color: C.muted }}>{hint}</Text> : null}
    </View>
  );
}
