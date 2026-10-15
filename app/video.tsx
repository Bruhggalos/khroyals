/** Full-screen player for Vimeo/YouTube links on the site (e.g. "Our Story"). */
import { View } from 'react-native';
import { Stack, useLocalSearchParams } from 'expo-router';
import { EmbedVideo } from '../src/site/video/EmbedVideo';

export default function Video() {
  const { provider, id } = useLocalSearchParams<{ provider: 'vimeo' | 'youtube'; id: string }>();
  return (
    <View style={{ flex: 1, backgroundColor: '#000', justifyContent: 'center' }}>
      <Stack.Screen options={{ title: 'Video', headerStyle: { backgroundColor: '#000' } }} />
      <EmbedVideo provider={provider} id={id} autoplay style={{ borderRadius: 0 }} />
    </View>
  );
}
