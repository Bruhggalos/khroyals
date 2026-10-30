/**
 * Volunteer: upcoming opportunities (people's time, and item requests with how much is
 * pledged), the ones you said yes to or pledged for, and (for leaders) the ones you lead.
 * Opportunities that are part of an event (Harvest Fest) sit inside its card, which opens
 * the event; the rest follow under "Other opportunities".
 */
import { useCallback, useState } from 'react';
import { FlatList, Pressable, Text, View } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import {
  isVolunteerLead, listVolunteer, subscribeVolunteer, type Opportunity, type Person, type Signup, type VolunteerEvent,
} from '../../src/api/connect';
import { PastToggle, usePastToggle } from '../../src/calendar/PastToggle';
import { daysLabel, isPast } from '../../src/volunteer/format';
import { OpportunityCard, progress } from '../../src/volunteer/OpportunityCard';
import { EventBanner, GREEN, SectionTitle } from '../../src/volunteer/parts';
import { VolunteerGate } from '../../src/volunteer/VolunteerGate';
import { Button, C, Card, Chip, Loading, P, s } from '../../src/ui';

type Tab = 'open' | 'mine' | 'leading';
type Kind = 'all' | Opportunity['kind'];
type Data = { opportunities: Opportunity[]; signups: Signup[]; events: VolunteerEvent[] };

export default function Volunteer() {
  return <VolunteerGate title="Volunteer">{(me) => <Opportunities me={me} />}</VolunteerGate>;
}

function Opportunities({ me }: { me: Person }) {
  const [data, setData] = useState<Data | null>(null);
  const [tab, setTab] = useState<Tab>('open');
  const [kind, setKind] = useState<Kind>('all');
  const showPast = usePastToggle();
  const lead = isVolunteerLead(me);

  const load = useCallback(() => listVolunteer().then(setData).catch(() => setData({ opportunities: [], signups: [], events: [] })), []);
  useFocusEffect(useCallback(() => { load(); return subscribeVolunteer(load); }, [load]));
  if (!data) return <Loading />;

  const signupsOf = (o: Opportunity) => data.signups.filter((x) => x.opportunityId === o.id);
  const said = (o: Opportunity) => signupsOf(o).some((x) => x.userId === me.id);
  const eventOf = (o: Opportunity) => data.events.find((e) => e.id === o.eventId);
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
  // Opportunities: each event is one card holding its own (shown while it, or any of them, is still to come); the rest follow it.
  const inside = (e: VolunteerEvent) => ofKind(lists.open.filter((o) => o.eventId === e.id));
  const events = tab !== 'open' ? []
    : data.events.filter((e) => (kinds && kind !== 'all' ? inside(e).length > 0 : !isPast(e) || inside(e).length > 0));
  const shown = ofKind(showPast.shown ? [...lists[tab], ...past] : lists[tab]).filter((o) => tab !== 'open' || !eventOf(o));
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
          {lead && (
            <View style={s.row}>
              <View style={{ flex: 1 }}><Button label="+ Event" kind="ghost" onPress={() => router.push('/volunteer/event/new')} /></View>
              <View style={{ flex: 1 }}><Button label="+ Opportunity" onPress={() => router.push('/volunteer/new')} /></View>
            </View>
          )}
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
          {events.length > 0 && <SectionTitle icon="calendar-outline" title="Events" tint={C.accent} />}
          {events.map((e) => <EventCard key={e.id} e={e} opportunities={inside(e)} signups={data.signups} me={me} />)}
          {events.length > 0 && shown.length > 0 && <SectionTitle icon="hand-left-outline" title="Other opportunities" />}
        </View>}
      ListEmptyComponent={events.length ? null : <Card><P muted>{empty[tab]}</P></Card>}
      ListFooterComponent={<PastToggle count={past.length} shown={showPast.shown} onToggle={showPast.toggle} noun="opportunities" />}
      renderItem={({ item: o }) => <OpportunityCard o={o} signups={signupsOf(o)} me={me} event={eventOf(o)?.title} />} />
  );
}

/** An event's card: its banner, how many opportunities it has, how many still need help, and whether you're helping. */
function EventCard({ e, opportunities, signups, me }: { e: VolunteerEvent; opportunities: Opportunity[]; signups: Signup[]; me: Person }) {
  const ofThis = (o: Opportunity) => signups.filter((x) => x.opportunityId === o.id);
  const needHelp = opportunities.filter((o) => !progress(o, ofThis(o)).full).length;
  const helping = opportunities.some((o) => ofThis(o).some((x) => x.userId === me.id));
  const count = `${opportunities.length} ${opportunities.length === 1 ? 'opportunity' : 'opportunities'}`;
  return (
    <Pressable onPress={() => router.push(`/volunteer/event/${e.id}`)} accessibilityRole="button"
      accessibilityLabel={`${e.title}, event, ${daysLabel(e)}${e.location ? `, ${e.location}` : ''}, ${count}`}
      style={({ pressed }) => [{ backgroundColor: C.card, borderRadius: 18, borderWidth: 1, borderColor: C.line, overflow: 'hidden' }, pressed && { opacity: 0.85 }]}>
      <EventBanner e={e} />
      <View style={[s.row, { padding: 14, gap: 8 }]}>
        <View style={{ flex: 1, gap: 6 }}>
          <P muted>{daysLabel(e)}</P>
          <View style={[s.row, { flexWrap: 'wrap' }]}>
            <View style={[s.row, { gap: 4 }]}>
              <Ionicons name="list" size={16} color={C.primary} />
              <Text style={{ color: C.primary, fontWeight: '700' }}>{opportunities.length ? count : 'Opportunities coming soon'}</Text>
            </View>
            {needHelp > 0 ? <Text style={{ color: GREEN, fontWeight: '700' }}>{needHelp === opportunities.length ? 'Help needed' : `${needHelp} still need help`}</Text>
              : opportunities.length > 0 && <Text style={{ color: C.muted, fontWeight: '700' }}>All filled. Thank you!</Text>}
            {helping && <Chip label="You're helping" color={GREEN} />}
            {e.leadId === me.id && <Chip label="You lead" color={C.accent} />}
          </View>
        </View>
        <Ionicons name="chevron-forward" size={22} color={C.muted} />
      </View>
    </Pressable>
  );
}
