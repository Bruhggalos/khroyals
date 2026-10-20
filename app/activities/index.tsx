/**
 * Activities (Apps → Activities): sports, theater, music, art and clubs. Pick a category
 * (or All), or search. "Your activities" are the ones you follow (★), a child is registered
 * for, or you opened lately; "Upcoming events" counts down to what's next for them, with
 * where it is and Are you going? for registered children. Below: what's happening now,
 * seasons coming up with sign-up info, and every other activity to follow. Anyone can
 * browse; following, sign-ups and answers need an approved account.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, Text, TextInput, View } from 'react-native';
import { Stack, router, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import {
  listSports, myAccess, mySports, mySportSchedule, session, subscribeSports,
  type Access, type MySport, type Person, type Sport, type SportEvent, type SportSeason,
} from '../../src/api/connect';
import { ActivityCard, AttendanceLine, EventCard, MoreCard, RsvpButton } from '../../src/sports/cards';
import { CATEGORIES, categoryInfo, inCategory, type Category } from '../../src/sports/categories';
import { useEventPeople, useNow } from '../../src/sports/hooks';
import { recentActivities } from '../../src/sports/recent';
import { dateRange, schoolToday, seasonState, shortDay, signupState, sportSections } from '../../src/sports/seasons';
import { SportRow } from '../../src/sports/ui';
import { Button, C, Card, H, Loading, P, PLACEHOLDER, s } from '../../src/ui';

const Section = ({ title }: { title: string }) => (
  <Text style={{ fontSize: 22, fontWeight: '800', color: C.ink, marginTop: 10 }}>{title}</Text>
);
const SmallSection = ({ title }: { title: string }) => (
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

/** A row of cards that scrolls sideways, edge to edge. */
const Carousel = ({ children }: { children: React.ReactNode }) => (
  <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginHorizontal: -16 }}
    contentContainerStyle={{ gap: 12, paddingHorizontal: 16, alignItems: 'stretch' }}>
    {children}
  </ScrollView>
);

