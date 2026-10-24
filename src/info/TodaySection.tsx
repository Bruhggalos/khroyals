/**
 * The Info tab's Today section: whether there's school, the uniform to wear (with boys'
 * and girls' photos, placeholders until the school adds them), and the day's school
 * events, assignments, activities, volunteer sign-ups and car line hours.
 */
import { Image, Linking, Pressable, Text, View } from 'react-native';
import { router, type Href } from 'expo-router';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { C, Card, P, s } from '../ui';
import { UNIFORM_GUIDE, type Uniform } from './today';
import { UNIFORM_IMAGES } from './uniformImages';

type Icon = React.ComponentProps<typeof Ionicons>['name'];
/** One thing happening today: what, a detail line, and where tapping it goes. */
export type TodayItem = { key: string; icon: Icon; title: string; detail?: string; href?: Href; tint?: string };

export function TodaySection({ dayOff, uniform, items }: { dayOff: string | null; uniform: Uniform | null; items: TodayItem[] }) {
  return (
    <View style={{ gap: 10 }}>
      {dayOff && (
        <Card style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
          <Ionicons name={dayOff === 'Weekend' ? 'sunny-outline' : 'calendar-clear-outline'} size={26} color={C.accent} />
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 17, fontWeight: '800', color: C.ink }}>No school today</Text>
            <P muted>{dayOff === 'Weekend' ? 'Enjoy the weekend!' : dayOff}</P>
          </View>
        </Card>
      )}
      {uniform && <UniformCard u={uniform} />}
      {items.length > 0 && (
        <Card style={{ gap: 0, paddingVertical: 4 }}>
          {items.map((it, i) => (
            <Pressable key={it.key} disabled={!it.href} onPress={() => it.href && router.push(it.href)} accessibilityRole={it.href ? 'button' : undefined}
              style={({ pressed }) => [s.row, { gap: 12, paddingVertical: 10, borderTopWidth: i ? 1 : 0, borderTopColor: C.line }, pressed && { opacity: 0.7 }]}>
              <View style={{ width: 34, height: 34, borderRadius: 10, backgroundColor: `${it.tint ?? C.primary}1A`, alignItems: 'center', justifyContent: 'center' }}>
                <Ionicons name={it.icon} size={18} color={it.tint ?? C.primary} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ fontWeight: '700', color: C.ink }}>{it.title}</Text>
                {!!it.detail && <Text style={{ color: C.muted }}>{it.detail}</Text>}
              </View>
              {!!it.href && <Ionicons name="chevron-forward" size={18} color={C.muted} />}
            </Pressable>
          ))}
        </Card>
      )}
    </View>
  );
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
      <Text style={{ color: C.primary, fontWeight: '700' }} accessibilityRole="link" onPress={() => Linking.openURL(UNIFORM_GUIDE)}>Uniform Guide ›</Text>
    </Card>
  );
}

/** Boys' or girls' uniform: the photo (or a placeholder) and what it is. */
function Variant({ label, photo, lines }: { label: string; photo: React.ComponentProps<typeof Image>['source'] | null; lines: string[] }) {
  return (
    <View style={{ flex: 1, gap: 8 }}>
      {photo ? (
        <Image source={photo} style={{ width: '100%', aspectRatio: 1, borderRadius: 12, backgroundColor: C.bg }} resizeMode="contain" accessibilityLabel={`${label}' uniform`} />
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
