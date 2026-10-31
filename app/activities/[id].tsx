/**
 * One activity (a sport, show, ensemble, club…): its team photo, follow it (★), its current and
 * next season (details, grades, sign-up for your children), and its schedule with where each item
 * is and Are you going? for registered children. Its coaches or directors and the activity
 * managers also see who's coming, change the team photo, approve sign-ups and edit the schedule
 * and seasons; activity managers edit the activity and who leads it.
 */
import { useCallback, useEffect, useState } from 'react';
import { Alert, Linking, Platform, RefreshControl, ScrollView, Text, TextInput, View } from 'react-native';
import { Stack, router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import {
  canBuyTickets, canManageSport, decideSportRegistration, followSport, getUser, isFamily, listSports, listUsers, myAccess, myChildren, mySports,
  registerForSport, removeSportPhoto, session, setSportCoach, sportRegistrations, sportSchedule, subscribeSports, uploadSportPhoto,
  withdrawSportRegistration, type Access, type Person, type Sport, type SportEvent, type SportRegistration, type SportSeason,
} from '../../src/api/connect';
import { pickSquarePhoto } from '../../src/photos';
import { AttendanceLine, RsvpButton, SportAvatar } from '../../src/sports/cards';
import { useEventPeople } from '../../src/sports/hooks';
import { noteActivityViewed } from '../../src/sports/recent';
import { isPastTime, splitPast } from '../../src/calendar/past';
import { PastToggle, usePastToggle } from '../../src/calendar/PastToggle';
import { categoryInfo, leaders } from '../../src/sports/categories';
import { activeSeasons, dateRange, eligible, gradesLabel, schoolToday, seasonState, shortDay, signupState } from '../../src/sports/seasons';
import { EventRow, StarButton, Tag } from '../../src/sports/ui';
import { TicketButtons, useTicketsOnSale } from '../../src/tickets/parts';
import { Button, C, Card, H, Loading, P, s } from '../../src/ui';

const name = (id: string | null) => { const p = id ? getUser(id) : undefined; return p ? `${p.firstName} ${p.lastName}` : 'Someone'; };
const confirm = (title: string, ok: string, go: () => void) => {
  if (Platform.OS === 'web') { if (globalThis.confirm?.(title)) go(); return; }
  Alert.alert(title, undefined, [{ text: 'Cancel', style: 'cancel' }, { text: ok, style: 'destructive', onPress: go }]);
};
const fail = (e: any) => Alert.alert('Activities', e?.message ?? String(e));

export default function SportPage() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [sport, setSport] = useState<Sport | null | undefined>(undefined);
  const [seasons, setSeasons] = useState<SportSeason[]>([]);
  const [events, setEvents] = useState<SportEvent[]>([]);
  const [regs, setRegs] = useState<SportRegistration[]>([]);
  const [kids, setKids] = useState<Person[]>([]);
  const [me, setMe] = useState<Person | null>(null);
  const [access, setAccess] = useState<Access | null>(null);
  const [following, setFollowing] = useState(false);
  const past = usePastToggle();
  const [refreshing, setRefreshing] = useState(false);

  const today = schoolToday();
  const load = useCallback(async () => {
    try {
      const p = await session();
      const d = await listSports();  // after session(), so the team photo is signed for approved accounts
      noteActivityViewed(id);
      const sp = d.sports.find((x) => x.id === id) ?? null;
      const active = sp ? activeSeasons(d.seasons, sp.id, schoolToday()) : [];
      const ids = active.map((x) => x.id);
      const approved = !!p && !p.pending;
      const [ev, rg, ks, mine, a] = await Promise.all([
        // Family accounts follow activities but don't sign children up.
        sportSchedule(ids, { past: true }), approved ? sportRegistrations(ids) : [], approved && !isFamily(p) ? myChildren() : [],
        approved ? mySports() : [], approved ? myAccess().catch(() => null) : null,
      ]);
      setSport(sp); setSeasons(active); setEvents(ev); setRegs(rg); setKids(ks); setMe(p); setAccess(a);
      setFollowing(mine.some((m) => m.sportId === id && m.following));
    } catch (e) {
      fail(e);
    }
  }, [id]);
  useFocusEffect(useCallback(() => { load(); }, [load]));
  const upcomingEvents = events.filter((e) => !isPastTime(e.startsAt, e.endsAt));
  const rsvp = useEventPeople(me, upcomingEvents);
  const onSale = useTicketsOnSale();
  useEffect(() => subscribeSports(() => { load(); rsvp.reload(); }), [load, rsvp.reload]);
  const refresh = async () => { setRefreshing(true); await Promise.all([load(), rsvp.reload()]); setRefreshing(false); };

  if (sport === undefined) return <><Stack.Screen options={{ title: 'Activities' }} /><Loading /></>;
  if (!sport) return <View style={[s.screen, s.pad]}><Stack.Screen options={{ title: 'Activities' }} /><Card><H>That activity is gone</H></Card></View>;

  const approved = !!me && !me.pending;
  const manage = canManageSport(sport, access, me);
  // Like every calendar in the app: past items stay out of view until asked for, then look greyed out.
  const schedule = splitPast(events, (e) => isPastTime(e.startsAt, e.endsAt));
  const isManager = !!access?.permissions.includes('sports.manage');
  const toggleFollow = () => {
    if (!approved) { Alert.alert('Follow', 'Sign in on the Connect tab to follow activities.'); return; }
    setFollowing(!following);
    followSport(sport.id, !following).catch((e) => { setFollowing(following); fail(e); });
  };

  return (
    <ScrollView style={s.screen} contentContainerStyle={s.pad} keyboardShouldPersistTaps="handled"
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={C.primary} />}>
      <Stack.Screen options={{ title: sport.name }} />

      <Card style={{ flexDirection: 'row', gap: 14, alignItems: 'center' }}>
        <SportAvatar sport={sport} size={76} />
        <View style={{ flex: 1, gap: 2 }}>
          <Text style={{ fontSize: 22, fontWeight: '800', color: C.ink }}>{sport.name}</Text>
          <Tag label={`${categoryInfo(sport.category).emoji} ${categoryInfo(sport.category).label}`} color={C.muted} />
          {!!sport.description && <P muted>{sport.description}</P>}
          {sport.coachIds.length > 0 && <P muted>{leaders(sport.category, sport.coachIds.length)}: {sport.coachIds.map(name).join(', ')}</P>}
        </View>
        <StarButton following={following} onPress={toggleFollow} />
      </Card>
      {manage && approved && <TeamPhotoLink sport={sport} onChange={load} />}
      <P muted>{following ? 'You\'ll see its schedule in Activities and hear about changes and sign-ups.' : 'Follow to see its schedule in Activities and hear about changes and sign-ups.'}</P>

      {seasons.length === 0 && <Card><P muted>No season is scheduled yet. Follow it to hear when sign-ups open.</P></Card>}
      {seasons.map((season) => (
        <SeasonCard key={season.id} season={season} today={today} kids={kids} regs={regs.filter((r) => r.seasonId === season.id)}
          approved={approved} manage={manage} leader={categoryInfo(sport.category).leader.toLowerCase()} onChange={load} />
      ))}

      <Text style={{ fontSize: 13, fontWeight: '800', color: C.muted, letterSpacing: 0.5, marginTop: 8 }}>SCHEDULE</Text>
      <PastToggle count={schedule.past.length} shown={past.shown} onToggle={past.toggle} />
      {[...(past.shown ? schedule.past : []), ...schedule.upcoming].map((e) => {
        const people = rsvp.peopleFor(e);
        const att = rsvp.attendanceFor(e);
        return (
          <EventRow key={e.id} e={e} past={past.shown && schedule.past.includes(e)}
            onPress={manage ? () => router.push({ pathname: '/activities/event', params: { sport: sport.id, id: e.id } }) : undefined}
            footer={people.length || att.length || onSale.has(e.id) || manage ? (
              <>
                <AttendanceLine rows={att} />
                <RsvpButton e={e} people={people} answers={rsvp.answers} onChange={rsvp.reload} />
                <TicketButtons eventId={e.id} onSale={onSale.get(e.id)} buyer={canBuyTickets(me)} leader={manage} />
              </>
            ) : undefined} />
        );
      })}
      {schedule.upcoming.length === 0 && <Card><P muted>Nothing coming up on the schedule.</P></Card>}

      {manage && (
        <ManagePanel sport={sport} seasons={seasons} regs={regs} isManager={isManager} onChange={load} />
      )}
    </ScrollView>
  );
}

