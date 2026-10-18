/**
 * Sports (Apps → Sports): your schedule for the sports you're involved in (followed ★, or
 * a child registered), what's in season, seasons coming up with sign-up info, and every
 * other sport to follow. Anyone can browse; following and sign-up need an approved account.
 */
import { useCallback, useEffect, useState } from 'react';
import { RefreshControl, ScrollView, Text } from 'react-native';
import { Stack, router, useFocusEffect } from 'expo-router';
import {
  listSports, myAccess, mySports, mySportSchedule, session, subscribeSports,
  type Access, type MySport, type Person, type Sport, type SportEvent, type SportSeason,
} from '../../src/api/connect';
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

export default function SportsHome() {
  const [data, setData] = useState<{ sports: Sport[]; seasons: SportSeason[] } | null>(null);
  const [me, setMe] = useState<Person | null>(null);
  const [access, setAccess] = useState<Access | null>(null);
  const [mine, setMine] = useState<MySport[]>([]);
  const [schedule, setSchedule] = useState<SportEvent[]>([]);
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

  const header = <Stack.Screen options={{ title: 'Sports' }} />;
  if (error) return <ScrollView style={s.screen} contentContainerStyle={s.pad}>{header}<Card><H>Couldn't load sports</H><P muted>{error}</P><Button label="Try again" onPress={load} /></Card></ScrollView>;
  if (!data) return <>{header}<Loading /></>;

  const today = schoolToday();
  const { inSeason, upcoming, others } = sportSections(data.sports, data.seasons, today);
  const why = (id: string) => mine.find((m) => m.sportId === id);
  const sportOf = (e: SportEvent) => data.sports.find((x) => x.id === data.seasons.find((se) => se.id === e.seasonId)?.sportId);
  const open = (id: string) => router.push(`/sports/${id}`);
  const canAdd = !!access?.permissions.includes('sports.manage');

  return (
    <ScrollView style={s.screen} contentContainerStyle={s.pad}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={C.primary} />}>
      {header}

      {me && !me.pending && (
        <>
          <Section title="Your schedule" />
          {mine.length === 0 ? (
            <Card><P muted>Follow a sport with its ★ button, or sign up your child, and their games and practices show up here.</P></Card>
          ) : schedule.length === 0 ? (
            <Card><P muted>Nothing on the schedule for your sports in the next two months.</P></Card>
          ) : schedule.slice(0, 8).map((e) => {
            const sport = sportOf(e);
            return <EventRow key={e.id} e={e} sport={sport} onPress={sport ? () => open(sport.id) : undefined} />;
          })}
        </>
      )}
      {!me && (
        <Card><P muted>Sign in on the Connect tab to follow sports, sign your children up and see your schedule here.</P></Card>
      )}

      {data.sports.length === 0 && (
        <Card><H>No sports yet</H><P muted>Sports show up here once the athletic department adds them.</P></Card>
      )}

      {inSeason.length > 0 && <Section title="In season" />}
      {inSeason.map(({ sport, season }) => (
        <SportRow key={sport.id} sport={sport} onPress={() => open(sport.id)} following={why(sport.id)?.following} registered={why(sport.id)?.registered}
          line={`${season.name} · ${dateRange(season.startsOn, season.endsOn)}`} />
      ))}

      {upcoming.length > 0 && <Section title="Coming up" />}
      {upcoming.map(({ sport, season }) => (
        <SportRow key={season.id} sport={sport} onPress={() => open(sport.id)} following={why(sport.id)?.following} registered={why(sport.id)?.registered}
          line={[`${season.name} starts ${shortDay(season.startsOn)}`, signupLine(season, today)].filter(Boolean).join(' · ')} />
      ))}

      {others.length > 0 && <Section title={inSeason.length || upcoming.length ? 'More sports' : 'Sports'} />}
      {others.map((sport) => (
        <SportRow key={sport.id} sport={sport} onPress={() => open(sport.id)} following={why(sport.id)?.following}
          line="No season scheduled yet" />
      ))}

      {canAdd && <Button label="+ Add a sport" kind="ghost" onPress={() => router.push('/sports/edit')} />}
    </ScrollView>
  );
}
