/** Pieces the Activities screens share: the ★ Follow button, schedule rows, places and activity rows. */
import { Image, Linking, Platform, Pressable, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { Sport, SportEvent } from '../api/connect';
import { C, Card, P, s } from '../ui';
import { PAST_STYLE } from '../calendar/PastToggle';
import { isHeadline, KIND_LABELS } from './categories';
import { directionsUrl } from './events';

export const GOLD = '#CA8A04';
export const NAVY = '#0A1F4D';
export const ORANGE = '#EA580C';

/** "Sat, Oct 24 · 4:30 PM" on the phone's clock. */
export function when(iso: string) {
  const d = new Date(iso);
  return `${d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })} · ${d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}`;
}

/** A round button with a star in the middle: follow an activity to see its schedule and news. */
export function StarButton({ following, onPress, disabled }: { following: boolean; onPress: () => void; disabled?: boolean }) {
  return (
    <Pressable onPress={onPress} disabled={disabled} accessibilityRole="button" accessibilityState={{ selected: following, disabled }}
      accessibilityLabel={following ? 'Following. Tap to unfollow' : 'Follow this activity'}
      style={({ pressed }) => ({ alignItems: 'center', gap: 4, opacity: disabled ? 0.4 : pressed ? 0.7 : 1 })}>
      <View style={{
        width: 56, height: 56, borderRadius: 28, alignItems: 'center', justifyContent: 'center',
        backgroundColor: following ? GOLD : '#fff', borderWidth: 2, borderColor: GOLD,
      }}>
        <Ionicons name={following ? 'star' : 'star-outline'} size={28} color={following ? '#fff' : GOLD} />
      </View>
      <Text style={{ fontSize: 12, fontWeight: '700', color: following ? GOLD : C.ink }}>{following ? 'Following' : 'Follow'}</Text>
    </Pressable>
  );
}

/** Small colored label. */
export const Tag = ({ label, color = C.primary }: { label: string; color?: string }) => (
  <Text style={[s.chip, { backgroundColor: `${color}1A`, color, fontSize: 12, fontWeight: '700', overflow: 'hidden' }]}>{label}</Text>
);

/** Where it is, with Directions to Maps. */
export function Place({ e, compact }: { e: Pick<SportEvent, 'location' | 'address'>; compact?: boolean }) {
  const url = directionsUrl(e.location, e.address, Platform.OS);
  if (!e.location && !e.address) return null;
  return (
    <Pressable disabled={!url} onPress={() => url && Linking.openURL(url)} accessibilityRole="link"
      accessibilityLabel={`${[e.location, e.address].filter(Boolean).join(', ')}. Directions`}
      style={[s.row, { gap: 8, alignItems: 'flex-start' }]}>
      <Ionicons name="location" size={compact ? 16 : 20} color={C.accent} style={{ marginTop: 1 }} />
      <View style={{ flex: 1 }}>
        {!!e.location && <Text style={{ fontWeight: '700', color: C.ink, fontSize: compact ? 13 : 14 }} numberOfLines={2}>{e.location}</Text>}
        {!!e.address && <Text style={{ color: C.muted, fontSize: 13 }} numberOfLines={2}>{e.address}</Text>}
      </View>
      {!!url && <Text style={{ color: C.primary, fontWeight: '700', fontSize: 13 }}>Directions</Text>}
    </Pressable>
  );
}

/** One game, practice, rehearsal, performance, meeting… `footer`: Are you going? / who's coming. */
export function EventRow({ e, sport, past, onPress, footer }: {
  e: SportEvent; sport?: Sport; past?: boolean; onPress?: () => void; footer?: React.ReactNode;
}) {
  const d = new Date(e.startsAt);
  return (
    <Card style={{ gap: 10, opacity: past ? PAST_STYLE.opacity : e.cancelled ? 0.6 : 1 }}>
      <Pressable onPress={onPress} disabled={!onPress} style={{ flexDirection: 'row', gap: 12, alignItems: 'center' }}>
        <View style={{ width: 48, alignItems: 'center' }}>
          <Text style={{ fontSize: 12, fontWeight: '700', color: ORANGE }}>{d.toLocaleDateString('en-US', { month: 'short' }).toUpperCase()}</Text>
          <Text style={{ fontSize: 22, fontWeight: '800', color: C.ink }}>{d.getDate()}</Text>
        </View>
        <View style={{ flex: 1, gap: 2 }}>
          <Text style={{ fontWeight: '700', color: C.ink, textDecorationLine: e.cancelled ? 'line-through' : 'none' }}>
            {sport ? `${sport.icon} ` : ''}{e.title}
          </Text>
          <P muted>{when(e.startsAt)}</P>
          <View style={[s.row, { gap: 6, flexWrap: 'wrap' }]}>
            <Tag label={e.kind === 'other' ? 'Event' : KIND_LABELS[e.kind]} color={isHeadline(e.kind) ? ORANGE : C.primary} />
            {e.home != null && <Tag label={e.home ? 'Home' : 'Away'} color={C.muted} />}
            {e.cancelled && <Tag label="Cancelled" color={C.danger} />}
            {sport && <Text style={{ fontSize: 12, color: C.muted }}>{sport.name}</Text>}
          </View>
          {!!e.notes && <P muted>{e.notes}</P>}
        </View>
      </Pressable>
      <Place e={e} compact />
      {!past && footer}
    </Card>
  );
}

/** The team photo, or the activity's emoji on a navy disc with a gold ring (like the Home tiles). */
export function SportAvatar({ sport, size = 48 }: { sport: Pick<Sport, 'icon' | 'photo'>; size?: number }) {
  const box = { width: size, height: size, borderRadius: size / 2 };
  if (sport.photo) return <Image source={{ uri: sport.photo }} style={[box, { borderWidth: 2, borderColor: GOLD }]} accessibilityIgnoresInvertColors />;
  return (
    <View style={[box, { backgroundColor: NAVY, borderWidth: 2, borderColor: GOLD, alignItems: 'center', justifyContent: 'center' }]} accessible={false}>
      <Text style={{ fontSize: size * 0.5 }}>{sport.icon}</Text>
    </View>
  );
}

/** An activity in a list, with what's on and why it's yours. */
export function SportRow({ sport, line, following, registered, onPress }: {
  sport: Sport; line: string; following?: boolean; registered?: boolean; onPress: () => void;
}) {
  return (
    <Card onPress={onPress} style={{ flexDirection: 'row', gap: 12, alignItems: 'center' }}>
      <SportAvatar sport={sport} size={48} />
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={{ fontSize: 17, fontWeight: '800', color: C.ink }}>{sport.name}</Text>
        <P muted>{line}</P>
        {(following || registered) && (
          <View style={[s.row, { gap: 6 }]}>
            {registered && <Tag label="✓ Registered" color="#15803D" />}
            {following && <Tag label="★ Following" color={GOLD} />}
          </View>
        )}
      </View>
      <Ionicons name="chevron-forward" size={20} color={C.muted} />
    </Card>
  );
}
