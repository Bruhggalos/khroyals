/** Pick a grade, K2 to 12th. */
import { Text, View } from 'react-native';
import { C } from '../ui';
import { GRADES } from './grades';

export function GradePicker({ value, onChange, label = 'Grade' }: { value: number | null; onChange: (g: number) => void; label?: string }) {
  return (
    <View style={{ gap: 4 }}>
      <Text style={{ fontSize: 13, fontWeight: '700', color: C.ink }}>{label}</Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
        {GRADES.map((g) => {
          const on = value === g.value;
          return (
            <Text key={g.value} onPress={() => onChange(g.value)} accessibilityRole="button" accessibilityLabel={g.label}
              accessibilityState={{ selected: on }}
              style={{ minWidth: 38, textAlign: 'center', paddingHorizontal: 8, paddingVertical: 6, borderRadius: 999, overflow: 'hidden',
                borderWidth: 1, borderColor: on ? C.primary : C.line, backgroundColor: on ? C.primary : '#fff', color: on ? '#fff' : C.ink,
                fontWeight: '600', fontSize: 13 }}>
              {g.short}
            </Text>
          );
        })}
      </View>
    </View>
  );
}
