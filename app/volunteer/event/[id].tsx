/**
 * A volunteer event (Harvest Fest): its banner, when and where, its details, and the
 * opportunities that are part of it (bringing bottled water, setting up the day of), each
 * opening as usual, in the order its leader chose (most important first). Volunteer Leaders
 * add opportunities to it; the leader who started it puts them in order (Reorder), and
 * changes or removes the event (its opportunities stay, on their own).
 */
import { useCallback, useState } from 'react';
import { Alert, Pressable, ScrollView, Text, View } from 'react-native';
import { Stack, router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import {
  errorText, isVolunteerLead, listVolunteer, subscribeVolunteer, volunteerEventDelete, volunteerEventReorder,
  type Opportunity, type Person, type Signup, type VolunteerEvent,
} from '../../../src/api/connect';
import { PastToggle, usePastToggle } from '../../../src/calendar/PastToggle';
import { GOLD, NAVY } from '../../../src/sports/ui';
import { detailSections, durationLabel, inEventOrder, moved, sectionIcon, startsLabel } from '../../../src/volunteer/details';
import { isPast, longDayLabel, nameOf, whenLabel } from '../../../src/volunteer/format';
import { OpportunityCard } from '../../../src/volunteer/OpportunityCard';
import { EventBanner, GREEN, Pill, Section, SectionTitle } from '../../../src/volunteer/parts';
import { VolunteerGate } from '../../../src/volunteer/VolunteerGate';
import { Button, C, Card, Loading, P, s, ask, useBottomInset } from '../../../src/ui';

export default function EventScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <VolunteerGate title="Event">{(me) => <EventDetail id={id} me={me} />}</VolunteerGate>;
}

type Data = { events: VolunteerEvent[]; opportunities: Opportunity[]; signups: Signup[] };

function EventDetail({ id, me }: { id: string; me: Person }) {
  const [data, setData] = useState<Data | null>(null);
  const [busy, setBusy] = useState(false);
  const [order, setOrder] = useState<string[] | null>(null);   // the opportunities' ids, while the leader puts them in order
  const showPast = usePastToggle();
  const bottomInset = useBottomInset();

  const load = useCallback(() => listVolunteer().then(setData).catch(() => setData({ events: [], opportunities: [], signups: [] })), []);
  useFocusEffect(useCallback(() => { load(); return subscribeVolunteer(load); }, [load]));

  if (!data) return <Loading />;
  const e = data.events.find((x) => x.id === id);
  if (!e) return <View style={[s.screen, s.pad]}><Card><P muted>{"This event isn't available."}</P></Card></View>;

  const started = e.leadId === me.id;
  const lead = isVolunteerLead(me);
  const ofEvent = data.opportunities.filter((o) => o.eventId === e.id && o.status === 'open');
  const coming = inEventOrder(ofEvent.filter((o) => !isPast(o)));
  const past = ofEvent.filter(isPast);
  const length = durationLabel(e);
  const soon = startsLabel(e);
  const remove = () => ask('Remove this event?',
    ofEvent.length ? `Its ${ofEvent.length === 1 ? 'opportunity stays' : `${ofEvent.length} opportunities stay`} in the Volunteer app, on ${ofEvent.length === 1 ? 'its' : 'their'} own.` : 'It has no opportunities yet.',
    'Remove', () => {
      setBusy(true);
      volunteerEventDelete(e.id).then(() => router.back()).catch((err) => Alert.alert('Volunteer', errorText(err))).finally(() => setBusy(false));
    });
  const saveOrder = (ids: string[]) => {
    setBusy(true);
    volunteerEventReorder(e.id, ids).then(() => { setOrder(null); return load(); })
      .catch((err) => Alert.alert("Couldn't save the order", errorText(err))).finally(() => setBusy(false));
  };

  return (
    <ScrollView style={s.screen} contentContainerStyle={[s.pad, { paddingBottom: 16 + bottomInset }]}>
      <Stack.Screen options={{ title: e.title }} />
      <EventBanner e={e} hero leader={started ? 'You lead this event' : `Led by ${nameOf(e.leadId)}`} style={{ borderRadius: 18, borderBottomWidth: 4 }} />

      <Section icon="calendar-outline" title="When">
        <Text style={big}>{longDayLabel(e)}</Text>
        {(!!length || !!soon) && (
          <View style={[s.row, { gap: 8, flexWrap: 'wrap' }]}>
            {!!length && <Pill icon="time-outline" text={length} color={C.primary} />}
            {!!soon && <Pill icon="hourglass-outline" text={soon} color={soon === 'Happening now' ? GREEN : C.accent} />}
          </View>
        )}
      </Section>

      {!!e.location && (
        <Section icon="location-outline" title="Where">
          <Text style={big}>{e.location}</Text>
        </Section>
      )}

      {detailSections(e.description).map((d, i) => (
        <Section key={i} icon={sectionIcon(d.heading)} title={d.heading ?? 'About'}>
          {d.paragraphs.map((text, j) => <Text key={j} style={paragraph}>{text}</Text>)}
        </Section>
      ))}

      <View style={{ marginTop: 8 }}>
        <SectionTitle icon="hand-left-outline" title={`Ways to help (${coming.length})`} tint={GREEN}
          right={started && coming.length > 1 && !order ? (
            <Pressable onPress={() => setOrder(coming.map((o) => o.id))} accessibilityRole="button" accessibilityLabel="Put the opportunities in order"
              hitSlop={8} style={({ pressed }) => [s.row, { gap: 4, opacity: pressed ? 0.6 : 1 }]}>
              <Ionicons name="swap-vertical" size={18} color={C.primary} />
              <Text style={{ color: C.primary, fontWeight: '800' }}>Reorder</Text>
            </Pressable>
          ) : undefined} />
      </View>
      {order ? (
        <>
          <P muted>Put the most important first. Everyone sees them in this order.</P>
          <View style={[s.card, { padding: 0, gap: 0, overflow: 'hidden' }]}>
            {order.map((oid, i) => {
              const o = coming.find((x) => x.id === oid);
              return o && <ReorderRow key={oid} o={o} n={i + 1} last={i === order.length - 1} onMove={(by) => setOrder(moved(order, i, i + by))} />;
            })}
          </View>
          <View style={s.row}>
            <View style={{ flex: 1 }}><Button kind="ghost" label="Cancel" onPress={() => setOrder(null)} /></View>
            <View style={{ flex: 1 }}><Button label={busy ? 'Saving…' : 'Save order'} disabled={busy} onPress={() => saveOrder(order)} /></View>
          </View>
        </>
      ) : (
        <>
          {lead && <Button label="+ Add an opportunity" onPress={() => router.push(`/volunteer/new?event=${e.id}`)} />}
          {coming.length === 0 && (
            <Card>
              <P muted>{lead ? 'No opportunities yet. Add what you need help with, or items for people to bring.' : 'No opportunities yet. Check back soon!'}</P>
            </Card>
          )}
          {[...coming, ...(showPast.shown ? past : [])].map((o) => (
            <OpportunityCard key={o.id} o={o} signups={data.signups.filter((x) => x.opportunityId === o.id)} me={me} />
          ))}
          <PastToggle count={past.length} shown={showPast.shown} onToggle={showPast.toggle} noun="opportunities" />
        </>
      )}

      {started && !order && (
        <View style={{ gap: 12, marginTop: 8 }}>
          <Button kind="ghost" label="Change event details" onPress={() => router.push(`/volunteer/event/new?id=${e.id}`)} />
          <Text style={{ color: C.danger, fontWeight: '600', opacity: busy ? 0.5 : 1 }} onPress={busy ? undefined : remove}>Remove this event</Text>
        </View>
      )}
    </ScrollView>
  );
}

