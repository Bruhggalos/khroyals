/** Volunteer: upcoming opportunities, the ones you said yes to, and (for leaders) the ones you lead. */
import { useCallback, useState } from 'react';
import { FlatList, Pressable, Text, View } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import {
  isVolunteerLead, listVolunteer, subscribeVolunteer, type Opportunity, type Person, type Signup,
} from '../../src/api/connect';
import { PAST_STYLE, PastToggle, usePastToggle } from '../../src/calendar/PastToggle';
import { spotsLeft } from '../../src/volunteer/details';
import { countLabel, isPast, whenLabel } from '../../src/volunteer/format';
import { GREEN, OpportunityBanner, SpotsBar } from '../../src/volunteer/parts';
import { VolunteerGate } from '../../src/volunteer/VolunteerGate';
import { Button, C, Card, Chip, Loading, P, s } from '../../src/ui';

type Tab = 'open' | 'mine' | 'leading';

export default function Volunteer() {
  return <VolunteerGate title="Volunteer">{(me) => <Opportunities me={me} />}</VolunteerGate>;
}

function Opportunities({ me }: { me: Person }) {
  const [data, setData] = useState<{ opportunities: Opportunity[]; signups: Signup[] } | null>(null);
  const [tab, setTab] = useState<Tab>('open');
  const showPast = usePastToggle();
  const lead = isVolunteerLead(me);

  const load = useCallback(() => listVolunteer().then(setData).catch(() => setData({ opportunities: [], signups: [] })), []);
  useFocusEffect(useCallback(() => { load(); return subscribeVolunteer(load); }, [load]));
  if (!data) return <Loading />;

  const count = (o: Opportunity) => data.signups.filter((x) => x.opportunityId === o.id).length;
  const said = (o: Opportunity) => data.signups.some((x) => x.opportunityId === o.id && x.userId === me.id);
  // Like every calendar in the app: past opportunities stay out of view until asked for, then look greyed out.
  const all: Record<Tab, Opportunity[]> = {
    open: data.opportunities.filter((o) => o.status === 'open'),
    mine: data.opportunities.filter(said),
    leading: data.opportunities.filter((o) => o.leadId === me.id),
  };
  const lists = Object.fromEntries(Object.entries(all).map(([t, list]) => [t, list.filter((o) => !isPast(o))])) as Record<Tab, Opportunity[]>;
  const past = tab === 'open' ? [] : all[tab].filter(isPast);
  const shown = showPast.shown ? [...lists[tab], ...past] : lists[tab];
  const tabs: Tab[] = lead ? ['open', 'mine', 'leading'] : ['open', 'mine'];
  const empty: Record<Tab, string> = {
    open: 'No opportunities right now. Check back soon!',
    mine: 'When you Say Yes! to an opportunity, it shows up here.',
    leading: "You haven't posted an opportunity yet.",
  };

  return (
    <FlatList style={s.screen} contentContainerStyle={s.pad} data={shown} keyExtractor={(o) => o.id}
      ListHeaderComponent={
        <View style={{ gap: 12 }}>
          {lead && <Button label="+ New opportunity" onPress={() => router.push('/volunteer/new')} />}
          <View style={[s.row, { gap: 6, flexWrap: 'wrap' }]}>
            {tabs.map((t) => (
              <Text key={t} onPress={() => { setTab(t); showPast.hide(); }}
                style={{ paddingHorizontal: 12, paddingVertical: 6, borderRadius: 999, overflow: 'hidden', borderWidth: 1, borderColor: C.line,
                  backgroundColor: tab === t ? C.primary : '#fff', color: tab === t ? '#fff' : C.ink, fontWeight: '600' }}>
                {{ open: 'Opportunities', mine: 'My sign-ups', leading: 'Leading' }[t]} ({lists[t].length})
              </Text>
            ))}
          </View>
        </View>}
      ListEmptyComponent={<Card><P muted>{empty[tab]}</P></Card>}
      ListFooterComponent={<PastToggle count={past.length} shown={showPast.shown} onToggle={showPast.toggle} noun="opportunities" />}
      renderItem={({ item: o }) => {
        const n = count(o);
        const full = !!o.spots && n >= o.spots;
        const left = spotsLeft(n, o.spots);
        return (
          <Pressable onPress={() => router.push(`/volunteer/${o.id}`)} accessibilityRole="button"
            accessibilityLabel={`${o.title}, ${whenLabel(o)}${o.location ? `, ${o.location}` : ''}`}
            style={({ pressed }) => [{ backgroundColor: C.card, borderRadius: 18, borderWidth: 1, borderColor: C.line, overflow: 'hidden' },
              isPast(o) && PAST_STYLE, pressed && { opacity: 0.85 }]}>
            <OpportunityBanner o={o} />
            <View style={{ padding: 14, gap: 6 }}>
              <Text style={{ fontSize: 18, fontWeight: '800', color: C.ink }}>{o.title}</Text>
              <P muted>{whenLabel(o)}{o.location ? ` · ${o.location}` : ''}</P>
              <View style={[s.row, { flexWrap: 'wrap' }]}>
                <View style={[s.row, { gap: 4 }]}>
                  <Ionicons name="people" size={16} color={C.primary} />
                  <Text style={{ color: C.primary, fontWeight: '700' }}>{countLabel(n, o.spots)}</Text>
                </View>
                {!!left && !full && !isPast(o) && o.status === 'open' && <Text style={{ color: GREEN, fontWeight: '700' }}>{left}</Text>}
                {o.status === 'deleted' ? <Chip label="Cancelled" color={C.danger} />
                  : isPast(o) ? <Chip label="Past" color={C.muted} />
                  : said(o) ? <Chip label="You said yes" color={GREEN} />
                  : full ? <Chip label="Full" color={C.muted} /> : null}
                {o.leadId === me.id && <Chip label="You lead" color={C.accent} />}
              </View>
              <SpotsBar n={n} spots={o.spots} />
            </View>
          </Pressable>
        );
      }} />
  );
}