/** Coaches/directors and activity managers: take, choose or remove the team photo. */
function TeamPhotoLink({ sport, onChange }: { sport: Sport; onChange: () => void }) {
  const [busy, setBusy] = useState(false);
  const choose = async (camera: boolean) => {
    const photo = await pickSquarePhoto(camera);
    if (!photo) return;
    setBusy(true);
    try { await uploadSportPhoto(sport.id, photo, sport.photoPath); onChange(); } catch (e) { fail(e); } finally { setBusy(false); }
  };
  const ask = () => {
    if (Platform.OS === 'web') { choose(false); return; }
    Alert.alert('Team photo', 'Families and staff see it on this activity and its events.', [
      { text: 'Take a photo', onPress: () => choose(true) },
      { text: 'Choose from library', onPress: () => choose(false) },
      ...(sport.photoPath ? [{ text: 'Remove photo', style: 'destructive' as const,
        onPress: () => { removeSportPhoto(sport.id, sport.photoPath).then(onChange).catch(fail); } }] : []),
      { text: 'Cancel', style: 'cancel' as const },
    ]);
  };
  return (
    <Text style={{ color: C.primary, fontWeight: '700' }} onPress={busy ? undefined : ask} accessibilityRole="button">
      {busy ? 'Uploading the team photo…' : sport.photoPath ? 'Change the team photo' : '+ Add a team photo'}
    </Text>
  );
}

