/**
 * One day on the Planner tab: whether there's school, the uniform to wear (with boys' and
 * girls' pictures of the approved pieces), assignments, a card for each
 * of a parent's children, and the day's school events, activities, volunteer sign-ups
 * and car line hours.
 */
import { Image, Linking, Pressable, Text, View } from 'react-native';
import { router, type Href } from 'expo-router';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import type { Assignment } from '../api/connect';
import { gradeLabel } from '../comms/grades';
import { C, Card, P, s } from '../ui';
import { AssignmentsCard } from './AssignmentsCard';
import type { DayPlan, Kid, Row } from './plan';
import { UNIFORM_GUIDE, type Uniform } from './today';
import { UNIFORM_IMAGES, UNIFORM_STORE } from './uniformImages';

const TONES = { accent: C.accent, muted: C.muted, green: '#15803D' };
/** "today", "tomorrow", "on Monday": the day's label inside a sentence. */
export const onDay = (label: string) => (label === 'Today' ? 'today' : label === 'Tomorrow' ? 'tomorrow' : `on ${label}`);

export function TodaySection({ plan, onToggle }: { plan: DayPlan; onToggle: (a: Assignment) => void }) {
  const { dayOff, label } = plan;
  return (
    <View style={{ gap: 10 }}>
      {dayOff && (
        <Card style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
          <Ionicons name={dayOff === 'Weekend' ? 'sunny-outline' : 'calendar-clear-outline'} size={26} color={C.accent} />
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 17, fontWeight: '800', color: C.ink }}>No school{label === 'Today' ? ' today' : ''}</Text>
            <P muted>{dayOff === 'Weekend' ? 'Enjoy the weekend!' : dayOff}</P>
          </View>
        </Card>
      )}
      {plan.uniform && <UniformCard u={plan.uniform} />}
      {plan.assignments && <AssignmentsCard a={plan.assignments} label={label} onToggle={onToggle} />}
      {plan.kids.map(({ kid, rows }) => <KidCard key={kid.id} kid={kid} rows={rows} label={label} />)}
      {plan.items.length > 0 && <Card style={{ gap: 0, paddingVertical: 4 }}><Rows rows={plan.items} /></Card>}
      {!dayOff && !plan.items.length && !plan.kids.length && !plan.assignments && (
        <Card><P muted>Nothing else on the calendar {onDay(label)}.</P></Card>
      )}
    </View>
  );
}

/** A parent's child on this day: their class assignments due and their activities. */
function KidCard({ kid, rows, label }: { kid: Kid; rows: Row[]; label: string }) {
  const grade = gradeLabel(kid.grade);
  return (
    <Card style={{ gap: 4 }}>
      <View style={[s.row, { gap: 10 }]}>
        <View style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: C.primary, alignItems: 'center', justifyContent: 'center' }}>
          <Text style={{ color: '#fff', fontWeight: '800', fontSize: 16 }}>{kid.firstName.slice(0, 1)}</Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: 17, fontWeight: '800', color: C.ink }}>{kid.firstName}</Text>
          {!!grade && <Text style={{ color: C.muted }}>{/^\d/.test(grade) ? `${grade} grade` : grade}</Text>}
        </View>
      </View>
      {rows.length ? <Rows rows={rows} />
        : <P muted>No assignments due or activities {onDay(label)}.</P>}
    </Card>
  );
}

/** A list of the day's things, each opening its app when it has one. */
function Rows({ rows }: { rows: Row[] }) {
  return rows.map((it, i) => {
    const tint = it.tone ? TONES[it.tone] : C.primary;
    return (
      <Pressable key={it.key} disabled={!it.href} onPress={() => it.href && router.push(it.href as Href)} accessibilityRole={it.href ? 'button' : undefined}
        style={({ pressed }) => [s.row, { gap: 12, paddingVertical: 10, borderTopWidth: i ? 1 : 0, borderTopColor: C.line }, pressed && { opacity: 0.7 }]}>
        <View style={{ width: 34, height: 34, borderRadius: 10, backgroundColor: `${tint}1A`, alignItems: 'center', justifyContent: 'center' }}>
          <Ionicons name={it.icon} size={18} color={tint} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={{ fontWeight: '700', color: C.ink }}>{it.title}</Text>
          {!!it.detail && <Text style={{ color: C.muted }}>{it.detail}</Text>}
        </View>
        {!!it.href && <Ionicons name="chevron-forward" size={18} color={C.muted} />}
      </Pressable>
    );
  });
}

