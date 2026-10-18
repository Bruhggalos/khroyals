/**
 * One sport: follow it (★), its current and next season (details, grades, sign-up for your
 * children), and its schedule. Coaches and sports managers also approve sign-ups, edit the
 * schedule and seasons; sports managers edit the sport and its coaches.
 */
import { useCallback, useEffect, useState } from 'react';
import { Alert, Linking, Platform, RefreshControl, ScrollView, Text, TextInput, View } from 'react-native';
import { Stack, router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import {
  canManageSport, decideSportRegistration, followSport, getUser, listSports, listUsers, myAccess, myChildren, mySports,
  registerForSport, session, setSportCoach, sportRegistrations, sportSchedule, subscribeSports, withdrawSportRegistration,
  type Access, type Person, type Sport, type SportEvent, type SportRegistration, type SportSeason,
} from '../../src/api/connect';
import { activeSeasons, dateRange, eligible, gradesLabel, schoolToday, seasonState, shortDay, signupState } from '../../src/sports/seasons';
import { EventRow, StarButton, Tag } from '../../src/sports/ui';
import { Button, C, Card, H, Loading, P, s } from '../../src/ui';

const name = (id: string | null) => { const p = id ? getUser(id) : undefined; return p ? `${p.firstName} ${p.lastName}` : 'Someone'; };
const confirm = (title: string, ok: string, go: () => void) => {
  if (Platform.OS === 'web') { if (globalThis.confirm?.(title)) go(); return; }
  Alert.alert(title, undefined, [{ text: 'Cancel', style: 'cancel' }, { text: ok, style: 'destructive', onPress: go }]);
};
const fail = (e: any) => Alert.alert('Sports', e?.message ?? String(e));

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
  const [refreshing, setRefreshing] = useState(false);

  const today = schoolToday();
  const load = useCallback(async () => {
    try {
      const [d, p] = await Promise.all([listSports(), session()]);
      const sp = d.sports.find((x) => x.id === id) ?? null;
      const active = sp ? activeSeasons(d.seasons, sp.id, schoolToday()) : [];
      const ids = active.map((x) => x.id);
      const approved = !!p && !p.pending;
      const [ev, rg, ks, mine, a] = await Promise.all([
        sportSchedule(ids), approved ? sportRegistrations(ids) : [], approved ? myChildren() : [],
        approved ? mySports() : [], approved ? myAccess().catch(() => null) : null,
      ]);
      setSport(sp); setSeasons(active); setEvents(ev); setRegs(rg); setKids(ks); setMe(p); setAccess(a);
      setFollowing(mine.some((m) => m.sportId === id && m.following));
    } catch (e) {
      fail(e);
    }
  }, [id]);
  useFocusEffect(useCallback(() => { load(); }, [load]));
  useEffect(() => subscribeSports(load), [load]);
  const refresh = async () => { setRefreshing(true); await load(); setRefreshing(false); };

  if (sport === undefined) return <><Stack.Screen options={{ title: 'Sports' }} /><Loading /></>;
  if (!sport) return <View style={[s.screen, s.pad]}><Stack.Screen options={{ title: 'Sports' }} /><Card><H>That sport is gone</H></Card></View>;

  const approved = !!me && !me.pending;
  const manage = canManageSport(sport, access, me);
  const isManager = !!access?.permissions.includes('sports.manage');
  const toggleFollow = () => {
    if (!approved) { Alert.alert('Follow', 'Sign in on the Connect tab to follow sports.'); return; }
    setFollowing(!following);
    followSport(sport.id, !following).catch((e) => { setFollowing(following); fail(e); });
  };

  return (
    <ScrollView style={s.screen} contentContainerStyle={s.pad} keyboardShouldPersistTaps="handled"
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={C.primary} />}>
      <Stack.Screen options={{ title: sport.name }} />

      <Card style={{ flexDirection: 'row', gap: 14, alignItems: 'center' }}>
        <Text style={{ fontSize: 46 }} accessible={false}>{sport.icon}</Text>
        <View style={{ flex: 1, gap: 2 }}>
          <Text style={{ fontSize: 22, fontWeight: '800', color: C.ink }}>{sport.name}</Text>
          {!!sport.description && <P muted>{sport.description}</P>}
          {sport.coachIds.length > 0 && <P muted>Coach{sport.coachIds.length > 1 ? 'es' : ''}: {sport.coachIds.map(name).join(', ')}</P>}
        </View>
        <StarButton following={following} onPress={toggleFollow} />
      </Card>
      <P muted>{following ? 'You\'ll see its schedule in Sports and hear about changes and sign-ups.' : 'Follow to see its schedule in Sports and hear about changes and sign-ups.'}</P>

      {seasons.length === 0 && <Card><P muted>No season is scheduled yet. Follow it to hear when sign-ups open.</P></Card>}
      {seasons.map((season) => (
        <SeasonCard key={season.id} season={season} today={today} kids={kids} regs={regs.filter((r) => r.seasonId === season.id)}
          approved={approved} manage={manage} onChange={load} />
      ))}

      <Text style={{ fontSize: 13, fontWeight: '800', color: C.muted, letterSpacing: 0.5, marginTop: 8 }}>SCHEDULE</Text>
      {events.length === 0 && <Card><P muted>Nothing on the schedule yet.</P></Card>}
      {events.map((e) => (
        <EventRow key={e.id} e={e}
          onPress={manage ? () => router.push({ pathname: '/sports/event', params: { sport: sport.id, id: e.id } }) : undefined} />
      ))}

      {manage && (
        <ManagePanel sport={sport} seasons={seasons} regs={regs} isManager={isManager} onChange={load} />
      )}
    </ScrollView>
  );
}

