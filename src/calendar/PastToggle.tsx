/** "Show 12 past events" / "Hide past events": every calendar keeps past events out of view until asked. */
import { Pressable, Text } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { C } from '../ui';

/** How past events look when shown: greyed out. */
export const PAST_STYLE = { opacity: 0.45 } as const;

export function PastToggle({ count, shown, onToggle, noun = 'events' }: { count: number; shown: boolean; onToggle: () => void; noun?: string }) {
  if (count === 0) return null;
  return (
    <Pressable onPress={onToggle} accessibilityRole="button" accessibilityState={{ expanded: shown }} hitSlop={6}
      style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 6, opacity: pressed ? 0.6 : 1 })}>
      <Ionicons name={shown ? 'chevron-up' : 'time-outline'} size={16} color={C.muted} />
      <Text style={{ color: C.muted, fontWeight: '700' }}>{shown ? `Hide past ${noun}` : `Show ${count} past ${noun}`}</Text>
    </Pressable>
  );
}