/** One opportunity while the leader puts them in order: its place (the first in gold), title and day, and arrows to move it. */
function ReorderRow({ o, n, last, onMove }: { o: Opportunity; n: number; last: boolean; onMove: (by: -1 | 1) => void }) {
  const first = n === 1;
  const arrow = (by: -1 | 1, disabled: boolean) => (
    <Pressable onPress={() => onMove(by)} disabled={disabled} accessibilityRole="button" accessibilityLabel={`Move ${o.title} ${by < 0 ? 'up' : 'down'}`}
      accessibilityState={{ disabled }} hitSlop={4}
      style={({ pressed }) => ({ width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', borderWidth: 1.5,
        borderColor: disabled ? C.line : C.primary, opacity: pressed ? 0.6 : 1 })}>
      <Ionicons name={by < 0 ? 'chevron-up' : 'chevron-down'} size={22} color={disabled ? C.line : C.primary} />
    </Pressable>
  );
  return (
    <View style={[s.row, { padding: 12, gap: 10, borderTopWidth: first ? 0 : 1, borderTopColor: C.line }]}>
      <View style={{ width: 30, height: 30, borderRadius: 15, backgroundColor: first ? GOLD : `${C.primary}1A`, alignItems: 'center', justifyContent: 'center' }}>
        <Text style={{ fontWeight: '900', color: NAVY }}>{n}</Text>
      </View>
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={{ fontSize: 16, fontWeight: '800', color: C.ink }} numberOfLines={2}>{o.title}</Text>
        <Text style={{ fontSize: 13, color: C.muted }} numberOfLines={1}>{whenLabel(o)}</Text>
      </View>
      {arrow(-1, first)}
      {arrow(1, last)}
    </View>
  );
}

const big = { fontSize: 19, fontWeight: '800', color: NAVY } as const;
const paragraph = { fontSize: 16, lineHeight: 24, color: C.ink } as const;
