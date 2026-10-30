/**
 * Pieces the Volunteer screens share, in the Kingdom Heights colors (navy and gold, like
 * the Activities event banners): an opportunity's or event's banner, section cards, the
 * spots bar, the quantity picker for item pledges and the event picker.
 */
import { Pressable, StyleProp, Text, View, ViewStyle } from 'react-native';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import type { Opportunity, VolunteerEvent } from '../api/connect';
import { GOLD, NAVY } from '../sports/ui';
import { C, s } from '../ui';
import { dateTile, durationLabel, themeOf } from './details';

export const GREEN = '#15803D';
/** The banner's label: solid, so the art never shows through it. */
const PILL = '#1C3266';

/**
 * The banner on an opportunity's card (and, larger with the title, at the top of its
 * screen): the dates on a calendar tile, what kind of help it is, how long it runs, and
 * the matching art in gold.
 */
export function OpportunityBanner({ o, hero, leader, style }: {
  o: Opportunity; hero?: boolean; leader?: string; style?: StyleProp<ViewStyle>;
}) {
  const theme = themeOf(o);
  const tile = dateTile(o);
  const length = durationLabel(o);
  const cancelled = o.status === 'deleted';
  return (
    <View style={[{ height: hero ? 196 : 112, backgroundColor: NAVY, padding: 14, overflow: 'hidden', justifyContent: hero ? 'space-between' : 'center',
      borderBottomWidth: 3, borderBottomColor: GOLD }, style]}>
      <View accessible={false} style={{ position: 'absolute', left: -50, bottom: -70, width: 180, height: 180, borderRadius: 90, backgroundColor: 'rgba(255,255,255,0.06)' }} />
      <MaterialCommunityIcons name={theme.glyph} size={hero ? 170 : 140} color={GOLD} accessible={false}
        style={{ position: 'absolute', right: hero ? -22 : -18, top: hero ? -30 : -16, opacity: hero ? 0.8 : 0.9, transform: [{ rotate: '-14deg' }] }} />
      <View style={[s.row, { gap: 12, alignItems: 'center' }]}>
        <DateTile tile={tile} />
        <View style={{ gap: 6, flexShrink: 1 }}>
          <View style={[s.row, { gap: 6, alignSelf: 'flex-start', paddingHorizontal: 10, paddingVertical: 5, borderRadius: 999,
            backgroundColor: cancelled ? C.danger : PILL, borderWidth: 1, borderColor: cancelled ? C.danger : GOLD }]}>
            <MaterialCommunityIcons name={cancelled ? 'cancel' : theme.glyph} size={14} color={cancelled ? '#fff' : GOLD} />
            <Text style={{ color: cancelled ? '#fff' : GOLD, fontWeight: '800', fontSize: 12, letterSpacing: 1 }}>
              {(cancelled ? 'Cancelled' : theme.label).toUpperCase()}
            </Text>
          </View>
          {!!length && <Length text={length} />}
        </View>
      </View>
      {hero && (
        <View style={{ gap: 4 }}>
          <Text accessibilityRole="header" style={{ fontSize: 24, fontWeight: '900', color: '#fff', textDecorationLine: cancelled ? 'line-through' : 'none',
            textShadowColor: 'rgba(0,0,0,0.5)', textShadowRadius: 8, textShadowOffset: { width: 0, height: 1 } }}
            numberOfLines={2}>{o.title}</Text>
          {!!leader && (
            <View style={[s.row, { gap: 6 }]}>
              <Ionicons name="star" size={14} color={GOLD} />
              <Text style={{ color: 'rgba(255,255,255,0.9)', fontWeight: '600' }} numberOfLines={1}>{leader}</Text>
            </View>
          )}
        </View>
      )}
    </View>
  );
}

/** The days on a white calendar tile: "NOV" over "16–19". */
function DateTile({ tile }: { tile: { month: string; days: string } }) {
  return (
    <View style={{ width: 60, paddingVertical: 6, borderRadius: 12, backgroundColor: '#fff', alignItems: 'center' }}>
      <Text style={{ fontSize: 11, fontWeight: '800', letterSpacing: 1, color: C.accent }}>{tile.month}</Text>
      <Text style={{ fontSize: tile.days.length > 2 ? 17 : 24, fontWeight: '900', color: NAVY }} numberOfLines={1}>{tile.days}</Text>
    </View>
  );
}

