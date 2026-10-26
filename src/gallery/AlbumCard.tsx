/** An album in the photo gallery: its cover, name, date and photo count. */
import { Image, Pressable, Text, View } from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import type { GalleryAlbum } from '../api/connect';
import { C } from '../ui';

export const albumDate = (iso: string) => new Date(`${iso}T12:00`).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });

export function AlbumCard({ a, width, category }: { a: GalleryAlbum; width?: number; category?: string }) {
  return (
    <Pressable onPress={() => router.push(`/photos/${a.id}`)} accessibilityRole="button" accessibilityLabel={`${a.title}, ${a.count} photos`}
      style={({ pressed }) => [{ width, flexGrow: width ? 0 : 1, flexBasis: width ? undefined : '45%', backgroundColor: '#fff', borderRadius: 14,
        borderWidth: 1, borderColor: C.line, overflow: 'hidden' }, pressed && { opacity: 0.8 }]}>
      <View style={{ width: '100%', aspectRatio: 4 / 3, backgroundColor: C.bg }}>
        {a.cover ? <Image source={{ uri: a.cover }} style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }} resizeMode="cover" />
          : <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}><Ionicons name="images-outline" size={32} color={C.muted} /></View>}
      </View>
      {a.visibility === 'staff' && (
        <Text style={{ position: 'absolute', top: 8, left: 8, backgroundColor: 'rgba(11,25,40,0.8)', color: '#fff', fontSize: 12, fontWeight: '700',
          paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999, overflow: 'hidden' }}>🔒 Staff only</Text>
      )}
      <View style={{ padding: 10, gap: 2 }}>
        {!!category && <Text style={{ color: C.accent, fontSize: 12, fontWeight: '800' }}>{category.toUpperCase()}</Text>}
        <Text style={{ fontWeight: '800', color: C.ink }} numberOfLines={2}>{a.title}</Text>
        <Text style={{ color: C.muted, fontSize: 13 }}>{albumDate(a.takenOn)} · {a.count} photo{a.count === 1 ? '' : 's'}</Text>
      </View>
    </Pressable>
  );
}

