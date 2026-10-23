/**
 * Activities home cards, in the Kingdom Heights colors: activity cards for "Your activities",
 * event cards with a countdown for "Upcoming events", the "Are you going?" sheet families use,
 * and the attendance line coaches see.
 */
import { useState } from 'react';
import { Modal, Pressable, ScrollView, Text, View } from 'react-native';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { answerRsvp, type Sport, type SportAttendance, type SportEvent, type SportRsvp } from '../api/connect';
import { C, P, s } from '../ui';
import { categoryInfo, KIND_LABELS } from './categories';
import { countdown, two } from './events';
import { GOLD, NAVY, Place, SportAvatar, when } from './ui';

export { NAVY, SportAvatar };

const GREEN = '#15803D';
type Glyph = React.ComponentProps<typeof MaterialCommunityIcons>['name'];
/** The gold mark on an event banner (gold on navy, like the Home tiles): the activity's own, else its category's. */
const BY_EMOJI: Record<string, Glyph> = {
  '🏐': 'volleyball', '⚽': 'soccer', '🏀': 'basketball', '🏈': 'football', '⚾': 'baseball', '🎾': 'tennis', '🏃': 'run',
  '⛳': 'golf', '🏊': 'swim', '🏒': 'hockey-sticks', '🎤': 'microphone-variant', '🎹': 'piano', '🎻': 'violin', '🎺': 'trumpet',
  '🎸': 'guitar-acoustic', '📷': 'camera', '🤖': 'robot', '🔬': 'flask', '📚': 'book-open-variant', '🌱': 'sprout', '♟️': 'chess-knight',
};
const BY_CATEGORY: Record<string, Glyph> = {
  sports: 'trophy-outline', theater: 'drama-masks', music: 'music-clef-treble', art: 'palette', clubs: 'chess-knight',
};
const bannerMark = (sport?: Sport): Glyph => (sport && BY_EMOJI[sport.icon.trim()]) || BY_CATEGORY[sport?.category ?? 'sports'] || 'trophy-outline';

/** One of "Your activities": photo, season, name and why it's yours. */
export function ActivityCard({ sport, label, badge, onPress }: {
  sport: Sport; label: string; badge: 'following' | 'registered' | 'viewed'; onPress: () => void;
}) {
  const b = badge === 'registered' ? { text: 'Registered', color: GREEN } : badge === 'following' ? { text: 'Following', color: GOLD } : { text: 'Viewed', color: C.muted };
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={`${sport.name}, ${b.text}`}
      style={({ pressed }) => [card, { width: 168, minHeight: 190, padding: 14, justifyContent: 'space-between' }, pressed && { opacity: 0.85 }]}>
      <View style={{ gap: 10 }}>
        <View style={[s.row, { justifyContent: 'space-between', alignItems: 'flex-start' }]}>
          <SportAvatar sport={sport} size={52} />
          <Text style={{ fontSize: 12, color: C.muted, fontWeight: '600', flexShrink: 1, textAlign: 'right' }} numberOfLines={2}>{label}</Text>
        </View>
        <Text style={{ fontSize: 17, fontWeight: '800', color: C.ink }} numberOfLines={2}>{sport.name}</Text>
      </View>
      <View style={[s.row, { gap: 6, alignSelf: 'flex-start', paddingHorizontal: 10, paddingVertical: 5, borderRadius: 999, backgroundColor: `${b.color}1A` }]}>
        <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: b.color }} />
        <Text style={{ fontSize: 12, fontWeight: '700', color: b.color }}>{b.text}</Text>
      </View>
    </Pressable>
  );
}

/** The last card in a carousel: "All activities ›", "Full schedule ›". */
export function MoreCard({ icon, title, hint, width, onPress }: {
  icon: React.ComponentProps<typeof Ionicons>['name']; title: string; hint?: string; width: number; onPress: () => void;
}) {
  return (
    <Pressable onPress={onPress} accessibilityRole="button"
      style={({ pressed }) => [card, { width, padding: 18, justifyContent: 'center', gap: 8, borderColor: C.primary, borderWidth: 1.5 }, pressed && { opacity: 0.85 }]}>
      <Ionicons name={icon} size={28} color={C.primary} />
      <View style={[s.row, { justifyContent: 'space-between' }]}>
        <Text style={{ fontSize: 18, fontWeight: '800', color: C.primary, flexShrink: 1 }}>{title}</Text>
        <Ionicons name="chevron-forward" size={22} color={C.primary} />
      </View>
      {!!hint && <P muted>{hint}</P>}
    </Pressable>
  );
}

