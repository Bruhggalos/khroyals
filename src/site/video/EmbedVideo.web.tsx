import { createElement } from 'react';
import { View, type ViewStyle } from 'react-native';
import { embedUrl, type Provider } from './embedUrl';

type Props = { provider: Provider; id: string; aspectRatio?: number; autoplay?: boolean; style?: ViewStyle };

export function EmbedVideo({ provider, id, aspectRatio = 16 / 9, autoplay, style }: Props) {
  return (
    <View style={[{ aspectRatio, backgroundColor: '#000', borderRadius: 12, overflow: 'hidden' }, style]}>
      {createElement('iframe', {
        src: embedUrl(provider, id, autoplay),
        allow: 'autoplay; fullscreen; picture-in-picture; encrypted-media',
        allowFullScreen: true,
        style: { border: 0, width: '100%', height: '100%' },
      })}
    </View>
  );
}
