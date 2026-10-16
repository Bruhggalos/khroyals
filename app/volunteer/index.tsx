/** Volunteer: upcoming opportunities, the ones you said yes to, and (for leaders) the ones you lead. */
import { useCallback, useState } from 'react';
import { FlatList, Text, View } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import {
  isVolunteerLead, listVolunteer, subscribeVolunteer, type Opportunity, type Person, type Signup,
} from '../../src/api/connect';
import { countLabel, isPast, whenLabel } from '../../src/volunteer/format';
import { VolunteerGate } from '../../src/volunteer/VolunteerGate';
import { Button, C, Card, Chip, Loading, P, s } from '../../src/ui';

type Tab = 'open' | 'mine' | 'leading';
const GREEN = '#15803D';

export default function Volunteer() {
  return <VolunteerGate title="Volunteer">{(me) => <Opportunities me={me} />}</VolunteerGate>;
}

function Opportunities({ me }: { me: Person }) {
  const [data, setData] = useState<{ opportunities: Opportunity[]; signups: Signup[] } | null>(null);
  const [tab, setTab] = useState<Tab>('open');
  const lead = isVolunteerLead(me);

  const load = useCallback(() => listVolunteer().then(setData).catch(() => setData({ opportunities: [], signups: [] })), []);
  useFocusEffect(useCallback(() => { load(); return subscribeVolunteer(load); }, [load]));
  if (!data) return <Loading />;

  const count = (o: Opportunity) => data.signups.filter((x) => x.opportunityId === o.id).length;
  const said = (o: Opportunity) => data.signups.some((x) => x.opportunityId === o.id && x.userId === me.id);
  const lists: Record<Tab, Opportunity[]> = {
    open: data.opportunities.filter((o) => o.status === 'open' && !isPast(o)),
    mine: data.opportunities.filter(said).sort((a, b) => Number(isPast(a)) - Number(isPast(b))),
    leading: data.opportunities.filter((o) => o.leadId === me.id).sort((a, b) => Number(isPast(a)) - Number(isPast(b))),
  };
  const tabs: Tab[] = lead ? ['open', 'mine', 'leading'] : ['open', 'mine'];
  const empty: Record<Tab, string> = {
    open: 'No opportunities right now. Check back soon!',
    mine: 'When you Say Yes! to an opportunity, it shows up here.',
    leading: "You haven't posted an opportunity yet.",
  };

  return (
    <FlatList style={s.screen} contentContainerStyle={s.pad} data={lists[tab]} keyExtractor={(o) => o.id}
      ListHeaderComponent={
        <View style={{ gap: 12 }}>
          {lead && <Button label="+ New opportunity" onPress={() => router.push('/volunteer/new')} />}
          <View style={[s.row, { gap: 6, flexWrap: 'wrap' }]}>
            {tabs.map((t) => (
              <Text key={t} onPress={() => setTab(t)}
                style={{ paddingHorizontal: 12, paddingVertical: 6, borderRadius: 999, overflow: 'hidden', borderWidth: 1, borderColor: C.line,
                  backgroundColor: tab === t ? C.primary : '#fff', color: tab === t ? '#fff' : C.ink, fontWeight: '600' }}>
                {{ open: 'Opportunities', mine: 'My sign-ups', leading: 'Leading' }[t]} ({lists[t].length})
              </Text>
            ))}
          </View>
        </View>}
      ListEmptyComponent={<Card><P muted>{empty[tab]}</P></Card>}
      renderItem={({ item: o }) => {
        const n = count(o);
        const full = !!o.spots && n >= o.spots;
        return (
          <Card onPress={() => router.push(`/volunteer/${o.id}`)}>
            <Text style={{ fontSize: 17, fontWeight: '700', color: C.ink }}>{o.title}</Text>
            <P muted>{whenLabel(o)}{o.location ? ` · ${o.location}` : ''}</P>
            <View style={[s.row, { flexWrap: 'wrap' }]}>
              <View style={[s.row, { gap: 4 }]}>
                <Ionicons name="people" size={16} color={C.primary} />
                <Text style={{ color: C.primary, fontWeight: '700' }}>{countLabel(n, o.spots)}</Text>
              </View>
              {o.status === 'deleted' ? <Chip label="Cancelled" color={C.danger} />
                : isPast(o) ? <Chip label="Past" color={C.muted} />
                : said(o) ? <Chip label="You said yes" color={GREEN} />
                : full ? <Chip label="Full" color={C.muted} /> : null}
              {o.leadId === me.id && <Chip label="You lead" color={C.accent} />}
            </View>
          </Card>
        );
      }} />
  );
}