/** "Are you going?" for each registered child (or yourself): a button that opens a sheet with Going / Not going. */
export function RsvpButton({ e, people, answers, onChange }: {
  e: SportEvent; people: { id: string; name: string }[]; answers: SportRsvp[]; onChange: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  if (!people.length || e.cancelled) return null;
  const answerOf = (id: string) => answers.find((a) => a.eventId === e.id && a.studentId === id)?.status;
  const answered = people.filter((p) => answerOf(p.id));
  const summary = answered.length === people.length
    ? people.map((p) => `${people.length > 1 ? `${p.name.split(' ')[0]}: ` : ''}${answerOf(p.id) === 'going' ? 'Going' : 'Not going'}`).join(' · ')
    : null;
  const set = (id: string, status: 'going' | 'not_going') => {
    setBusy(id);
    answerRsvp(e.id, id, answerOf(id) === status ? null : status).then(onChange).catch(() => {}).finally(() => setBusy(null));
  };

  return (
    <>
      <Pressable onPress={() => setOpen(true)} accessibilityRole="button" accessibilityLabel={summary ? `Your answer: ${summary}. Change` : 'Are you going?'}
        style={({ pressed }) => [{ flexDirection: 'row', gap: 8, alignItems: 'center', justifyContent: 'center', paddingVertical: 12, borderRadius: 999,
          backgroundColor: summary ? '#fff' : C.primary, borderWidth: summary ? 1.5 : 0, borderColor: C.primary }, pressed && { opacity: 0.85 }]}>
        <Ionicons name={summary ? 'checkmark-circle' : 'person'} size={18} color={summary ? C.primary : '#fff'} />
        <Text style={{ fontWeight: '800', fontSize: 15, color: summary ? C.primary : '#fff' }} numberOfLines={1}>
          {summary ?? (answered.length ? `Are you going? (${answered.length} of ${people.length})` : 'Are you going?')}
        </Text>
      </Pressable>
      <Modal visible={open} transparent animationType="slide" onRequestClose={() => setOpen(false)}>
        <Pressable style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.35)' }} onPress={() => setOpen(false)} accessibilityLabel="Close" />
        <View style={[s.sheet, { backgroundColor: '#fff', borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 20, paddingBottom: 36, gap: 14 }]}>
          <View style={{ gap: 2 }}>
            <Text style={{ fontSize: 20, fontWeight: '800', color: C.ink }}>Are you going?</Text>
            <P muted>{e.title} · {when(e.startsAt)}</P>
          </View>
          <ScrollView style={{ maxHeight: 320 }} contentContainerStyle={{ gap: 12 }}>
            {people.map((p) => {
              const a = answerOf(p.id);
              const pill = (status: 'going' | 'not_going', label: string, color: string) => {
                const on = a === status;
                return (
                  <Pressable onPress={() => set(p.id, status)} disabled={busy === p.id} accessibilityRole="button"
                    accessibilityState={{ selected: on }} accessibilityLabel={`${p.name}: ${label}`}
                    style={{ flex: 1, alignItems: 'center', paddingVertical: 10, borderRadius: 12, borderWidth: 1.5, borderColor: color,
                      backgroundColor: on ? color : '#fff', opacity: busy === p.id ? 0.6 : 1 }}>
                    <Text style={{ fontWeight: '800', color: on ? '#fff' : color }}>{label}</Text>
                  </Pressable>
                );
              };
              return (
                <View key={p.id} style={{ gap: 6 }}>
                  <Text style={{ fontWeight: '700', color: C.ink }}>{p.name}</Text>
                  <View style={[s.row, { gap: 10 }]}>{pill('going', 'Going', GREEN)}{pill('not_going', 'Not going', C.danger)}</View>
                </View>
              );
            })}
          </ScrollView>
          <Pressable onPress={() => setOpen(false)} accessibilityRole="button" style={[s.btn, { marginTop: 4 }]}>
            <Text style={s.btnT}>Done</Text>
          </Pressable>
        </View>
      </Modal>
    </>
  );
}

/** For the activity's leaders: who's coming, with the names a tap away. */
export function AttendanceLine({ rows }: { rows: SportAttendance[] }) {
  const [open, setOpen] = useState(false);
  if (!rows.length) return null;
  const going = rows.filter((r) => r.status === 'going');
  const not = rows.filter((r) => r.status === 'not_going');
  const none = rows.filter((r) => r.status === 'none');
  return (
    <Pressable onPress={() => setOpen(!open)} accessibilityRole="button" accessibilityState={{ expanded: open }}
      style={{ gap: 4, padding: 10, borderRadius: 12, backgroundColor: `${C.primary}0D` }}>
      <Text style={{ fontWeight: '700', color: C.ink }}>
        <Text style={{ color: GREEN }}>{going.length} going</Text> · <Text style={{ color: C.danger }}>{not.length} not going</Text> · {none.length} no answer
      </Text>
      {open && (
        <View style={{ gap: 2 }}>
          {going.length > 0 && <P muted>Going: {going.map((r) => r.name).join(', ')}</P>}
          {not.length > 0 && <P muted>Not going: {not.map((r) => r.name).join(', ')}</P>}
          {none.length > 0 && <P muted>No answer: {none.map((r) => r.name).join(', ')}</P>}
        </View>
      )}
    </Pressable>
  );
}

