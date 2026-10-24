import { useCallback, useEffect, useLayoutEffect, useState } from 'react';
import { ScrollView, Text, View } from 'react-native';
import { router, useFocusEffect, useNavigation } from 'expo-router';
import {
  canVolunteer, carlineConfig, isSchoolStaff, listAssignments, listSports, listVolunteer, live, me, myPickupChildren,
  mySportSchedule, onAuthChange, session, type Person,
} from '../../src/api/connect';
import { getCalendar, getNews } from '../../src/api/mockApi';
import { dueLabel, groupAssignments } from '../../src/assignments/groups';
import { schoolToday } from '../../src/calendar/past';
import { clock, hoursLabel } from '../../src/carline/format';
import { eventsToday, greeting, headerDate, nextTwoWeeks, noSchool, schoolHour, uniformFor } from '../../src/info/today';
import { TodaySection, type TodayItem } from '../../src/info/TodaySection';
import { ArticleCard } from '../../src/site/Blocks';
import { C, Card, H, Loading, P, s, useLoad } from '../../src/ui';
import { dateRange } from '../../src/site/calendar';

/**
 * Info: today's date in the header, a greeting, what's going on today (the uniform, the
 * day's events, assignments, activities, volunteer sign-ups and car line hours), the
 * next two weeks on the school calendar, and the latest news. (The khroyals.com home
 * page's other sections aren't shown here; its F.A.Q.s are in Ask the School.)
 */
export default function Home() {
  const now = useMinute();
  const today = schoolToday(now);
  const navigation = useNavigation();
  useLayoutEffect(() => { navigation.setOptions({ headerTitle: headerDate(today) }); }, [navigation, today]);

  const person = usePerson();
  const { data } = useLoad(async () => ({ news: await getNews(), cal: await getCalendar() }));
  const day = useDay(person, today);
  if (!data) return <Loading />;

  const events = data.cal.events;
  const dayOff = noSchool(today, events);
  const uniform = uniformFor(today, events, day.grades);
  const items: TodayItem[] = [
    ...eventsToday(today, events).map((e): TodayItem => ({ key: `cal-${e.id}`, icon: 'calendar-outline', title: e.title, detail: e.category, href: '/calendar' })),
    ...(dayOff ? day.items.filter((it) => !it.key.startsWith('carline')) : day.items),
  ];
  const next = nextTwoWeeks(events, today);

  return (
    <ScrollView style={s.screen} contentContainerStyle={[s.pad, { gap: 22 }]}>
      <Text style={{ fontSize: 28, fontWeight: '800', color: C.primary }} accessibilityRole="header">{greeting(schoolHour(now), person)}</Text>

      <View style={{ gap: 8 }}>
        <H>Today</H>
        <TodaySection dayOff={dayOff} uniform={uniform} items={items} />
      </View>

      <View style={{ gap: 8 }}>
        <H>Coming Up</H>
        {next.length === 0 && (
          <Card style={{ gap: 4 }}>
            <Text style={{ fontSize: 17, fontWeight: '800', color: C.ink }}>Stay tuned!</Text>
            <P muted>Nothing on the school calendar in the next two weeks.</P>
          </Card>
        )}
        {next.map((e) => (
          <Card key={e.id} onPress={() => router.navigate('/calendar')} style={{ flexDirection: 'row', gap: 12, alignItems: 'center' }}>
            <Text style={{ fontWeight: '800', color: C.primary, width: 86 }}>{dateRange(e)}</Text>
            <View style={{ flex: 1 }}><Text style={{ fontWeight: '600', color: C.ink }}>{e.title}</Text><P muted>{e.category}</P></View>
          </Card>
        ))}
        <Text style={{ color: C.primary, fontWeight: '700' }} onPress={() => router.navigate('/calendar')}>Full calendar ›</Text>
      </View>

      <View style={{ gap: 8 }}>
        <H>Latest News</H>
        {data.news.articles.slice(0, 3).map((a) => <ArticleCard key={a.id} a={a} compact />)}
        <Text style={{ color: C.primary, fontWeight: '700' }} onPress={() => router.navigate('/news')}>All news ›</Text>
      </View>
    </ScrollView>
  );
}

/** The time, updated every minute (for the greeting, and the date at midnight). */
function useMinute() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(t);
  }, []);
  return now;
}

/** The signed-in person, kept current as they sign in and out. */
function usePerson() {
  const [person, setPerson] = useState<Person | null>(() => me());
  useEffect(() => {
    const check = () => session().then(setPerson).catch(() => {});
    check();
    return onAuthChange(check);
  }, []);
  useFocusEffect(useCallback(() => { setPerson(me()); }, []));
  return person;
}

