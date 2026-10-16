/**
 * Latest news headlines, one at a time. Slides to the next every 5 seconds
 * (paused while someone is swiping, off when Reduce Motion is on); swipe to move
 * yourself. The dots show which headline is up; tap a headline to read it.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  AccessibilityInfo, FlatList, ImageBackground, Pressable, Text, View,
  type NativeScrollEvent, type NativeSyntheticEvent,
} from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { getNews } from '../api/mockApi';
import { C } from '../ui';
import type { Article } from './types';

const COUNT = 5;
const EVERY_MS = 5000;
const HEIGHT = 170;

export function NewsCarousel() {
  const [items, setItems] = useState<Article[]>([]);
  const [width, setWidth] = useState(0);
  const [shown, setShown] = useState(0);
  const list = useRef<FlatList<Article>>(null);
  const page = useRef(0);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  const reduceMotion = useRef(false);

  useEffect(() => {
    getNews().then((n) => setItems(n.articles.slice(0, COUNT)));
    AccessibilityInfo.isReduceMotionEnabled().then((v) => { reduceMotion.current = v; }).catch(() => {});
  }, []);

  // A copy of the first headline at the end lets the last one slide on to the first.
  const slides = items.length > 1 ? [...items, items[0]] : items;

  const stop = () => { if (timer.current) clearInterval(timer.current); timer.current = null; };
  const start = useCallback(() => {
    stop();
    if (items.length < 2 || !width || reduceMotion.current) return;
    timer.current = setInterval(() => {
      list.current?.scrollToOffset({ offset: (page.current + 1) * width, animated: true });
    }, EVERY_MS);
  }, [items.length, width]);
  useFocusEffect(useCallback(() => { start(); return stop; }, [start]));

  const onScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    if (!width) return;
    const x = e.nativeEvent.contentOffset.x;
    if (items.length > 1 && x >= items.length * width - 1) {
      // Reached the copy of the first headline: jump back to the real one.
      list.current?.scrollToOffset({ offset: 0, animated: false });
      page.current = 0;
      setShown(0);
      return;
    }
    page.current = Math.round(x / width);
    setShown(page.current % Math.max(items.length, 1));
  };

  return (
    <View onLayout={(e) => setWidth(e.nativeEvent.layout.width)}
      style={{ height: HEIGHT, borderRadius: 16, overflow: 'hidden', backgroundColor: C.primary }}>
      {width > 0 && (
        <FlatList ref={list} data={slides} horizontal pagingEnabled showsHorizontalScrollIndicator={false}
          keyExtractor={(a, i) => `${a.id}-${i}`} onScroll={onScroll} scrollEventThrottle={16}
          onScrollBeginDrag={stop} onMomentumScrollEnd={start}
          getItemLayout={(_, i) => ({ length: width, offset: width * i, index: i })}
          renderItem={({ item: a }) => (
            <Pressable onPress={() => router.push(`/news/${a.slug}`)} accessibilityRole="link" accessibilityLabel={a.title}
              style={{ width, height: HEIGHT }}>
              <ImageBackground source={a.heroImage ? { uri: a.heroImage } : undefined} resizeMode="cover"
                style={{ flex: 1, justifyContent: 'flex-end' }}>
                <View style={{ backgroundColor: 'rgba(0, 18, 77, 0.6)', paddingHorizontal: 16, paddingTop: 12, paddingBottom: 28, gap: 4 }}>
                  <Text style={{ color: '#fff', opacity: 0.85, fontSize: 12, fontWeight: '700', letterSpacing: 0.5 }}>
                    {a.category.toUpperCase()} · {new Date(a.publishedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                  </Text>
                  <Text numberOfLines={2} style={{ color: '#fff', fontSize: 18, fontWeight: '800' }}>{a.title}</Text>
                </View>
              </ImageBackground>
            </Pressable>
          )} />
      )}
      {items.length > 1 && (
        <View pointerEvents="none" style={{ position: 'absolute', bottom: 10, left: 0, right: 0, flexDirection: 'row', justifyContent: 'center', gap: 7 }}>
          {items.map((a, i) => (
            <View key={a.id} style={{
              width: 8, height: 8, borderRadius: 4,
              backgroundColor: i === shown ? '#fff' : 'rgba(255, 255, 255, 0.4)',
              transform: [{ scale: i === shown ? 1.25 : 1 }],
            }} />
          ))}
        </View>
      )}
    </View>
  );
}