/** One of "Upcoming events": KH banner with the kind, a countdown, when, what, where and Are you going?. */
export function EventCard({ e, sport, now, footer, onPress }: {
  e: SportEvent; sport?: Sport; now: number; footer?: React.ReactNode; onPress?: () => void;
}) {
  const t = countdown(e.startsAt, now);
  const over = new Date(e.endsAt ?? e.startsAt).getTime() + (e.endsAt ? 0 : 3 * 3600_000) < now;
  const cat = categoryInfo(sport?.category);
  return (
    <View style={[card, { width: 300, overflow: 'hidden' }]}>
      <Pressable onPress={onPress} disabled={!onPress} accessibilityRole="button" accessibilityLabel={`${e.title}, ${sport?.name ?? ''}, ${when(e.startsAt)}`}>
        <View style={{ height: 86, backgroundColor: NAVY, justifyContent: 'center', paddingHorizontal: 14, overflow: 'hidden',
          borderBottomWidth: 3, borderBottomColor: GOLD }}>
          <MaterialCommunityIcons name={bannerMark(sport)} size={132} color={GOLD} accessible={false}
            style={{ position: 'absolute', right: -18, top: -22, opacity: 0.9, transform: [{ rotate: '-14deg' }] }} />
          <View style={[s.row, { gap: 6, alignSelf: 'flex-start', paddingHorizontal: 10, paddingVertical: 6, borderRadius: 999,
            backgroundColor: e.cancelled ? C.danger : 'rgba(255,255,255,0.14)', borderWidth: 1, borderColor: e.cancelled ? C.danger : GOLD }]}>
            <MaterialCommunityIcons name={e.cancelled ? 'cancel' : 'calendar-star'} size={14} color={e.cancelled ? '#fff' : GOLD} />
            <Text style={{ color: e.cancelled ? '#fff' : GOLD, fontWeight: '800', fontSize: 12, letterSpacing: 1 }}>
              {e.cancelled ? 'CANCELLED' : (e.kind === 'other' ? 'EVENT' : KIND_LABELS[e.kind]).toUpperCase()}
            </Text>
          </View>
          <Text style={{ color: 'rgba(255,255,255,0.8)', fontSize: 12, marginTop: 6 }}>{cat.emoji} {cat.label}</Text>
        </View>
        <View style={{ padding: 14, gap: 4, alignItems: 'center' }}>
          {e.cancelled ? <Text style={{ fontWeight: '800', color: C.danger, fontSize: 16 }}>Cancelled</Text>
            : t.started ? <Text style={{ fontWeight: '800', color: over ? C.muted : GREEN, fontSize: 16 }}>{over ? 'Finished' : 'Happening now'}</Text> : (
              <>
                <Text style={{ fontWeight: '700', color: C.ink }}>Starts in</Text>
                <View style={[s.row, { gap: 22 }]}>
                  {[[t.days, 'Days'], [t.hours, 'Hours'], [t.minutes, 'Minutes']].map(([n, label]) => (
                    <View key={label} style={{ alignItems: 'center' }}>
                      <Text style={{ fontSize: 34, fontWeight: '900', color: C.primary, fontVariant: ['tabular-nums'] }}>{two(n as number)}</Text>
                      <Text style={{ color: C.muted, fontSize: 13 }}>{label}</Text>
                    </View>
                  ))}
                </View>
              </>
            )}
          <Text style={{ fontWeight: '700', color: C.ink, marginTop: 2 }}>{when(e.startsAt)}</Text>
        </View>
        <View style={{ height: 1, backgroundColor: C.line, marginHorizontal: 14 }} />
        <View style={[s.row, { gap: 12, padding: 14 }]}>
          {sport && <SportAvatar sport={sport} size={46} />}
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 18, fontWeight: '800', color: C.ink, textDecorationLine: e.cancelled ? 'line-through' : 'none' }} numberOfLines={2}>{e.title}</Text>
            {sport && <Text style={{ color: C.muted }} numberOfLines={1}>{sport.name}</Text>}
          </View>
        </View>
      </Pressable>
      {(!!e.location || !!e.address) && (
        <>
          <View style={{ height: 1, backgroundColor: C.line, marginHorizontal: 14 }} />
          <View style={{ padding: 14 }}><Place e={e} /></View>
        </>
      )}
      {!!footer && <View style={{ paddingHorizontal: 14, paddingBottom: 14, gap: 8 }}>{footer}</View>}
    </View>
  );
}

const card = { backgroundColor: C.card, borderRadius: 18, borderWidth: 1, borderColor: C.line } as const;
