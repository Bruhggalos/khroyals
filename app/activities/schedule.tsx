/**
 * Activities → Full schedule: everything coming up in the next two months for the activities
 * you follow or a child is registered for, with where it is and Are you going?. Past items
 * aren't listed (like every calendar in the app).
 */
import { Fragment, useCallback, useEffect, useState } from 'react';
import { RefreshControl, ScrollView, Text } from 'react-native';
import { Stack, router, useFocusEffect } from 'expo-router';
import { canBuyTickets, listSports, mySportSchedule, session, subscribeSports, type Person, type Sport, type SportEvent, type SportSeason } from '../../src/api/connect';
import { AttendanceLine, RsvpButton } from '../../src/sports/cards';
import { useEventPeople } from '../../src/sports/hooks';
import { EventRow } from '../../src/sports/ui';
import { TicketButtons, useTicketsOnSale } from '../../src/tickets/parts';
import { C, Card, Loading, P, s } from '../../src/ui';

const dayLabel = (iso: string) => new Date(iso).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });

export default function ActivitySchedule() {
  const [me, setMe] = useState<Person | null | undefined>(undefined);
  const [data, setData] = useState<{ sports: Sport[]; seasons: SportSeason[] } | null>(null);
  const [events, setEvents] = useState<SportEvent[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const load = useCallback(async () => {
    const p = await session().catch(() => null);
    const [d, ev] = await Promise.all([listSports(), p && !p.pending ? mySportSchedule(60) : Promise.resolve([])]);
    setMe(p); setData(d); setEvents(ev);
  }, []);
  useFocusEffect(useCallback(() => { load(); }, [load]));
  const rsvp = useEventPeople(me ?? null, events);
  const onSale = useTicketsOnSale();
  useEffect(() => subscribeSports(() => { load(); rsvp.reload(); }), [load, rsvp.reload]);

  const header = <Stack.Screen options={{ title: 'Your schedule' }} />;
  if (me === undefined || !data) return <>{header}<Loading /></>;
  const sportOf = (e: SportEvent) => data.sports.find((x) => x.id === data.seasons.find((se) => se.id === e.seasonId)?.sportId);

  return (
    <ScrollView style={s.screen} contentContainerStyle={s.pad}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={async () => { setRefreshing(true); await Promise.all([load(), rsvp.reload()]); setRefreshing(false); }} tintColor={C.primary} />}>
      {header}
      {!me && <Card><P muted>Sign in on the Connect tab to see the schedule for the activities you follow.</P></Card>}
      {!!me && events.length === 0 && <Card><P muted>Nothing coming up in the next two months for the activities you follow or your children are registered for.</P></Card>}
      {events.map((e, i) => {
        const sport = sportOf(e);
        const newDay = i === 0 || dayLabel(events[i - 1].startsAt) !== dayLabel(e.startsAt);
        const people = rsvp.peopleFor(e);
        const att = rsvp.attendanceFor(e);
        return (
          <Fragment key={e.id}>
            {newDay && <Text style={{ fontSize: 13, fontWeight: '800', color: C.muted, letterSpacing: 0.5, marginTop: 6 }}>{dayLabel(e.startsAt).toUpperCase()}</Text>}
            <EventRow e={e} sport={sport} onPress={sport ? () => router.push(`/activities/${sport.id}`) : undefined}
              footer={people.length || att.length || onSale.has(e.id) ? (
                <>
                  <AttendanceLine rows={att} />
                  <RsvpButton e={e} people={people} answers={rsvp.answers} onChange={rsvp.reload} />
                  <TicketButtons eventId={e.id} onSale={onSale.get(e.id)} buyer={canBuyTickets(me)} leader={false} />
                </>
              ) : undefined} />
          </Fragment>
        );
      })}
    </ScrollView>
  );
}
