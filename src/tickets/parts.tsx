/** Pieces of event tickets: the Tickets buttons under an Activities event, and which events are on sale. */
import { useCallback, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { ticketsOnSale } from '../api/connect';
import { GOLD, NAVY } from '../sports/ui';
import { C, s } from '../ui';
import { money } from './labels';

/** Upcoming events with tickets on sale (event id → lowest price), fresh whenever the screen comes back. */
export function useTicketsOnSale() {
  const [onSale, setOnSale] = useState<Map<string, number | null>>(new Map());
  useFocusEffect(useCallback(() => {
    ticketsOnSale().then((l) => setOnSale(new Map(l.map((x) => [x.eventId, x.fromCents])))).catch(() => {});
  }, []));
  return onSale;
}

/**
 * Under an event: "Tickets · from $5" for buyers when they're on sale, and "Sell tickets" for the
 * activity's leaders (who set them up and check them at the door). Nothing when neither applies.
 */
export function TicketButtons({ eventId, onSale, buyer, leader }: { eventId: string; onSale?: number | null; buyer: boolean; leader: boolean }) {
  const selling = onSale !== undefined;
  if (!(selling && buyer) && !leader) return null;
  return (
    <View style={[s.row, { gap: 8, flexWrap: 'wrap' }]}>
      {selling && buyer && (
        <Pressable onPress={() => router.push({ pathname: '/tickets/buy', params: { event: eventId } })} accessibilityRole="button"
          style={({ pressed }) => [{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 14, paddingVertical: 8, borderRadius: 999,
            backgroundColor: NAVY, borderWidth: 2, borderColor: GOLD }, pressed && { opacity: 0.85 }]}>
          <Ionicons name="ticket" size={16} color={GOLD} />
          <Text style={{ color: '#fff', fontWeight: '800' }}>Tickets{onSale != null ? ` · from ${money(onSale)}` : ''}</Text>
        </Pressable>
      )}
      {leader && (
        <Pressable onPress={() => router.push({ pathname: '/tickets/manage', params: { event: eventId } })} accessibilityRole="button"
          style={({ pressed }) => [{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 999,
            borderWidth: 1, borderColor: C.line, backgroundColor: '#fff' }, pressed && { opacity: 0.85 }]}>
          <Ionicons name="ticket-outline" size={16} color={C.primary} />
          <Text style={{ color: C.primary, fontWeight: '700' }}>{selling ? 'Ticket sales & door' : 'Sell tickets'}</Text>
        </Pressable>
      )}
    </View>
  );
}
