/**
 * Vimeo / YouTube players for the embeds used on khroyals.com. The player page
 * is loaded with the school site as its base URL so the request carries the
 * same referrer as the website (YouTube rejects embeds without one, and Vimeo
 * videos can be restricted to the school's domain).
 */
import { View, type ViewStyle } from 'react-native';
import { WebView } from 'react-native-webview';
import { embedUrl, type Provider } from './embedUrl';

type Props = { provider: Provider; id: string; aspectRatio?: number; autoplay?: boolean; style?: ViewStyle };

export function EmbedVideo({ provider, id, aspectRatio = 16 / 9, autoplay, style }: Props) {
  const html = `<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1">
<style>html,body{margin:0;height:100%;background:#000}iframe{position:fixed;inset:0;width:100%;height:100%;border:0}</style></head>
<body><iframe src="${embedUrl(provider, id, autoplay)}" allow="autoplay; fullscreen; picture-in-picture; encrypted-media" allowfullscreen></iframe></body></html>`;
  return (
    <View style={[{ aspectRatio, backgroundColor: '#000', borderRadius: 12, overflow: 'hidden' }, style]}>
      <WebView
        source={{ html, baseUrl: 'https://www.khroyals.com/' }}
        style={{ flex: 1, backgroundColor: '#000' }}
        allowsFullscreenVideo
        allowsInlineMediaPlayback
        mediaPlaybackRequiresUserAction={!autoplay}
        scrollEnabled={false}
        setSupportMultipleWindows={false}
      />
    </View>
  );
}