export default function ActivitiesHome() {
  const [data, setData] = useState<{ sports: Sport[]; seasons: SportSeason[] } | null>(null);
  const [me, setMe] = useState<Person | null>(null);
  const [access, setAccess] = useState<Access | null>(null);
  const [mine, setMine] = useState<MySport[]>([]);
  const [schedule, setSchedule] = useState<SportEvent[]>([]);
  const [recent, setRecent] = useState<string[]>([]);
  const [filter, setFilter] = useState<Category | 'all'>('all');
  const [searching, setSearching] = useState(false);
  const [query, setQuery] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const scroll = useRef<ScrollView>(null);
  const [allY, setAllY] = useState(0);
  const now = useNow();

  const load = useCallback(async () => {
    try {
      const [p, r] = await Promise.all([session(), recentActivities()]);
      const d = await listSports();  // after session(), so team photos are signed for approved accounts
      const approved = p && !p.pending;
      const [m, sch, a] = approved ? await Promise.all([mySports(), mySportSchedule(), myAccess().catch(() => null)]) : [[], [], null];
      setData(d); setMe(p); setMine(m); setSchedule(sch); setAccess(a); setRecent(r); setError(null);
    } catch (e: any) {
      setError(e.message ?? String(e));
    }
  }, []);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  const today = schoolToday();
  const sportOf = (e: SportEvent) => data?.sports.find((x) => x.id === data.seasons.find((se) => se.id === e.seasonId)?.sportId);
  const upcoming = schedule.filter((e) => { const sp = sportOf(e); return !!sp && (filter === 'all' || sp.category === filter); }).slice(0, 8);
  const rsvp = useEventPeople(me, upcoming);
  useEffect(() => subscribeSports(() => { load(); rsvp.reload(); }), [load, rsvp.reload]);
  const refresh = async () => { setRefreshing(true); await Promise.all([load(), rsvp.reload()]); setRefreshing(false); };

  const header = (
    <Stack.Screen options={{
      title: 'Activities',
      headerRight: () => (
        <Pressable onPress={() => { setSearching(!searching); setQuery(''); }} hitSlop={10} accessibilityRole="button"
          accessibilityLabel={searching ? 'Close search' : 'Search activities'} style={{ marginRight: 8 }}>
          <Ionicons name={searching ? 'close' : 'search'} size={22} color="#fff" />
        </Pressable>
      ),
    }} />
  );
  if (error) return <ScrollView style={s.screen} contentContainerStyle={s.pad}>{header}<Card><H>Couldn't load activities</H><P muted>{error}</P><Button label="Try again" onPress={load} /></Card></ScrollView>;
  if (!data) return <>{header}<Loading /></>;

  const shown = inCategory(data.sports, filter);
  const { inSeason, upcoming: comingUp, others } = sportSections(shown, data.seasons, today);
  const why = (id: string) => mine.find((m) => m.sportId === id);
  const open = (id: string) => router.push(`/activities/${id}`);
  const canAdd = !!access?.permissions.includes('sports.manage');
  const kind = filter === 'all' ? '' : `${categoryInfo(filter).label.toLowerCase()} `;

  // Yours first (registered, then followed), then ones you opened lately.
  const yours = [
    ...shown.filter((sp) => why(sp.id)?.registered),
    ...shown.filter((sp) => why(sp.id)?.following && !why(sp.id)?.registered),
    ...recent.map((rid) => shown.find((sp) => sp.id === rid)).filter((sp): sp is Sport => !!sp && !why(sp.id)),
  ];
  const seasonLabel = (sp: Sport) => {
    const ss = data.seasons.filter((se) => se.sportId === sp.id && seasonState(se, today) !== 'over');
    const cur = ss.find((se) => seasonState(se, today) === 'in-season') ?? ss[0];
    return cur?.name ?? categoryInfo(sp.category).label;
  };
  const q = query.trim().toLowerCase();
  const results = q ? data.sports.filter((sp) => `${sp.name} ${sp.description} ${categoryInfo(sp.category).label}`.toLowerCase().includes(q)) : [];

  return (
    <ScrollView ref={scroll} style={s.screen} contentContainerStyle={s.pad} keyboardShouldPersistTaps="handled"
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={C.primary} />}>
      {header}
      {searching && (
        <View style={[s.row, s.input, { gap: 8, paddingVertical: 10 }]}>
          <Ionicons name="search" size={18} color={C.muted} />
          <TextInput value={query} onChangeText={setQuery} autoFocus placeholder="Search activities" placeholderTextColor={PLACEHOLDER}
            accessibilityLabel="Search activities" style={{ flex: 1, fontSize: 15, color: C.ink, padding: 0 }} returnKeyType="search" />
        </View>
      )}

      {q ? (
        <>
          <SmallSection title={`${results.length} ${results.length === 1 ? 'activity' : 'activities'}`} />
          {results.length === 0 && <Card><P muted>No activities match “{query.trim()}”.</P></Card>}
          {results.map((sp) => (
            <SportRow key={sp.id} sport={sp} onPress={() => open(sp.id)} following={why(sp.id)?.following} registered={why(sp.id)?.registered}
              line={`${categoryInfo(sp.category).emoji} ${categoryInfo(sp.category).label} · ${seasonLabel(sp)}`} />
          ))}
        </>
      ) : (
        <>
          <CategoryPills value={filter} onChange={setFilter} />

          {yours.length > 0 && (
            <>
              <Section title="Your activities" />
              <Carousel>
                {yours.map((sp) => (
                  <ActivityCard key={sp.id} sport={sp} label={seasonLabel(sp)} onPress={() => open(sp.id)}
                    badge={why(sp.id)?.registered ? 'registered' : why(sp.id)?.following ? 'following' : 'viewed'} />
                ))}
                <MoreCard icon="people" title="All activities" width={168} onPress={() => scroll.current?.scrollTo({ y: allY, animated: true })} />
              </Carousel>
            </>
          )}

          {me && !me.pending && (
            <>
              <Section title="Upcoming events" />
              {mine.filter((m) => shown.some((x) => x.id === m.sportId)).length === 0 ? (
                <Card><P muted>Follow {filter === 'all' ? 'an activity' : `a ${kind}activity`} with its ★ button, or sign up your child, and its games, practices and rehearsals count down here.</P></Card>
              ) : upcoming.length === 0 ? (
                <Card><P muted>Nothing on the schedule for your {kind}activities in the next two months.</P></Card>
              ) : (
                <Carousel>
                  {upcoming.map((e) => {
                    const sport = sportOf(e);
                    const people = rsvp.peopleFor(e);
                    const att = rsvp.attendanceFor(e);
                    return (
                      <EventCard key={e.id} e={e} sport={sport} now={now} onPress={sport ? () => open(sport.id) : undefined}
                        footer={people.length || att.length ? (
                          <>
                            <AttendanceLine rows={att} />
                            <RsvpButton e={e} people={people} answers={rsvp.answers} onChange={rsvp.reload} />
                          </>
                        ) : undefined} />
                    );
                  })}
                  <MoreCard icon="calendar" title="Full schedule" hint="Everything coming up for your activities" width={220}
                    onPress={() => router.push('/activities/schedule')} />
                </Carousel>
              )}
            </>
          )}
          {!me && (
            <Card><P muted>Sign in on the Connect tab to follow activities, sign your children up and see what's coming up here.</P></Card>
          )}

          <View onLayout={(ev) => setAllY(ev.nativeEvent.layout.y)} style={{ gap: 12 }}>
            {shown.length === 0 && (
              <Card><H>No {kind}activities yet</H><P muted>They show up here once the school adds them.</P></Card>
            )}
            {inSeason.length > 0 && <SmallSection title="Happening now" />}
            {inSeason.map(({ sport, season }) => (
              <SportRow key={sport.id} sport={sport} onPress={() => open(sport.id)} following={why(sport.id)?.following} registered={why(sport.id)?.registered}
                line={`${season.name} · ${dateRange(season.startsOn, season.endsOn)}`} />
            ))}
            {comingUp.length > 0 && <SmallSection title="Coming up" />}
            {comingUp.map(({ sport, season }) => (
              <SportRow key={season.id} sport={sport} onPress={() => open(sport.id)} following={why(sport.id)?.following} registered={why(sport.id)?.registered}
                line={[`${season.name} starts ${shortDay(season.startsOn)}`, signupLine(season, today)].filter(Boolean).join(' · ')} />
            ))}
            {others.length > 0 && <SmallSection title={inSeason.length || comingUp.length ? `More ${kind}activities` : `${kind}activities`} />}
            {others.map((sport) => (
              <SportRow key={sport.id} sport={sport} onPress={() => open(sport.id)} following={why(sport.id)?.following}
                line="No season scheduled yet" />
            ))}
          </View>

          {canAdd && (
            <View style={{ marginTop: 8 }}>
              <Button label="+ Add an activity" kind="ghost"
                onPress={() => router.push({ pathname: '/activities/edit', params: filter === 'all' ? {} : { category: filter } })} />
            </View>
          )}
        </>
      )}
    </ScrollView>
  );
}