const NONE = { items: [] as TodayItem[], grades: [] as (number | null | undefined)[] };

/**
 * The signed-in person's day: assignments due (students; teachers see their classes'),
 * activities, volunteer sign-ups and car line hours (for whoever picks children up), and
 * the grades whose Chapel uniform to show. Each part loads on its own and is left out if
 * it fails. Reloads when the screen comes back into view.
 */
function useDay(person: Person | null, today: string) {
  const [day, setDay] = useState(NONE);
  const id = person && !person.pending ? person.id : null;
  const load = useCallback(async () => {
    if (!live || !person || !id) { setDay({ ...NONE, grades: person?.grade != null ? [person.grade] : [] }); return; }
    const student = person.schoolRole === 'student';
    const staff = isSchoolStaff(person);
    const quiet = <T,>(p: Promise<T>, fallback: T) => p.catch(() => fallback);
    const [assignments, schedule, sports, volunteer, kids] = await Promise.all([
      student || staff ? quiet(listAssignments(), []) : [],
      quiet(mySportSchedule(2), []),
      quiet(listSports(), { sports: [], seasons: [] }),
      canVolunteer(person) ? quiet(listVolunteer(), { opportunities: [], signups: [] }) : { opportunities: [], signups: [] },
      student ? [] : quiet(myPickupChildren(), [] as Person[]),
    ]);
    const config = kids.length ? await quiet(carlineConfig(), null) : null;

    const items: TodayItem[] = [];
    const g = groupAssignments(assignments, today);
    if (student) {
      for (const a of g.today) items.push({ key: `asg-${a.id}`, icon: 'checkbox-outline', title: a.title, detail: [a.className, 'Due today'].filter(Boolean).join(' · '), href: '/assignments' });
      if (g.overdue.length) {
        items.push({ key: 'asg-overdue', icon: 'alert-circle-outline', tint: C.danger, href: '/assignments',
          title: `${g.overdue.length} overdue assignment${g.overdue.length === 1 ? '' : 's'}`, detail: g.overdue.length === 1 ? `${g.overdue[0].title} · ${dueLabel(g.overdue[0].dueOn, today)}` : undefined });
      }
    } else if (staff) {
      for (const a of g.today) items.push({ key: `asg-${a.id}`, icon: 'checkbox-outline', title: a.title, detail: `Due today · ${a.className ?? 'your class'}`, href: '/assignments' });
    }

    const sportOf = (seasonId: string) => sports.sports.find((x) => x.id === sports.seasons.find((se) => se.id === seasonId)?.sportId);
    for (const e of schedule.filter((x) => schoolToday(new Date(x.startsAt)) === today)) {
      const sport = sportOf(e.seasonId);
      items.push({
        key: `sport-${e.id}`, icon: 'trophy-outline', tint: e.cancelled ? C.muted : C.accent,
        title: sport && !e.title.includes(sport.name) ? `${sport.name}: ${e.title}` : e.title,
        detail: e.cancelled ? 'Cancelled' : [clock(e.startsAt), e.location].filter(Boolean).join(' · '),
        href: sport ? `/activities/${sport.id}` : '/activities',
      });
    }

    for (const sgn of volunteer.signups.filter((x) => x.userId === id)) {
      const o = volunteer.opportunities.find((x) => x.id === sgn.opportunityId);
      if (!o || o.status !== 'open' || o.startsOn > today || (o.endsOn ?? o.startsOn) < today) continue;
      const when = o.startTime && o.endTime ? hoursLabel(o.startTime, o.endTime) : o.startTime ? clock(`${today}T${o.startTime}`) : null;
      items.push({ key: `vol-${o.id}`, icon: 'hand-left-outline', tint: '#15803D', title: o.title, href: `/volunteer/${o.id}`,
        detail: o.kind === 'items' ? `Bring ${sgn.quantity ?? ''} ${o.item ?? 'items'}`.replace(/\s+/g, ' ') : ['You signed up', when, o.location].filter(Boolean).join(' · ') });
    }

    if (config) {
      items.push({ key: 'carline', icon: 'car-outline', title: 'Car line pickup', href: '/carline',
        detail: `${hoursLabel(config.start, config.end)}${config.line.state === 'open' ? ' · Open now' : ''}` });
    }

    const grades = student ? [person.grade] : kids.map((k) => k.grade);
    setDay({ items, grades });
  }, [person, id, today]);
  useFocusEffect(useCallback(() => { load(); }, [load]));
  return day;
}