const Length = ({ text }: { text: string }) => (
  <View style={[s.row, { gap: 4 }]}>
    <Ionicons name="time-outline" size={14} color="rgba(255,255,255,0.85)" />
    <Text style={{ color: 'rgba(255,255,255,0.85)', fontSize: 13, fontWeight: '600' }}>{text}</Text>
  </View>
);

/**
 * An event's banner (Harvest Fest), on its card and, larger, at the top of its screen:
 * like an opportunity's, with a gold EVENT label and the event's name on it, so events
 * stand out from the opportunities inside them. The card shows where; the screen, who leads it.
 */
export function EventBanner({ e, hero, leader, style }: {
  e: VolunteerEvent; hero?: boolean; leader?: string; style?: StyleProp<ViewStyle>;
}) {
  const length = durationLabel(e);
  const line = hero ? leader : e.location;
  return (
    <View style={[{ height: hero ? 210 : 168, backgroundColor: NAVY, padding: 14, overflow: 'hidden', justifyContent: 'space-between',
      borderBottomWidth: 3, borderBottomColor: GOLD }, style]}>
      <View accessible={false} style={{ position: 'absolute', left: -50, bottom: -70, width: 180, height: 180, borderRadius: 90, backgroundColor: 'rgba(255,255,255,0.06)' }} />
      <MaterialCommunityIcons name={themeOf(e).glyph} size={hero ? 170 : 150} color={GOLD} accessible={false}
        style={{ position: 'absolute', right: -22, top: -26, opacity: 0.8, transform: [{ rotate: '-14deg' }] }} />
      <View style={[s.row, { gap: 12, alignItems: 'center' }]}>
        <DateTile tile={dateTile(e)} />
        <View style={{ gap: 6, flexShrink: 1 }}>
          <View style={[s.row, { gap: 6, alignSelf: 'flex-start', paddingHorizontal: 10, paddingVertical: 5, borderRadius: 999, backgroundColor: GOLD }]}>
            <MaterialCommunityIcons name="calendar-star" size={14} color={NAVY} />
            <Text style={{ color: NAVY, fontWeight: '900', fontSize: 12, letterSpacing: 1 }}>EVENT</Text>
          </View>
          {!!length && <Length text={length} />}
        </View>
      </View>
      <View style={{ gap: 4 }}>
        <Text accessibilityRole={hero ? 'header' : undefined} numberOfLines={2}
          style={{ fontSize: hero ? 26 : 22, fontWeight: '900', color: '#fff', textShadowColor: 'rgba(0,0,0,0.5)', textShadowRadius: 8, textShadowOffset: { width: 0, height: 1 } }}>
          {e.title}
        </Text>
        {!!line && (
          <View style={[s.row, { gap: 6 }]}>
            <Ionicons name={hero ? 'star' : 'location'} size={14} color={GOLD} />
            <Text style={{ color: 'rgba(255,255,255,0.9)', fontWeight: '600' }} numberOfLines={1}>{line}</Text>
          </View>
        )}
      </View>
    </View>
  );
}

/** Which event an opportunity is part of: None, or one of these events. */
export function EventChips({ events, value, onChange, disabled }: {
  events: VolunteerEvent[]; value: string | null; onChange: (id: string | null) => void; disabled?: boolean;
}) {
  const chip = (id: string | null, label: string) => {
    const on = value === id;
    return (
      <Text key={id ?? 'none'} onPress={disabled || on ? undefined : () => onChange(id)} accessibilityRole="button" accessibilityState={{ selected: on, disabled }}
        style={{ paddingHorizontal: 12, paddingVertical: 6, borderRadius: 999, overflow: 'hidden', borderWidth: 1, borderColor: on ? C.primary : C.line,
          backgroundColor: on ? C.primary : '#fff', color: on ? '#fff' : C.ink, fontWeight: '600', opacity: disabled ? 0.6 : 1 }}>
        {label}
      </Text>
    );
  };
  return <View style={[s.row, { gap: 6, flexWrap: 'wrap' }]}>{chip(null, 'None')}{events.map((e) => chip(e.id, e.title))}</View>;
}

