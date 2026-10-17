import { useMemo } from 'react';
import { View } from 'react-native';
import { qrRows } from './qr';

/** A QR code about `size` points wide, black on white with the standard quiet zone around it. */
export function QrCode({ value, size = 240, label }: { value: string; size?: number; label?: string }) {
  const { size: modules, rows } = useMemo(() => qrRows(value), [value]);
  const QUIET = 4;  // modules of white border scanners expect
  const cell = Math.max(1, Math.floor(size / (modules + QUIET * 2)));  // whole points keep edges crisp
  return (
    <View accessible accessibilityRole="image" accessibilityLabel={label ?? `QR code for ${value}`}
      style={{ backgroundColor: '#fff', padding: cell * QUIET, borderRadius: 12 }}>
      {rows.map((runs, r) => (
        <View key={r} style={{ flexDirection: 'row', height: cell }}>
          {runs.map((run, i) => (
            <View key={i} style={{ width: run.length * cell, backgroundColor: run.dark ? '#000' : '#fff' }} />
          ))}
        </View>
      ))}
    </View>
  );
}
