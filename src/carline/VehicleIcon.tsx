/** A vehicle at a glance: its type's icon on a disc of its color. */
import { View } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { C } from '../ui';
import { colorInfo, kindInfo } from './vehicles';

export function VehicleIcon({ kind, color, size = 40 }: { kind: string | null | undefined; color: string | null | undefined; size?: number }) {
  const c = colorInfo(color);
  // Light colors get a dark icon and an outline so they show on white cards.
  const light = !!c.ring;
  return (
    <View accessible={false} style={{
      width: size, height: size, borderRadius: size / 2, backgroundColor: c.hex, alignItems: 'center', justifyContent: 'center',
      borderWidth: light ? 1 : 0, borderColor: C.line,
    }}>
      <MaterialCommunityIcons name={kindInfo(kind).icon} size={size * 0.55} color={light ? C.ink : '#fff'} />
    </View>
  );
}
