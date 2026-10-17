import { Linking, Platform, ScrollView, Share as ShareSheet, Text, View } from 'react-native';
import { Button, C, Card, P, s } from '../../src/ui';
import { QrCode } from '../../src/share/QrCode';
import { SCHOOL_WEBSITE } from '../../src/share/qr';

const host = SCHOOL_WEBSITE.replace(/^https?:\/\/(www\.)?/, '');
// The web app can only share where the browser supports it (phones, Safari).
const canShare = Platform.OS !== 'web' || (typeof navigator !== 'undefined' && 'share' in navigator);

/** Share: a QR code anyone can scan with their phone's camera to open the Kingdom Heights website. */
export default function Share() {
  const share = () => ShareSheet.share(
    Platform.OS === 'ios'
      ? { url: SCHOOL_WEBSITE, message: 'Kingdom Heights Preparatory School' }
      : { message: `Kingdom Heights Preparatory School: ${SCHOOL_WEBSITE}`, title: 'Kingdom Heights' },
  ).catch(() => {});
  return (
    <ScrollView style={s.screen} contentContainerStyle={s.pad}>
      <Card style={{ alignItems: 'center', gap: 14, paddingVertical: 24 }}>
        <Text style={{ fontSize: 20, fontWeight: '800', color: C.ink, textAlign: 'center' }}>Scan to visit Kingdom Heights</Text>
        <View style={{ borderWidth: 1, borderColor: C.line, borderRadius: 12 }}>
          <QrCode value={SCHOOL_WEBSITE} size={250} label={`QR code for ${host}`} />
        </View>
        <Text style={{ fontSize: 17, fontWeight: '700', color: C.primary }} onPress={() => Linking.openURL(SCHOOL_WEBSITE)}>{host}</Text>
        <P muted>Show this to a friend: pointing their phone's camera at the code opens the school's website.</P>
      </Card>
      {canShare && <Button label="Share the link" onPress={share} />}
      <Button label="Open the website" kind="ghost" onPress={() => Linking.openURL(SCHOOL_WEBSITE)} />
    </ScrollView>
  );
}
