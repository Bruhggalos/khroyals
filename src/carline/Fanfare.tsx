/**
 * Birthday fanfare for the car line board: when a child is announced on their birthday, confetti
 * falls across the screen and a "Happy Birthday" card with their name and pickup number pops up
 * between two bobbing trumpets, then everything fades (FANFARE_MS). Never blocks the board.
 */
import { useEffect, useState } from 'react';
import { Animated, Easing, Platform, Text, View } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { FANFARE_MS } from './board';
import { C } from '../ui';

const GOLD = '#F5B800';
const CONFETTI = [C.primary, C.accent, GOLD, '#22C55E', '#FFFFFF', '#38BDF8', '#F472B6'];
const PIECES = 70;
const native = Platform.OS !== 'web';

type Piece = { x: number; w: number; h: number; color: string; start: number; end: number; drift: number; spin: number };

/** Confetti scattered across the width, each piece falling at its own time and speed (as fractions of the fanfare). */
function scatter(width: number): Piece[] {
  return Array.from({ length: PIECES }, (_, i) => {
    const start = Math.random() * 0.45;
    return {
      x: Math.random() * width, w: 8 + Math.random() * 8, h: 12 + Math.random() * 12, color: CONFETTI[i % CONFETTI.length],
      start, end: Math.min(1, start + 0.4 + Math.random() * 0.3), drift: (Math.random() - 0.5) * 160, spin: (Math.random() < 0.5 ? -1 : 1) * (360 + Math.random() * 540),
    };
  });
}

/** Back and forth for the whole fanfare, `times` swings. */
const swing = (times: number, a: number, b: number) => ({
  inputRange: Array.from({ length: times + 1 }, (_, i) => i / times),
  outputRange: Array.from({ length: times + 1 }, (_, i) => (i % 2 ? b : a)),
});

const ROCK = swing(12, -14, 6);  // the trumpets tilting up and down, in degrees

export function Fanfare({ name, number, u, width, height, onDone }: {
  name: string; number: string | null; u: number; width: number; height: number; onDone: () => void;
}) {
  const [t] = useState(() => new Animated.Value(0));    // 0 → 1 over the whole fanfare
  const [pop] = useState(() => new Animated.Value(0));  // the card springing in
  const [pieces] = useState(() => scatter(width));
  useEffect(() => {
    const run = Animated.parallel([
      Animated.timing(t, { toValue: 1, duration: FANFARE_MS, easing: Easing.linear, useNativeDriver: native }),
      Animated.spring(pop, { toValue: 1, friction: 5, tension: 70, useNativeDriver: native }),
    ]);
    run.start(({ finished }) => { if (finished) onDone(); });
    return () => run.stop();
  }, [t, pop, onDone]);

  const fade = t.interpolate({ inputRange: [0, 0.04, 0.88, 1], outputRange: [0, 1, 1, 0] });
  const trumpet = (side: 1 | -1) => (
    <Animated.View style={{ transform: [
      { scaleX: side },
      { rotate: t.interpolate({ inputRange: ROCK.inputRange, outputRange: ROCK.outputRange.map((d) => `${d}deg`) }) },
      { scale: t.interpolate(swing(24, 1, 1.12)) },
    ] }}>
      <MaterialCommunityIcons name="trumpet" size={u * 4.5} color={GOLD} />
    </Animated.View>
  );

  return (
    <Animated.View pointerEvents="none" accessibilityLiveRegion="polite"
      style={{ position: 'absolute', left: 0, top: 0, right: 0, bottom: 0, zIndex: 10, opacity: fade, backgroundColor: 'rgba(5, 8, 28, 0.55)', overflow: 'hidden' }}>
      {pieces.map((p, i) => (
        <Animated.View key={i} style={{
          position: 'absolute', left: p.x, top: 0, width: p.w, height: p.h, borderRadius: 2, backgroundColor: p.color,
          transform: [
            { translateY: t.interpolate({ inputRange: [p.start, p.end], outputRange: [-40, height + 40], extrapolate: 'clamp' }) },
            { translateX: t.interpolate({ inputRange: [p.start, p.end], outputRange: [0, p.drift], extrapolate: 'clamp' }) },
            { rotate: t.interpolate({ inputRange: [p.start, p.end], outputRange: ['0deg', `${p.spin}deg`], extrapolate: 'clamp' }) },
          ],
        }} />
      ))}
      <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: u, padding: u }}>
        {width >= 700 && trumpet(-1)}
        <Animated.View accessible accessibilityLabel={`Happy birthday, ${name}!`}
          style={{ flexShrink: 1, alignItems: 'center', backgroundColor: '#fff', borderRadius: u, borderWidth: u * 0.25, borderColor: GOLD,
            paddingVertical: u * 1.2, paddingHorizontal: u * 2, gap: u * 0.3,
            transform: [{ scale: pop.interpolate({ inputRange: [0, 1], outputRange: [0.4, 1] }) }] }}>
          <MaterialCommunityIcons name="crown" size={u * 3.4} color={GOLD} style={{ transform: [{ rotate: '-12deg' }] }} />
          <Text style={{ color: C.accent, fontSize: u * 1.1, fontWeight: '900', letterSpacing: 3 }}>HAPPY BIRTHDAY</Text>
          <Text style={{ color: C.primary, fontSize: u * 2.8, fontWeight: '900', textAlign: 'center' }}>{name}</Text>
          {!!number && (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: u * 0.4, marginTop: u * 0.3 }}>
              <Text style={{ color: C.muted, fontSize: u, fontWeight: '700' }}>Pickup</Text>
              <Text style={{ color: '#fff', backgroundColor: C.primary, fontSize: u * 1.5, fontWeight: '900', paddingHorizontal: u * 0.6, borderRadius: u * 0.3, overflow: 'hidden' }}>{number}</Text>
            </View>
          )}
        </Animated.View>
        {width >= 700 && trumpet(1)}
      </View>
    </Animated.View>
  );
}
