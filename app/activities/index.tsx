/**
 * Activities (Apps → Activities): sports, theater, music, art and clubs. Pick a category
 * (or All) to see your schedule for the activities you're involved in (followed ★, or a
 * child registered), what's happening now, seasons coming up with sign-up info, and every
 * other activity to follow. Anyone can browse; following and sign-up need an approved account.
 */
import { useCallback, useEffect, useState } from 'react';
import { RefreshControl, ScrollView, Text, View } from 'react-native';
import { Stack, router, useFocusEffect } from 'expo-router';
import {
  listSports, myAccess, mySports, mySportSchedule, session, subscribeSports,
  type Access, type MySport, type Person, type Sport, type SportEvent, type SportSeason,
} from '../../src/api/connect';
import { CATEGORIES, categoryInfo, inCategory, type Category } from '../../src/sports/categories';
import { dateRange, schoolToday, shortDay, signupState, sportSections } from '../../src/sports/seasons';
import { EventRow, SportRow } from '../../src/sports/ui';
import { Button, C, Card, H, Loading, P, s } from '../../src/ui';

const Section = ({ title }: { title: string }) => (
  <Text style={{ fontSize: 13, fontWeight: '800', color: C.muted, letterSpacing: 0.5, marginTop: 8 }}>{title.toUpperCase()}</Text>
);

function signupLine(season: SportSeason, today: string) {
  switch (signupState(season, today)) {
    case 'open': return `Sign-ups open until ${shortDay(season.signupCloses!)}`;
    case 'soon': return `Sign-ups open ${shortDay(season.signupOpens!)}`;
    case 'closed': return 'Sign-ups closed';
    default: return '';
  }
}

/** All · Sports · Theater · Music · Art · Clubs. */
function CategoryPills({ value, onChange }: { value: Category | 'all'; onChange: (c: Category | 'all') => void }) {
  const pill = (key: Category | 'all', label: string) => {
    const on = value === key;
    return (
      <Text key={key} onPress={() => onChange(key)} accessibilityRole="button" accessibilityState={{ selected: on }}
        style={{ paddingHorizontal: 14, paddingVertical: 8, borderRadius: 999, overflow: 'hidden', borderWidth: 1,
          borderColor: on ? C.primary : C.line, backgroundColor: on ? C.primary : '#fff', color: on ? '#fff' : C.ink, fontWeight: '700' }}>
        {label}
      </Text>
    );
  };
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
      {pill('all', 'All')}
      {CATEGORIES.map((c) => pill(c.key, `${c.emoji} ${c.label}`))}
    </ScrollView>
  );
}

export default function ActivitiesHome() {
  const [data, setData] = useState<{ sports: Sport[]; seasons: SportSeason[] } | null>(null);
  const [me, setMe] = useState<Person | null>(null);
  const [access, setAccess] = useState<Access | null>(null);
  const [mine, setMine] = useState<MySport[]>([]);
  const [schedule, setSchedule] = useState<SportEvent[]>([]);
  const [filter, setFilter] = useState<Category | 'all'>('all');
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      const [d, p] = await Promise.all([listSports(), session()]);
      const approved = p && !p.pending;
      const [m, sch, a] = approved ? await Promise.all([mySports(), mySportSchedule(), myAccess().catch(() => null)]) : [[], [], null];
      setData(d); setMe(p); setMine(m); setSchedule(sch); setAccess(a); setError(null);
    } catch (e: any) {
      setError(e.message ?? String(e));
    }
  }, []);
  useFocusEffect(useCallback(() => { load(); }, [load]));
  useEffect(() => subscribeSports(load), [load]);
  const refresh = async () => { setRefreshing(true); await load(); setRefreshing(false); };

  const header = <Stack.Screen options={{ title: 'Activities' }} />;
  if (error) return <ScrollView style={s.screen} contentContainerStyle={s.pad}>{header}<Card><H>Couldn't load activities</H><P muted>{error}</P><Button label="Try again" onPress={load} /></Card></ScrollView>;
  if (!data) return <>{header}<Loading /></>;

  const today = schoolToday();
  const shown = inCategory(data.sports, filter);
  const { inSeason, upcoming, others } = sportSections(shown, data.seasons, today);
  const why = (id: string) => mine.find((m) => m.sportId === id);
  const sportOf = (e: SportEvent) => data.sports.find((x) => x.id === data.seasons.find((se) => se.id === e.seasonId)?.sportId);
  const mySchedule = schedule.filter((e) => { const sp = sportOf(e); return !!sp && (filter === 'all' || sp.category === filter); });
  const myCount = mine.filter((m) => shown.some((x) => x.id === m.sportId)).length;
  const open = (id: string) => router.push(`/activities/${id}`);
  const canAdd = !!access?.permissions.includes('sports.manage');
  const kind = filter === 'all' ? '' : `${categoryInfo(filter).label.toLowerCase()} `;

  return (
    <ScrollView style={s.screen} contentContainerStyle={s.pad}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={C.primary} />}>
      {header}
      <CategoryPills value={filter} onChange={setFilter} />

      {me && !me.pending && (
        <>
          <Section title="Your schedule" />
          {myCount === 0 ? (
            <Card><P muted>Follow {filter === 'all' ? 'an activity' : `a ${kind}activity`} with its ★ button, or sign up your child, and their schedule shows up here.</P></Card>
          ) : mySchedule.length === 0 ? (
            <Card><P muted>Nothing on the schedule for your {kind}activities in the next two months.</P></Card>
          ) : mySchedule.slice(0, 8).map((e) => {
            const sport = sportOf(e);
            return <EventRow key={e.id} e={e} sport={sport} onPress={sport ? () => open(sport.id) : undefined} />;
          })}
        </>
      )}
      {!me && (
        <Card><P muted>Sign in on the Connect tab to follow activities, sign your children up and see your schedule here.</P></Card>
      )}

      {shown.length === 0 && (
        <Card><H>No {kind}activities yet</H><P muted>They show up here once the school adds them.</P></Card>
      )}

      {inSeason.length > 0 && <Section title="Happening now" />}
      {inSeason.map(({ sport, season }) => (
        <SportRow key={sport.id} sport={sport} onPress={() => open(sport.id)} following={why(sport.id)?.following} registered={why(sport.id)?.registered}
          line={`${season.name} · ${dateRange(season.startsOn, season.endsOn)}`} />
      ))}

      {upcoming.length > 0 && <Section title="Coming up" />}
      {upcoming.map(({ sport, season }) => (
        <SportRow key={season.id} sport={sport} onPress={() => open(sport.id)} following={why(sport.id)?.following} registered={why(sport.id)?.registered}
          line={[`${season.name} starts ${shortDay(season.startsOn)}`, signupLine(season, today)].filter(Boolean).join(' · ')} />
      ))}

      {others.length > 0 && <Section title={inSeason.length || upcoming.length ? `More ${kind}activities` : `${kind}activities`} />}
      {others.map((sport) => (
        <SportRow key={sport.id} sport={sport} onPress={() => open(sport.id)} following={why(sport.id)?.following}
          line="No season scheduled yet" />
      ))}

      {canAdd && (
        <View style={{ marginTop: 8 }}>
          <Button label="+ Add an activity" kind="ghost"
            onPress={() => router.push({ pathname: '/activities/edit', params: filter === 'all' ? {} : { category: filter } })} />
        </View>
      )}
    </ScrollView>
  );
}
