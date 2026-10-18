/** "Show 12 past events" / "Hide past events": every calendar keeps past events out of view until asked. */
import { useCallback, useState } from 'react';
import { Pressable, Text } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { C } from '../ui';

/** How past events look when shown: greyed out. */
export const PAST_STYLE = { opacity: 0.45 } as const;

/**
 * Whether past events are showing. They always start hidden, and hide again whenever the
 * screen is left (even for a moment, to open an event), so no calendar stays expanded.
 */
export function usePastToggle(): { shown: boolean; toggle: () => void; hide: () => void } {
  const [shown, setShown] = useState(false);
  useFocusEffect(useCallback(() => () => setShown(false), []));
  return { shown, toggle: () => setShown((x) => !x), hide: () => setShown(false) };
}

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
