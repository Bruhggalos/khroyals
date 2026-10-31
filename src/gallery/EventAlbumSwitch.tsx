/** On a new event's form (Volunteer or the school calendar): also make the event's photo album in Photos. */
import { Alert, Switch, Text, View } from 'react-native';
import { errorText, makeEventAlbum } from '../api/connect';
import { C, Card, P, s } from '../ui';

export function EventAlbumSwitch({ value, onChange }: { value: boolean; onChange: (on: boolean) => void }) {
  return (
    <Card>
      <View style={[s.row, { justifyContent: 'space-between' }]}>
        <View style={{ flex: 1 }}>
          <Text style={{ fontWeight: '700', color: C.ink }}>📸 Photo album</Text>
          <P muted>Make an album in Photos for this event's pictures. Everyone at school can see it, and staff add the photos.</P>
        </View>
        <Switch value={value} onValueChange={onChange} trackColor={{ true: C.primary }} accessibilityLabel="Make a photo album for this event" />
      </View>
    </Card>
  );
}

/** Make the album for an event just created; the event stays saved if it can't be made. */
export async function makeAlbumFor(event: { kind: 'volunteer' | 'calendar'; id: string }) {
  try {
    await makeEventAlbum(event);
  } catch (e) {
    Alert.alert('The event is saved', `Its photo album wasn't made: ${errorText(e)}`);
  }
}