type Icon = React.ComponentProps<typeof Ionicons>['name'];

/** A small rounded label with an icon: "45 min", "In 2 days". */
export function Pill({ icon, text, color }: { icon: Icon; text: string; color: string }) {
  return (
    <View style={[s.row, { gap: 5, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 999, backgroundColor: `${color}14` }]}>
      <Ionicons name={icon} size={14} color={color} />
      <Text style={{ fontSize: 13, fontWeight: '700', color }}>{text}</Text>
    </View>
  );
}

/** A section's title: an icon on a tinted square and the name in capitals. */
export function SectionTitle({ icon, title, tint = C.primary, right }: { icon: Icon; title: string; tint?: string; right?: React.ReactNode }) {
  return (
    <View style={s.row}>
      <View style={{ width: 32, height: 32, borderRadius: 10, backgroundColor: `${tint}1A`, alignItems: 'center', justifyContent: 'center' }}>
        <Ionicons name={icon} size={18} color={tint} />
      </View>
      <Text accessibilityRole="header" style={{ flex: 1, fontSize: 13, fontWeight: '800', letterSpacing: 1.2, color: tint }}>{title.toUpperCase()}</Text>
      {right}
    </View>
  );
}

/** One part of an opportunity (When, Where, About, …) on its own card. */
export function Section({ icon, title, tint, right, children, style }: {
  icon: Icon; title: string; tint?: string; right?: React.ReactNode; children: React.ReactNode; style?: StyleProp<ViewStyle>;
}) {
  return (
    <View style={[s.card, { padding: 16, gap: 10 }, style]}>
      <SectionTitle icon={icon} title={title} tint={tint} right={right} />
      {children}
    </View>
  );
}

/** How full it is, when there's a limit: green until the last spot, then grey. */
export function SpotsBar({ n, spots }: { n: number; spots: number | null }) {
  if (!spots) return null;
  const share = Math.min(1, n / spots);
  return (
    <View accessible accessibilityLabel={`${n} of ${spots} spots filled`}
      style={{ height: 8, borderRadius: 4, backgroundColor: `${C.primary}1A`, overflow: 'hidden' }}>
      <View style={{ width: `${share * 100}%`, height: '100%', borderRadius: 4, backgroundColor: share >= 1 ? C.muted : GREEN }} />
    </View>
  );
}

/** − 3 + : how many items to pledge, from 1 up to what's still needed. */
export function QuantityStepper({ value, max, onChange }: { value: number; max: number; onChange: (n: number) => void }) {
  const step = (d: number) => onChange(Math.min(max, Math.max(1, value + d)));
  const round = (icon: 'remove' | 'add', d: number, disabled: boolean) => (
    <Pressable onPress={() => step(d)} disabled={disabled} accessibilityRole="button" accessibilityLabel={d < 0 ? 'One fewer' : 'One more'}
      hitSlop={6} style={({ pressed }) => ({ width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center',
        borderWidth: 2, borderColor: disabled ? C.line : C.primary, opacity: pressed ? 0.6 : 1 })}>
      <Ionicons name={icon} size={24} color={disabled ? C.line : C.primary} />
    </Pressable>
  );
  return (
    <View style={[s.row, { justifyContent: 'center', gap: 22 }]} accessibilityRole="adjustable" accessibilityValue={{ min: 1, max, now: value }}
      accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
      onAccessibilityAction={(e) => step(e.nativeEvent.actionName === 'increment' ? 1 : -1)}>
      {round('remove', -1, value <= 1)}
      <Text style={{ fontSize: 34, fontWeight: '900', color: C.ink, minWidth: 56, textAlign: 'center', fontVariant: ['tabular-nums'] }}>{value}</Text>
      {round('add', 1, value >= max)}
    </View>
  );
}
