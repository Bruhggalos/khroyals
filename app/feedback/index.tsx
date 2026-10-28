/**
 * Feedback: anyone with an approved account reports a bug or suggests a feature, and follows
 * what became of it (status and the team's reply). Triage (the Triage feedback permission: the
 * IT role, directors and administrators) also gets every report, newest and highest priority
 * first, and Workshops: sessions where students learn by working on the app's real bugs and ideas.
 */
import { useCallback, useState } from 'react';
import { ScrollView, Text, View } from 'react-native';
import { Stack, router, useFocusEffect } from 'expo-router';
import {
  errorText, listFeedback, listWorkshops, live, myAccess, session,
  type Access, type Feedback, type FeedbackWorkshop, type Person,
} from '../../src/api/connect';
import { isPastDay } from '../../src/calendar/past';
import { PAST_STYLE, PastToggle, usePastToggle } from '../../src/calendar/PastToggle';
import { STATUSES, matches, triageOrder, type Filter } from '../../src/feedback/kinds';
import { FeedbackCard, Pills } from '../../src/feedback/ui';
import { longDay } from '../../src/myCalendar/when';
import { Button, C, Card, H, Loading, P, s } from '../../src/ui';

type Tab = 'mine' | 'triage' | 'workshops';
const FILTERS: { key: Filter; label: string }[] = [{ key: 'open', label: 'Open' }, ...STATUSES, { key: 'all', label: 'All' }];

export default function FeedbackHome() {
  const [data, setData] = useState<{ me: Person | null; access: Access | null; list: Feedback[]; workshops: FeedbackWorkshop[]; error?: string } | null>(null);
  const [tab, setTab] = useState<Tab>('mine');
  const [filter, setFilter] = useState<Filter>('open');
  const past = usePastToggle();

  const load = useCallback(async () => {
    const me = live ? await session().catch(() => null) : null;
    if (!me || me.pending) { setData({ me, access: null, list: [], workshops: [] }); return; }
    try {
      const access = await myAccess().catch(() => null);
      const triage = !!access?.permissions.includes('feedback.triage');
      const [list, workshops] = await Promise.all([listFeedback(), triage ? listWorkshops() : []]);
      setData({ me, access, list, workshops });
    } catch (e) {
      setData({ me, access: null, list: [], workshops: [], error: errorText(e) });
    }
  }, []);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  const header = <Stack.Screen options={{ title: 'Feedback' }} />;
  const box = (body: React.ReactNode) => <View style={[s.screen, s.pad]}>{header}{body}</View>;
  if (!live) return box(<Card><H>Feedback needs the school server</H><P muted>This build is running on demo data.</P></Card>);
  if (!data) return <>{header}<Loading /></>;
  const { me, access, list, workshops } = data;
  if (!me || me.pending) return box(
    <Card>
      <H>Sign in to send feedback</H>
      <P muted>Found something that doesn’t work, or have an idea for the app? Sign in with an approved account to tell us.</P>
      {!me && <Button label="Sign in" onPress={() => router.navigate('/connect')} />}
    </Card>,
  );

  const triage = !!access?.permissions.includes('feedback.triage');
  const needsCode = !triage && !!access && (access.tier !== null || access.granted.includes('feedback.triage')) && access.mfaRequired && !access.mfaVerified;
  const tabs: [Tab, string][] = triage ? [['mine', 'Mine'], ['triage', 'Triage'], ['workshops', 'Workshops']] : [['mine', 'Mine']];
  const shown: Tab = tabs.some(([k]) => k === tab) ? tab : 'mine';
  const mine = list.filter((f) => f.authorId === me.id);

  return (
    <ScrollView style={s.screen} contentContainerStyle={s.pad}>
      {header}
      {tabs.length > 1 && <Pills options={tabs.map(([key, label]) => ({ key, label }))} value={shown} onChange={(t) => { setTab(t); past.hide(); }} />}
      {!!data.error && <Card><P muted>{data.error}</P></Card>}
      {needsCode && (
        <Card onPress={() => router.push('/admin')}>
          <P muted>You triage feedback: verify with your authenticator app in the Admin portal to see everyone’s reports. ›</P>
        </Card>
      )}

      {shown === 'mine' && (<>
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <View style={{ flex: 1 }}><Button label="🐞 Report a problem" onPress={() => router.push({ pathname: '/feedback/new', params: { kind: 'bug' } })} /></View>
          <View style={{ flex: 1 }}><Button label="💡 Suggest an idea" onPress={() => router.push({ pathname: '/feedback/new', params: { kind: 'idea' } })} /></View>
        </View>
        <P muted>The school’s team reads every report and replies here. Some become projects in student workshops.</P>
        {mine.length === 0 && <Card><P muted>You haven’t sent any feedback yet.</P></Card>}
        {mine.map((f) => <FeedbackCard key={f.id} f={f} onPress={() => router.push(`/feedback/${f.id}`)} />)}
      </>)}

      {shown === 'triage' && (() => {
        const rows = triageOrder(list.filter((f) => matches(filter, f.status)));
        const fresh = list.filter((f) => f.status === 'new').length;
        return (<>
          <P muted>{fresh ? `${fresh} new to look at.` : 'Nothing new to look at.'} High priority first, then new ones.</P>
          <Pills options={FILTERS} value={filter} onChange={setFilter} />
          {rows.length === 0 && <Card><P muted>Nothing here.</P></Card>}
          {rows.map((f) => <FeedbackCard key={f.id} f={f} who onPress={() => router.push(`/feedback/${f.id}`)} />)}
        </>);
      })()}

      {shown === 'workshops' && (() => {
        const done = (w: FeedbackWorkshop) => !!w.heldOn && isPastDay(w.heldOn);
        const upcoming = workshops.filter((w) => !done(w));
        const earlier = workshops.filter(done);
        const card = (w: FeedbackWorkshop, old: boolean) => {
          const items = list.filter((f) => f.workshopId === w.id);
          return (
            <Card key={w.id} onPress={() => router.push({ pathname: '/feedback/workshop', params: { id: w.id } })} style={old ? PAST_STYLE : undefined}>
              <Text style={{ fontWeight: '800', color: C.ink, fontSize: 16 }}>🎓 {w.title}</Text>
              <P muted>{[w.heldOn ? longDay(w.heldOn) : 'No date yet', `${items.length} ${items.length === 1 ? 'report' : 'reports'}`].join(' · ')}</P>
              {!!w.description && <P>{w.description}</P>}
            </Card>
          );
        };
        return (<>
          <P muted>Group reports into a workshop where students learn by fixing real bugs and building requested features.</P>
          <Button label="+ New workshop" onPress={() => router.push('/feedback/workshop')} />
          <PastToggle count={earlier.length} shown={past.shown} onToggle={past.toggle} noun="workshops" />
          {past.shown && earlier.map((w) => card(w, true))}
          {upcoming.length === 0 && <Card><P muted>No workshops coming up.</P></Card>}
          {upcoming.map((w) => card(w, false))}
        </>);
      })()}
    </ScrollView>
  );
}
