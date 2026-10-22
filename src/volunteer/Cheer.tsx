/**
 * The "Say Yes!" celebration: big clapping hands pop in and clap, a ring and a burst of
 * confetti in the school colors fly out, and a thank-you says what you signed up for
 * (or, for an item request, what you're bringing).
 * It closes by itself after a few seconds, or with a tap. With Reduce Motion on, it's
 * just the hands and the thank-you.
 */
import { useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, Animated, Easing, Modal, Platform, Pressable, Text, View } from 'react-native';
import { GOLD } from '../sports/ui';
import { C } from '../ui';

const native = Platform.OS !== 'web';
const SHOWN_FOR = 2800;
const COLORS = [GOLD, '#FFFFFF', C.accent, '#7EA2FF'];
const EMOJI = ['👏', '🎉', '✨', '💙', '⭐'];

/** Where each piece of confetti flies: all the way around, at a few distances, some of them emoji. */
const PIECES = Array.from({ length: 22 }, (_, i) => {
  const angle = (i / 22) * Math.PI * 2 + (i % 2 ? 0.12 : -0.08);
  return {
    dx: Math.cos(angle) * (130 + ((i * 37) % 100)),
    dy: Math.sin(angle) * (130 + ((i * 37) % 100)),
    emoji: i % 4 === 0 ? EMOJI[(i / 4) % EMOJI.length] : null,
    color: COLORS[i % COLORS.length],
    size: 8 + ((i * 7) % 8),
    round: i % 3 === 0,
    spin: (i % 2 ? 1 : -1) * (200 + ((i * 53) % 340)),
  };
});

/** The three little lines that flash above the hands on every clap. */
const SPARKS = [-38, 0, 38];

