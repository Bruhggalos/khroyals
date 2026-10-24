/**
 * The Planner tab's two weeks: a strip of the days (today first; a dot marks a day with
 * something on it, faded days have no school) above the days themselves, which swipe
 * sideways. Tapping a day in the strip goes to it. Only the day shown and its
 * neighbors are drawn, and the pager takes the height of the day shown.
 */
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Platform, Pressable, ScrollView, Text, View, type NativeScrollEvent, type NativeSyntheticEvent } from 'react-native';
import { C, H } from '../ui';
import type { DayPlan } from './plan';

const CHIP = 50;
const GAP = 8;
const noon = (iso: string) => new Date(`${iso}T12:00:00`);

export function DayPager({ plans, index, onIndex, render }: {
  plans: DayPlan[]; index: number; onIndex: (i: number) => void; render: (p: DayPlan) => ReactNode;
}) {
  const [width, setWidth] = useState(0);
  const [heights, setHeights] = useState<Record<string, number>>({});
  const pager = useRef<ScrollView>(null);
  const strip = useRef<ScrollView>(null);
  const [stripWidth, setStripWidth] = useState(0);
  const x = useRef(0);
  const settle = useRef<ReturnType<typeof setTimeout> | null>(null);
  const shownWidth = useRef(0);

  // Show the chosen day: after a tap in the strip or going back to today (sliding), or at
  // a new width (in place).
  useEffect(() => {
    if (!width) return;
    const resized = shownWidth.current !== width;
    shownWidth.current = width;
    if (resized || Math.round(x.current / width) !== index) pager.current?.scrollTo({ x: index * width, animated: !resized });
  }, [index, width]);
  useEffect(() => () => { if (settle.current) clearTimeout(settle.current); }, []);
  useEffect(() => {
    if (stripWidth) strip.current?.scrollTo({ x: Math.max(0, index * (CHIP + GAP) - (stripWidth - CHIP) / 2), animated: true });
  }, [index, stripWidth]);

  // The day changes once a swipe has come to rest (changing it mid-swipe would resize the
  // pager under the finger). The web has no end-of-swipe event, so it waits for a pause.
  const land = () => {
    if (!width) return;
    const i = Math.min(plans.length - 1, Math.max(0, Math.round(x.current / width)));
    if (i !== index) onIndex(i);
  };
  const onScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    x.current = e.nativeEvent.contentOffset.x;
    if (Platform.OS !== 'web') return;
    if (settle.current) clearTimeout(settle.current);
    settle.current = setTimeout(land, 150);
  };

  const plan = plans[index];
  return (
    <View style={{ gap: 10 }}>
      <ScrollView ref={strip} horizontal showsHorizontalScrollIndicator={false} onLayout={(e) => setStripWidth(e.nativeEvent.layout.width)}
        contentContainerStyle={{ gap: GAP, paddingVertical: 2 }}>
        {plans.map((p, i) => {
          const on = i === index;
          const d = noon(p.day);
          const ink = on ? '#fff' : p.dayOff ? C.muted : C.ink;
          return (
            <Pressable key={p.day} onPress={() => onIndex(i)} accessibilityRole="button" accessibilityState={{ selected: on }}
              accessibilityLabel={`${d.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}${p.busy ? ', something on' : ''}`}
              style={({ pressed }) => [{
                width: CHIP, paddingVertical: 8, borderRadius: 14, alignItems: 'center', gap: 2,
                backgroundColor: on ? C.primary : '#fff', borderWidth: 1.5, borderColor: on || i === 0 ? C.primary : C.line,
              }, pressed && { opacity: 0.7 }]}>
              <Text style={{ fontSize: 11, fontWeight: '700', color: on ? '#fff' : C.muted }}>
                {i === 0 ? 'TODAY' : d.toLocaleDateString('en-US', { weekday: 'short' }).toUpperCase()}
              </Text>
              <Text style={{ fontSize: 18, fontWeight: '800', color: ink, opacity: p.dayOff && !on ? 0.6 : 1 }}>{d.getDate()}</Text>
              <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: p.busy ? (on ? '#fff' : C.accent) : 'transparent' }} />
            </Pressable>
          );
        })}
      </ScrollView>

      <View style={{ flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between' }}>
        <H>{plan.label}</H>
        {index > 0 && <Text style={{ color: C.primary, fontWeight: '700' }} accessibilityRole="button" onPress={() => onIndex(0)}>‹ Today</Text>}
      </View>

      <View onLayout={(e) => setWidth(e.nativeEvent.layout.width)}>
        {width > 0 && (
          <ScrollView ref={pager} horizontal pagingEnabled showsHorizontalScrollIndicator={false} onScroll={onScroll} scrollEventThrottle={16}
            onMomentumScrollEnd={land} style={heights[plan.day] ? { height: heights[plan.day] } : undefined}
            contentContainerStyle={{ alignItems: 'flex-start' }}>
            {plans.map((p, i) => {
              const drawn = Math.abs(i - index) <= 1;
              return (
                <View key={p.day} style={{ width }} accessibilityElementsHidden={i !== index} importantForAccessibility={i === index ? 'auto' : 'no-hide-descendants'}
                  onLayout={drawn ? (e) => { const h = Math.ceil(e.nativeEvent.layout.height); setHeights((m) => (m[p.day] === h ? m : { ...m, [p.day]: h })); } : undefined}>
                  {drawn ? render(p) : null}
                </View>
              );
            })}
          </ScrollView>
        )}
      </View>
    </View>
  );
}
