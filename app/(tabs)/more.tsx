import { useState } from 'react';
import { Linking, ScrollView, Text, View } from 'react-native';
import { getSite } from '../../src/api/mockApi';
import { AutoImage } from '../../src/site/Blocks';
import { openLink, routeFor } from '../../src/site/links';
import { C, Card, H, Loading, P, s, useLoad } from '../../src/ui';

/** The website's menu, contact details and footer. */
export default function More() {
  const { data } = useLoad(getSite);
  const [open, setOpen] = useState<string | null>(null);
  if (!data) return <Loading />;
  const { school, navigation, footer, social } = data;
  const external = (url: string) => routeFor(url).kind === 'external';

  return (
    <ScrollView style={s.screen} contentContainerStyle={s.pad}>
      {school.logo && <AutoImage uri={school.logo} contain maxHeight={110} />}

      {navigation.map((n) => n.items ? (
        <Card key={n.label} onPress={() => setOpen(open === n.label ? null : n.label)}>
          <Text style={{ fontSize: 16, fontWeight: '700', color: C.ink }}>{n.label}  {open === n.label ? '▾' : '▸'}</Text>
          {open === n.label && n.items.map((it) => (
            <Text key={it.label} onPress={() => openLink(it.url)} style={{ paddingVertical: 8, fontSize: 15, color: C.primary }}>
              {it.label}{external(it.url) ? '  ↗' : ''}
            </Text>
          ))}
        </Card>
      ) : (
        <Card key={n.label} onPress={() => n.url && openLink(n.url)}>
          <Text style={{ fontSize: 16, fontWeight: '700', color: C.ink }}>{n.label}{n.url && external(n.url) ? '  ↗' : '  ›'}</Text>
        </Card>
      ))}

      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
        {footer.actions.map((a) => (
          <Text key={a.label} onPress={() => openLink(a.url)} style={{ backgroundColor: C.primary, color: '#fff', fontWeight: '700',
            paddingHorizontal: 12, paddingVertical: 8, borderRadius: 999, overflow: 'hidden' }}>{a.label}</Text>
        ))}
      </View>

      <Card>
        <H>Contact</H>
        <P>{school.address.line1}{'\n'}{school.address.city}, {school.address.state} {school.address.zip}</P>
        <Text style={{ color: C.primary }} onPress={() => Linking.openURL(`tel:${school.phone.replace(/\D/g, '')}`)}>{school.phone}</Text>
        <Text style={{ color: C.primary }} onPress={() => Linking.openURL(`mailto:${school.email}`)}>{school.email}</Text>
        <Text style={{ color: C.primary }} onPress={() => Linking.openURL(`mailto:${school.admissionsEmail}`)}>{school.admissionsEmail}</Text>
        <View style={{ flexDirection: 'row', gap: 16, marginTop: 4 }}>
          {social.map((x) => <Text key={x.service} style={{ color: C.primary, fontWeight: '700' }} onPress={() => Linking.openURL(x.url)}>{x.service}</Text>)}
        </View>
      </Card>

      <Card>
        <H>Quick Links</H>
        {footer.quickLinks.map((l) => (
          <Text key={l.label} onPress={() => openLink(l.url)} style={{ paddingVertical: 6, color: C.primary }}>{l.label}</Text>
        ))}
      </Card>

      <P muted>{footer.about}</P>
      <P muted>{footer.nonDiscrimination}</P>
    </ScrollView>
  );
}