export function Cheer({ title, bringing, onDone }: { title: string | null; bringing?: string; onDone: () => void }) {
  const [still, setStill] = useState(false);
  const last = useRef({ title, bringing });
  if (title) last.current = { title, bringing };
  const v = useRef({ pop: new Animated.Value(0), burst: new Animated.Value(0), clap: new Animated.Value(0), words: new Animated.Value(0) }).current;

  useEffect(() => {
    AccessibilityInfo.isReduceMotionEnabled().then(setStill).catch(() => {});
  }, []);

  useEffect(() => {
    if (!title) return;
    AccessibilityInfo.announceForAccessibility?.(bringing ? `Thank you! You're bringing ${bringing} for ${title}.` : `Thank you! You said yes to ${title}.`);
    Object.values(v).forEach((x) => x.setValue(0));
    const clap = Animated.sequence([
      Animated.timing(v.clap, { toValue: 1, duration: 110, easing: Easing.out(Easing.quad), useNativeDriver: native }),
      Animated.timing(v.clap, { toValue: 0, duration: 160, easing: Easing.in(Easing.quad), useNativeDriver: native }),
    ]);
    const show = still
      ? Animated.parallel([
          Animated.timing(v.pop, { toValue: 1, duration: 1, useNativeDriver: native }),
          Animated.timing(v.words, { toValue: 1, duration: 1, useNativeDriver: native }),
        ])
      : Animated.parallel([
          Animated.spring(v.pop, { toValue: 1, friction: 4, tension: 140, useNativeDriver: native }),
          Animated.timing(v.burst, { toValue: 1, duration: 1200, easing: Easing.out(Easing.cubic), useNativeDriver: native }),
          Animated.sequence([Animated.delay(220), Animated.loop(clap, { iterations: 4 })]),
          Animated.timing(v.words, { toValue: 1, duration: 420, delay: 380, easing: Easing.out(Easing.cubic), useNativeDriver: native }),
        ]);
    show.start();
    const timer = setTimeout(onDone, SHOWN_FOR);
    return () => { show.stop(); clearTimeout(timer); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [title, still]);

  const clapScale = v.clap.interpolate({ inputRange: [0, 1], outputRange: [1, 1.16] });
  const clapTilt = v.clap.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '-10deg'] });

  return (
    <Modal visible={!!title} transparent animationType="fade" onRequestClose={onDone} statusBarTranslucent>
      <Pressable onPress={onDone} accessibilityRole="button" accessibilityLabel="Thank you! Tap to close."
        style={{ flex: 1, backgroundColor: 'rgba(10,31,77,0.94)', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
        {/* The stage: everything in it is centered on top of each other and flies out from the middle. */}
        <View style={{ width: 320, height: 260, alignItems: 'center', justifyContent: 'center', marginBottom: 8 }}>
          {/* A gold ring that grows and fades. */}
          <Animated.View style={{ position: 'absolute', width: 170, height: 170, borderRadius: 85, borderWidth: 5, borderColor: GOLD,
            opacity: v.burst.interpolate({ inputRange: [0, 0.05, 0.7, 1], outputRange: [0, 0.9, 0.15, 0] }),
            transform: [{ scale: v.burst.interpolate({ inputRange: [0, 1], outputRange: [0.4, 1.9] }) }] }} />
          {PIECES.map((p, i) => (
            <Animated.View key={i} style={{ position: 'absolute',
              opacity: v.burst.interpolate({ inputRange: [0, 0.08, 0.75, 1], outputRange: [0, 1, 1, 0] }),
              transform: [
                { translateX: v.burst.interpolate({ inputRange: [0, 1], outputRange: [0, p.dx] }) },
                { translateY: v.burst.interpolate({ inputRange: [0, 0.6, 1], outputRange: [0, p.dy * 0.85, p.dy + 70] }) },
                { rotate: v.burst.interpolate({ inputRange: [0, 1], outputRange: ['0deg', `${p.spin}deg`] }) },
              ] }}>
              {p.emoji ? <Text style={{ fontSize: 26 }}>{p.emoji}</Text>
                : <View style={{ width: p.size, height: p.round ? p.size : p.size * 1.8, borderRadius: p.round ? p.size / 2 : 2, backgroundColor: p.color }} />}
            </Animated.View>
          ))}
          {/* The hands: they pop in, then clap (a quick squeeze and tilt) with sparks above them. */}
          <Animated.View style={{ position: 'absolute', alignItems: 'center',
            transform: [{ scale: v.pop.interpolate({ inputRange: [0, 1], outputRange: [0.2, 1] }) }] }}>
            <View style={{ position: 'absolute', top: -34, width: 120, height: 30 }}>
              {SPARKS.map((deg) => (
                <Animated.View key={deg} style={{ position: 'absolute', left: 58 + deg * 1.1, top: deg ? 10 : 2, width: 5, height: 20, borderRadius: 3, backgroundColor: GOLD,
                  opacity: v.clap,
                  transform: [{ rotate: `${deg}deg` }, { translateY: v.clap.interpolate({ inputRange: [0, 1], outputRange: [0, -8] }) }] }} />
              ))}
            </View>
            <Animated.Text accessible={false} style={{ fontSize: 120, transform: [{ scale: clapScale }, { rotate: clapTilt }] }}>👏</Animated.Text>
          </Animated.View>
        </View>
        <Animated.View style={{ alignItems: 'center', gap: 8, opacity: v.words,
          transform: [{ translateY: v.words.interpolate({ inputRange: [0, 1], outputRange: [16, 0] }) }] }}>
          <Text style={{ fontSize: 36, fontWeight: '900', color: '#fff' }}>Thank you!</Text>
          <Text style={{ fontSize: 17, color: 'rgba(255,255,255,0.9)', textAlign: 'center' }}>
            {last.current.bringing
              ? <>You're bringing <Text style={{ fontWeight: '800', color: GOLD }}>{last.current.bringing}</Text> for {last.current.title}.</>
              : <>You said yes to <Text style={{ fontWeight: '800', color: GOLD }}>{last.current.title}</Text>.</>}
          </Text>
          <Text style={{ fontSize: 15, color: 'rgba(255,255,255,0.75)', textAlign: 'center' }}>
            You've joined its chat with the other {last.current.bringing ? 'people bringing items' : 'volunteers'}.
          </Text>
        </Animated.View>
      </Pressable>
    </Modal>
  );
}