/** A season: dates, grades, details, info link and, for parents, each child's sign-up. */
function SeasonCard({ season, today, kids, regs, approved, manage, leader, onChange }: {
  season: SportSeason; today: string; kids: Person[]; regs: SportRegistration[]; approved: boolean; manage: boolean; leader: string; onChange: () => void;
}) {
  const state = signupState(season, today);
  const grades = gradesLabel(season);
  return (
    <Card style={{ gap: 8 }}>
      <View style={[s.row, { justifyContent: 'space-between' }]}>
        <Text style={{ fontSize: 17, fontWeight: '800', color: C.ink, flex: 1 }}>{season.name}</Text>
        <Tag label={seasonState(season, today) === 'in-season' ? 'Happening now' : 'Coming up'} color={seasonState(season, today) === 'in-season' ? '#15803D' : C.primary} />
      </View>
      <P muted>{[dateRange(season.startsOn, season.endsOn), grades].filter(Boolean).join(' · ')}</P>
      {!!season.details && <P>{season.details}</P>}
      {!!season.infoUrl && (
        <Text style={{ color: C.primary, fontWeight: '700' }} onPress={() => Linking.openURL(season.infoUrl!)}>Season information ↗</Text>
      )}
      {state !== 'none' && (
        <Text style={{ fontWeight: '700', color: state === 'open' ? '#15803D' : C.muted }}>
          {state === 'open' ? `Sign-ups open until ${shortDay(season.signupCloses!)}`
            : state === 'soon' ? `Sign-ups open ${shortDay(season.signupOpens!)}` : 'Sign-ups are closed'}
        </Text>
      )}
      {approved && kids.map((k) => (
        <ChildSignUp key={k.id} kid={k} season={season} reg={regs.find((r) => r.studentId === k.id)} open={state === 'open'} leader={leader} onChange={onChange} />
      ))}
      {state === 'open' && approved && kids.length === 0 && !manage && <P muted>Parents sign their children up here.</P>}
      {manage && (
        <Text style={{ color: C.primary, fontWeight: '700' }}
          onPress={() => router.push({ pathname: '/activities/season', params: { sport: season.sportId, id: season.id } })}>Edit season</Text>
      )}
    </Card>
  );
}

/** One child's sign-up for a season: status, and Sign up or Withdraw. */
function ChildSignUp({ kid, season, reg, open, leader, onChange }: {
  kid: Person; season: SportSeason; reg?: SportRegistration; open: boolean; leader: string; onChange: () => void;
}) {
  const [writing, setWriting] = useState(false);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const active = reg && (reg.status === 'pending' || reg.status === 'registered');
  const can = eligible(season, kid.grade);
  const submit = () => {
    setBusy(true);
    registerForSport(season.id, kid.id, note.trim()).then(() => { setWriting(false); setNote(''); onChange(); }).catch(fail).finally(() => setBusy(false));
  };
  const status = reg?.status === 'registered' ? '✓ Registered'
    : reg?.status === 'pending' ? `Waiting for the ${leader} to approve`
      : reg?.status === 'declined' ? `Not accepted${reg.decisionNote ? `: ${reg.decisionNote}` : ''}` : !can ? `Not eligible (${gradesLabel(season)})` : '';
  return (
    <View style={{ gap: 6, borderTopWidth: 1, borderColor: C.line, paddingTop: 8 }}>
      <View style={[s.row, { justifyContent: 'space-between' }]}>
        <View style={{ flex: 1 }}>
          <Text style={{ fontWeight: '700', color: C.ink }}>{kid.firstName} {kid.lastName}</Text>
          {!!status && <Text style={{ color: reg?.status === 'registered' ? '#15803D' : C.muted }}>{status}</Text>}
        </View>
        {active ? (
          <Text style={{ color: C.danger, fontWeight: '700' }}
            onPress={() => confirm(`Withdraw ${kid.firstName} from ${season.name}?`, 'Withdraw', () => withdrawSportRegistration(reg!.id).then(onChange).catch(fail))}>
            Withdraw
          </Text>
        ) : open && can && !writing ? (
          <Text style={{ color: C.primary, fontWeight: '700' }} onPress={() => setWriting(true)}>Sign up</Text>
        ) : null}
      </View>
      {writing && (
        <>
          <TextInput style={[s.input, { minHeight: 60 }]} multiline placeholder={`Anything the ${leader} should know? (optional)`} value={note} onChangeText={setNote}
            accessibilityLabel={`Note for ${kid.firstName}'s sign-up`} />
          <View style={[s.row, { justifyContent: 'flex-end' }]}>
            <Button label="Cancel" kind="ghost" onPress={() => setWriting(false)} />
            <Button label={busy ? 'Sending…' : `Sign up ${kid.firstName}`} disabled={busy} onPress={submit} />
          </View>
        </>
      )}
    </View>
  );
}

