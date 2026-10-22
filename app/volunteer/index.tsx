/**
 * Volunteer: upcoming opportunities (people's time, and item requests with how much is
 * pledged), the ones you said yes to or pledged for, and (for leaders) the ones you lead.
 */
import { useCallback, useState } from 'react';
import { FlatList, Pressable, Text, View } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import {
  isVolunteerLead, listVolunteer, subscribeVolunteer, type Opportunity, type Person, type Signup,
} from '../../src/api/connect';
import { PAST_STYLE, PastToggle, usePastToggle } from '../../src/calendar/PastToggle';
import { pledgedTotal, spotsLeft, stillNeeded } from '../../src/volunteer/details';
import { countLabel, isPast, whenLabel } from '../../src/volunteer/format';
import { GREEN, OpportunityBanner, SpotsBar } from '../../src/volunteer/parts';
import { VolunteerGate } from '../../src/volunteer/VolunteerGate';
import { Button, C, Card, Chip, Loading, P, s } from '../../src/ui';

type Tab = 'open' | 'mine' | 'leading';
type Kind = 'all' | Opportunity['kind'];

export default function Volunteer() {
  return <VolunteerGate title="Volunteer">{(me) => <Opportunities me={me} />}</VolunteerGate>;
}

function Opportunities({ me }: { me: Person }) {
  const [data, setData] = useState<{ opportunities: Opportunity[]; signups: Signup[] } | null>(null);
  const [tab, setTab] = useState<Tab>('open');
  const [kind, setKind] = useState<Kind>('all');
  const showPast = usePastToggle();
  const lead = isVolunteerLead(me);

  const load = useCallback(() => listVolunteer().then(setData).catch(() => setData({ opportunities: [], signups: [] })), []);
  useFocusEffect(useCallback(() => { load(); return subscribeVolunteer(load); }, [load]));
  if (!data) return <Loading />;

  const signupsOf = (o: Opportunity) => data.signups.filter((x) => x.opportunityId === o.id);
  const mine = (o: Opportunity) => signupsOf(o).find((x) => x.userId === me.id);
  const said = (o: Opportunity) => !!mine(o);
  // Like every calendar in the app: past opportunities stay out of view until asked for, then look greyed out.
  const all: Record<Tab, Opportunity[]> = {
    open: data.opportunities.filter((o) => o.status === 'open'),
    mine: data.opportunities.filter(said),
    leading: data.opportunities.filter((o) => o.leadId === me.id),
  };
  const lists = Object.fromEntries(Object.entries(all).map(([t, list]) => [t, list.filter((o) => !isPast(o))])) as Record<Tab, Opportunity[]>;
  const past = tab === 'open' ? [] : all[tab].filter(isPast);
  // Volunteers or items, once there are both.
  const kinds = data.opportunities.some((o) => o.kind === 'items') && data.opportunities.some((o) => o.kind === 'help');
  const ofKind = (list: Opportunity[]) => (kinds && kind !== 'all' ? list.filter((o) => o.kind === kind) : list);
  const shown = ofKind(showPast.shown ? [...lists[tab], ...past] : lists[tab]);
  const tabs: Tab[] = lead ? ['open', 'mine', 'leading'] : ['open', 'mine'];
  const empty: Record<Tab, string> = {
    open: 'No opportunities right now. Check back soon!',
    mine: 'When you Say Yes! to an opportunity, or pledge items, it shows up here.',
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
          {kinds && (
            <View style={[s.row, { gap: 6, flexWrap: 'wrap' }]}>
              {(['all', 'help', 'items'] as const).map((k) => (
                <Text key={k} onPress={() => setKind(k)} accessibilityRole="button" accessibilityState={{ selected: kind === k }}
                  style={{ paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999, overflow: 'hidden', borderWidth: 1,
                    borderColor: kind === k ? C.accent : C.line, color: kind === k ? C.accent : C.muted, fontWeight: '700', fontSize: 13 }}>
                  {{ all: 'All', help: 'Volunteers', items: 'Items needed' }[k]}
                </Text>
              ))}
            </View>
          )}
        </View>}
      ListEmptyComponent={<Card><P muted>{empty[tab]}</P></Card>}
      ListFooterComponent={<PastToggle count={past.length} shown={showPast.shown} onToggle={showPast.toggle} noun="opportunities" />}
      renderItem={({ item: o }) => {
        const items = o.kind === 'items';
        const n = items ? pledgedTotal(signupsOf(o)) : signupsOf(o).length;
        const goal = items ? o.quantity : o.spots;
        const full = !!goal && n >= goal;
        const left = items ? stillNeeded(n, o.quantity ?? 0) : spotsLeft(n, o.spots);
        const myPledge = mine(o)?.quantity;
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
                  <Ionicons name={items ? 'gift' : 'people'} size={16} color={C.primary} />
                  <Text style={{ color: C.primary, fontWeight: '700' }}>{items ? `${n} of ${o.quantity} ${o.item}` : countLabel(n, o.spots)}</Text>
                </View>
                {!!left && !full && !isPast(o) && o.status === 'open' && <Text style={{ color: GREEN, fontWeight: '700' }}>{left}</Text>}
                {o.status === 'deleted' ? <Chip label="Cancelled" color={C.danger} />
                  : isPast(o) ? <Chip label="Past" color={C.muted} />
                  : myPledge ? <Chip label={`You're bringing ${myPledge}`} color={GREEN} />
                  : said(o) ? <Chip label="You said yes" color={GREEN} />
                  : full ? <Chip label={items ? 'All pledged' : 'Full'} color={C.muted} /> : null}
                {o.leadId === me.id && <Chip label="You lead" color={C.accent} />}
              </View>
              <SpotsBar n={n} spots={goal} />
            </View>
          </Pressable>
        );
      }} />
  );
}