function UniformCard({ u }: { u: Uniform }) {
  const photos = UNIFORM_IMAGES[u.kind];
  return (
    <Card style={{ gap: 12 }}>
      <View style={s.row}>
        <MaterialCommunityIcons name="tshirt-crew-outline" size={24} color={C.primary} />
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: 12, fontWeight: '800', letterSpacing: 1, color: C.primary }}>WHAT TO WEAR</Text>
          <Text style={{ fontSize: 17, fontWeight: '800', color: C.ink }}>{u.title}</Text>
        </View>
      </View>
      {u.dress && <DressUp dress={u.dress} />}
      <View style={[s.row, { alignItems: 'flex-start', gap: 12 }]}>
        <Variant label="Boys" photo={photos.boys} lines={u.boys} />
        <Variant label="Girls" photo={photos.girls} lines={u.girls} />
      </View>
      <View style={[s.row, { alignItems: 'flex-start', gap: 8 }]}>
        <MaterialCommunityIcons name="shoe-formal" size={18} color={C.muted} />
        <Text style={{ flex: 1, color: C.ink }}>{u.shoes}</Text>
      </View>
      {u.notes.map((n) => (
        <View key={n} style={[s.row, { alignItems: 'flex-start', gap: 8 }]}>
          <Ionicons name="information-circle-outline" size={18} color={C.muted} />
          <Text style={{ flex: 1, color: C.ink }}>{n}</Text>
        </View>
      ))}
      <View style={[s.row, { gap: 20, flexWrap: 'wrap' }]}>
        <Text style={{ color: C.primary, fontWeight: '700' }} accessibilityRole="link" onPress={() => Linking.openURL(UNIFORM_GUIDE)}>Uniform Guide ›</Text>
        <Text style={{ color: C.primary, fontWeight: '700' }} accessibilityRole="link" onPress={() => Linking.openURL(UNIFORM_STORE)}>Shop at French Toast ›</Text>
      </View>
    </Card>
  );
}

/** A dress-up day (Spirit Week): the themes students may wear instead of the uniform below. */
function DressUp({ dress }: { dress: NonNullable<Uniform['dress']> }) {
  return (
    <View style={{ gap: 8, padding: 12, borderRadius: 12, backgroundColor: `${C.accent}12`, borderWidth: 1, borderColor: `${C.accent}55` }}>
      <View style={[s.row, { gap: 8 }]}>
        <Ionicons name="sparkles" size={18} color={C.accent} />
        <Text style={{ fontSize: 12, fontWeight: '800', letterSpacing: 1, color: C.accent }}>{(dress.week ?? 'Dress-up day').toUpperCase()}</Text>
      </View>
      {dress.themes.map((t) => (
        <View key={t.title} style={{ gap: 2 }}>
          <Text style={{ fontSize: 17, fontWeight: '800', color: C.ink }}>{t.title}{t.who ? <Text style={{ fontSize: 14, fontWeight: '600', color: C.muted }}>{`  ${t.who}`}</Text> : null}</Text>
          {!!t.details && <Text style={{ color: C.ink, lineHeight: 20 }}>{t.details}</Text>}
        </View>
      ))}
      <Text style={{ color: C.muted, fontSize: 13 }}>Not dressing up? Wear the usual uniform below.</Text>
    </View>
  );
}

/** Boys' or girls' uniform: the photo (or a placeholder) and what it is. */
function Variant({ label, photo, lines }: { label: string; photo: React.ComponentProps<typeof Image>['source'] | null; lines: string[] }) {
  return (
    <View style={{ flex: 1, gap: 8 }}>
      {photo ? (
        // A square frame with the picture filling it (an Image sized by aspectRatio alone stretches on the web).
        <View style={{ width: '100%', aspectRatio: 1, borderRadius: 12, overflow: 'hidden', backgroundColor: '#fff', borderWidth: 1, borderColor: C.line }}>
          <Image source={photo} style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, width: '100%', height: '100%' }}
            resizeMode="contain" accessibilityLabel={`${label}' uniform`} />
        </View>
      ) : (
        <View accessible accessibilityLabel={`${label}' uniform photo coming soon`}
          style={{ width: '100%', aspectRatio: 1, borderRadius: 12, borderWidth: 1.5, borderStyle: 'dashed', borderColor: C.line,
            backgroundColor: C.bg, alignItems: 'center', justifyContent: 'center', gap: 6 }}>
          <MaterialCommunityIcons name="tshirt-crew-outline" size={34} color={C.muted} />
          <Text style={{ color: C.muted, fontSize: 12 }}>Photo coming soon</Text>
        </View>
      )}
      <Text style={{ fontWeight: '800', color: C.ink }}>{label}</Text>
      {lines.map((l) => <Text key={l} style={{ color: C.muted, fontSize: 13, lineHeight: 18 }}>• {l}</Text>)}
    </View>
  );
}