/** A season: dates, grades, details, info link and, for parents, each child's sign-up. */
function SeasonCard({ season, today, kids, regs, approved, manage, onChange }: {
  season: SportSeason; today: string; kids: Person[]; regs: SportRegistration[]; approved: boolean; manage: boolean; onChange: () => void;
}) {
  const state = signupState(season, today);
  const grades = gradesLabel(season);
  return (
    <Card style={{ gap: 8 }}>
      <View style={[s.row, { justifyContent: 'space-between' }]}>
        <Text style={{ fontSize: 17, fontWeight: '800', color: C.ink, flex: 1 }}>{season.name}</Text>
        <Tag label={seasonState(season, today) === 'in-season' ? 'In season' : 'Coming up'} color={seasonState(season, today) === 'in-season' ? '#15803D' : C.primary} />
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
        <ChildSignUp key={k.id} kid={k} season={season} reg={regs.find((r) => r.studentId === k.id)} open={state === 'open'} onChange={onChange} />
      ))}
      {state === 'open' && approved && kids.length === 0 && !manage && <P muted>Parents sign their children up here.</P>}
      {manage && (
        <Text style={{ color: C.primary, fontWeight: '700' }}
          onPress={() => router.push({ pathname: '/sports/season', params: { sport: season.sportId, id: season.id } })}>Edit season</Text>
      )}
    </Card>
  );
}

/** One child's sign-up for a season: status, and Sign up or Withdraw. */
function ChildSignUp({ kid, season, reg, open, onChange }: { kid: Person; season: SportSeason; reg?: SportRegistration; open: boolean; onChange: () => void }) {
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
    : reg?.status === 'pending' ? 'Waiting for the coach to approve'
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
          <TextInput style={[s.input, { minHeight: 60 }]} multiline placeholder="Anything the coach should know? (optional)" value={note} onChangeText={setNote}
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

/** Coaches and sports managers: sign-ups to decide, the schedule and seasons; managers also coaches and the sport. */
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

      <Button label="+ Add to the schedule" onPress={() => router.push({ pathname: '/sports/event', params: { sport: sport.id } })} />
      <Button label="+ New season" kind="ghost" onPress={() => router.push({ pathname: '/sports/season', params: { sport: sport.id } })} />

      {isManager && (
        <Card style={{ gap: 8 }}>
          <H>Coaches</H>
          {sport.coachIds.length === 0 && <P muted>No coaches yet. Sign-ups go to the sports managers until there are.</P>}
          {sport.coachIds.map((cid) => (
            <View key={cid} style={[s.row, { justifyContent: 'space-between' }]}>
              <Text style={{ color: C.ink, fontWeight: '600' }}>{name(cid)}</Text>
              <Text style={{ color: C.danger, fontWeight: '700' }} onPress={() => setSportCoach(sport.id, cid, false).then(onChange).catch(fail)}>Remove</Text>
            </View>
          ))}
          <TextInput style={s.input} placeholder="Add a coach: search faculty and staff" value={q} onChangeText={setQ} accessibilityLabel="Search faculty and staff" />
          {matches.map((p) => (
            <Text key={p.id} style={{ color: C.primary, fontWeight: '700', paddingVertical: 4 }}
              onPress={() => { setQ(''); setSportCoach(sport.id, p.id, true).then(onChange).catch(fail); }}>
              + {p.firstName} {p.lastName}
            </Text>
          ))}
        </Card>
      )}
      {isManager && <Button label="Edit sport" kind="ghost" onPress={() => router.push({ pathname: '/sports/edit', params: { id: sport.id } })} />}
    </View>
  );
}