/** Coaches/directors and activity managers: sign-ups to decide, the schedule and seasons; managers also who leads it and the activity. */
function ManagePanel({ sport, seasons, regs, isManager, onChange }: {
  sport: Sport; seasons: SportSeason[]; regs: SportRegistration[]; isManager: boolean; onChange: () => void;
}) {
  const [q, setQ] = useState('');
  const [staff, setStaff] = useState<Person[]>([]);
  useEffect(() => { if (isManager) listUsers().then((ps) => setStaff(ps.filter((p) => ['admin', 'teacher', 'staff'].includes(p.schoolRole)))); }, [isManager]);
  const pending = regs.filter((r) => r.status === 'pending');
  const registered = regs.filter((r) => r.status === 'registered');
  const seasonName = (sid: string) => seasons.find((x) => x.id === sid)?.name ?? '';
  const matches = q.trim().length < 2 ? [] : staff.filter((p) => !sport.coachIds.includes(p.id)
    && `${p.firstName} ${p.lastName}`.toLowerCase().includes(q.trim().toLowerCase())).slice(0, 5);

  return (
    <View style={{ gap: 12, marginTop: 8 }}>
      <Text style={{ fontSize: 13, fontWeight: '800', color: C.muted, letterSpacing: 0.5 }}>MANAGE {sport.name.toUpperCase()}</Text>
      <Card style={{ gap: 8 }}>
        <H>Sign-ups</H>
        {pending.length === 0 && <P muted>No sign-ups waiting.</P>}
        {pending.map((r) => (
          <View key={r.id} style={{ gap: 4, borderTopWidth: 1, borderColor: C.line, paddingTop: 8 }}>
            <Text style={{ fontWeight: '700', color: C.ink }}>{name(r.studentId)} · {seasonName(r.seasonId)}</Text>
            <P muted>From {name(r.requestedBy)}{r.note ? `: “${r.note}”` : ''}</P>
            <View style={[s.row, { justifyContent: 'flex-end' }]}>
              <Button label="Decline" kind="ghost" onPress={() => confirm(`Decline ${name(r.studentId)}'s sign-up?`, 'Decline',
                () => decideSportRegistration(r.id, false).then(onChange).catch(fail))} />
              <Button label="Approve" onPress={() => decideSportRegistration(r.id, true).then(onChange).catch(fail)} />
            </View>
          </View>
        ))}
        {registered.length > 0 && <P muted>Registered ({registered.length}): {registered.map((r) => name(r.studentId)).join(', ')}</P>}
      </Card>

      <Button label="+ Add to the schedule" onPress={() => router.push({ pathname: '/activities/event', params: { sport: sport.id } })} />
      <Button label="+ New season" kind="ghost" onPress={() => router.push({ pathname: '/activities/season', params: { sport: sport.id } })} />

      {isManager && (
        <Card style={{ gap: 8 }}>
          <H>{leaders(sport.category, 2)}</H>
          {sport.coachIds.length === 0 && <P muted>No {leaders(sport.category, 2).toLowerCase()} yet. Sign-ups go to the activity managers until there are.</P>}
          {sport.coachIds.map((cid) => (
            <View key={cid} style={[s.row, { justifyContent: 'space-between' }]}>
              <Text style={{ color: C.ink, fontWeight: '600' }}>{name(cid)}</Text>
              <Text style={{ color: C.danger, fontWeight: '700' }} onPress={() => setSportCoach(sport.id, cid, false).then(onChange).catch(fail)}>Remove</Text>
            </View>
          ))}
          <TextInput style={s.input} placeholder={`Add a ${categoryInfo(sport.category).leader.toLowerCase()}: search faculty and staff`} value={q} onChangeText={setQ}
            accessibilityLabel="Search faculty and staff" />
          {matches.map((p) => (
            <Text key={p.id} style={{ color: C.primary, fontWeight: '700', paddingVertical: 4 }}
              onPress={() => { setQ(''); setSportCoach(sport.id, p.id, true).then(onChange).catch(fail); }}>
              + {p.firstName} {p.lastName}
            </Text>
          ))}
        </Card>
      )}
      {isManager && <Button label="Edit activity" kind="ghost" onPress={() => router.push({ pathname: '/activities/edit', params: { id: sport.id } })} />}
    </View>
  );
}
