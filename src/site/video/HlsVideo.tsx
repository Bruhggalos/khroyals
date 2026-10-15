/**
 * Squarespace-hosted videos from khroyals.com, streamed from the site's own
 * HLS playlist. `background` mirrors the site's muted, looping section
 * backgrounds; otherwise the poster shows until the viewer taps play.
 */
import { useState } from 'react';
import { Image, Pressable, StyleSheet, Text, View, type ViewStyle } from 'react-native';
import { useVideoPlayer, VideoView } from 'expo-video';

type Props = { hls: string; thumbnail: string; aspectRatio?: number; background?: boolean; style?: ViewStyle };

function Player({ hls, background, autoPlay }: { hls: string; background?: boolean; autoPlay: boolean }) {
  const player = useVideoPlayer(hls, (p) => {
    p.loop = !!background;
    p.muted = !!background;
    if (autoPlay) p.play();
  });
  return (
    <VideoView player={player} style={{ flex: 1, backgroundColor: 'transparent' }} contentFit={background ? 'cover' : 'contain'}
      nativeControls={!background} fullscreenOptions={{ enable: !background }} allowsPictureInPicture={!background} />
  );
}

export function HlsVideo({ hls, thumbnail, aspectRatio = 16 / 9, background, style }: Props) {
  const [started, setStarted] = useState(false);
  if (background) {
    // Fills its parent; the poster stays underneath until the stream renders.
    return (
      <View style={[StyleSheet.absoluteFill, { backgroundColor: '#000' }, style]}>
        <Image source={{ uri: thumbnail }} style={StyleSheet.absoluteFill} resizeMode="cover" />
        <Player hls={hls} background autoPlay />
      </View>
    );
  }
  return (
    <View style={[{ aspectRatio, backgroundColor: '#000', borderRadius: 12, overflow: 'hidden' }, style]}>
      {started ? (
        <Player hls={hls} autoPlay />
      ) : (
        <Pressable onPress={() => setStarted(true)} style={{ flex: 1 }} accessibilityRole="button" accessibilityLabel="Play video">
          <Image source={{ uri: thumbnail }} style={{ flex: 1 }} resizeMode="cover" />
          <View style={{ position: 'absolute', inset: 0, alignItems: 'center', justifyContent: 'center' }}>
            <View style={{ width: 64, height: 64, borderRadius: 32, backgroundColor: '#000A', alignItems: 'center', justifyContent: 'center' }}>
              <Text style={{ color: '#fff', fontSize: 26, marginLeft: 4 }}>▶</Text>
            </View>
          </View>
        </Pressable>
      )}
    </View>
  );
}
