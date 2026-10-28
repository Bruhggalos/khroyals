/**
 * The car line board's festive scenes (festiveScene in ./festive): piles in the two bottom corners, and
 * each time a car checks in (`cameo` goes up) a character pops out of one of them, taking turns, kicks
 * some of the pile up, says something and ducks back down. Breaks: acorns and a squirrel (Fall Break),
 * leaves and a turkey (Thanksgiving), snow and a snowman with snow falling behind the board (Christmas,
 * Snowfall), sand and a crab (Spring Break). Holidays: stars and an eagle (Labor, Veterans, Presidents'
 * and Memorial Day), a dove (Dr. King), hearts and a teddy bear, shamrocks and a rainbow, spring flowers
 * and a lamb (Easter), bouquets and a gift (Mother's Day). Over the board, never blocking it.
 */
import { useEffect, useState } from 'react';
import { Animated, Easing, Platform, Text, View } from 'react-native';
import type { Scene } from './festive';
import { C } from '../ui';

const native = Platform.OS !== 'web';
const CAMEO_MS = 2800;

/**
 * Each scene: who pops out and what they say, what they kick up, a glow behind them (brown animals need
 * one to show up on the dark board), and the pile: emoji scattered on a dark mound, or a drift of three
 * shaded humps with something on top.
 */
type PileArt = { kind: 'scatter'; items: string[]; mound: string } | { kind: 'drift'; humps: [string, string, string]; on: string | null };
const WARM = 'rgba(254, 215, 170, 0.35)';
const STARS: PileArt = { kind: 'scatter', items: ['⭐', '🌟', '⭐'], mound: '#991B1B' };
const THEMES: Record<Scene, { who: string; says: string; puff: [string, string]; glow: string | null; pile: PileArt }> = {
  'fall-break': { who: '🐿️', says: 'Happy Fall Break!', puff: ['🌰', '🍂'], glow: WARM, pile: { kind: 'scatter', items: ['🌰', '🍂', '🌰'], mound: '#5B3A1E' } },
  thanksgiving: { who: '🦃', says: 'Gobble gobble!', puff: ['🍂', '🍁'], glow: WARM, pile: { kind: 'scatter', items: ['🍁', '🍂', '🍂'], mound: '#7C2D12' } },
  christmas: { who: '⛄', says: 'Merry Christmas!', puff: ['❄️', '❄️'], glow: null, pile: { kind: 'drift', humps: ['#CBD5E1', '#DCE3EC', '#F8FAFC'], on: null } },
  'spring-break': { who: '🦀', says: 'Happy Spring Break!', puff: ['🐚', '🐚'], glow: null, pile: { kind: 'drift', humps: ['#B98B4E', '#CFA468', '#E8C68E'], on: '🐚' } },
  'labor-day': { who: '🦅', says: 'Happy Labor Day!', puff: ['⭐', '✨'], glow: WARM, pile: STARS },
  'veterans-day': { who: '🦅', says: 'Thank you, veterans!', puff: ['⭐', '✨'], glow: WARM, pile: STARS },
  'mlk-day': { who: '🕊️', says: "Honoring Dr. King's dream", puff: ['✨', '⭐'], glow: null, pile: { kind: 'scatter', items: ['⭐', '✨', '🌟'], mound: '#4C1D95' } },
  valentines: { who: '🧸', says: "Happy Valentine's Day!", puff: ['💕', '💖'], glow: WARM, pile: { kind: 'scatter', items: ['💖', '💕', '💗'], mound: '#9D174D' } },
  'presidents-day': { who: '🦅', says: "Happy Presidents' Day!", puff: ['⭐', '✨'], glow: WARM, pile: STARS },
  'st-patricks': { who: '🌈', says: "Happy St. Patrick's Day!", puff: ['🍀', '☘️'], glow: null, pile: { kind: 'scatter', items: ['☘️', '🍀', '☘️'], mound: '#14532D' } },
  easter: { who: '🐑', says: 'He is risen!', puff: ['🌸', '🌼'], glow: null, pile: { kind: 'scatter', items: ['🌷', '🌼', '🌸'], mound: '#166534' } },
  'mothers-day': { who: '💝', says: "Happy Mother's Day!", puff: ['🌸', '💕'], glow: null, pile: { kind: 'scatter', items: ['💐', '🌸', '🌷'], mound: '#9D174D' } },
  'memorial-day': { who: '🦅', says: 'Honoring the fallen', puff: ['⭐', '✨'], glow: WARM, pile: STARS },
};

/** The same "random" number for the same n, so the scenes look the same on every screen and every visit. */
const noise = (n: number) => { const x = Math.sin(n * 12.9898 + 78.233) * 43758.5453; return x - Math.floor(x); };

/** A scattered pile (leaves, acorns): centre (fractions of the pile's width and height), size (×u), tilt and which item; back ones first. */
const SCATTER = Array.from({ length: 30 }, (_, i) => {
  const x = 0.06 + noise(i) * 0.88;
  const mound = Math.sqrt(Math.max(0, 1 - (2 * x - 1) ** 2));  // tallest in the middle
  return { x, y: 1 - mound * (0.25 + 0.75 * noise(i + 50)) * 0.85, size: 1.3 + noise(i + 100) * 1.3, tilt: Math.round(noise(i + 150) * 360), item: i % 3 };
}).sort((a, b) => a.y - b.y);

/** What the character kicks up: how far out and up each piece flies (×u). */
const PUFF = [{ dx: -3.2, dy: -4.5 }, { dx: -1.2, dy: -6 }, { dx: 1.4, dy: -5.5 }, { dx: 3.4, dy: -4 }];

export function SeasonScene({ season, u, width, cameo }: { season: Scene; u: number; width: number; cameo: number }) {
  return (
    <View pointerEvents="none" style={{ position: 'absolute', left: 0, top: 0, right: 0, bottom: 0, zIndex: 2, overflow: 'hidden' }}>
      <Pile season={season} u={u} width={width} side="left" turn={cameo > 0 && cameo % 2 === 1 ? cameo : 0} />
      <Pile season={season} u={u} width={width} side="right" turn={cameo > 0 && cameo % 2 === 0 ? cameo : 0} />
    </View>
  );
}

/** One pile; whenever `turn` changes (and isn't 0), its character pops out. */
function Pile({ season, u, width, side, turn }: { season: Scene; u: number; width: number; side: 'left' | 'right'; turn: number }) {
  const theme = THEMES[season];
  // A pile is at most 40% of the screen across, so on a phone the two leave the middle clear.
  const W = Math.min(u * 12, width * 0.4), H = W * 0.375, T = W * 0.42;
  const [t] = useState(() => new Animated.Value(0));
  useEffect(() => {
    if (!turn) return;
    t.setValue(0);
    const pop = Animated.timing(t, { toValue: 1, duration: CAMEO_MS, easing: Easing.linear, useNativeDriver: native });
    pop.start();
    return () => pop.stop();
  }, [turn, t]);

  const rise = t.interpolate({ inputRange: [0, 0.14, 0.86, 1], outputRange: [T * 1.3, 0, 0, T * 1.3] });
  const wobble = t.interpolate({
    inputRange: [0, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 1],
    outputRange: ['0deg', '-9deg', '9deg', '-9deg', '9deg', '-9deg', '9deg', '0deg', '0deg'],
  });
  const bubble = t.interpolate({ inputRange: [0, 0.2, 0.26, 0.76, 0.82, 1], outputRange: [0, 0, 1, 1, 0, 0] });
  const toCenter = side === 'left' ? 1 : -1;

  return (
    <View style={{ position: 'absolute', bottom: -u * 0.8, [side]: -u * 1.5, width: W, height: H }}>
      {/* The character, behind the pile; faces the middle of the screen. */}
      <Animated.View style={{ position: 'absolute', left: W / 2 - T / 2, bottom: H * 0.5, width: T, alignItems: 'center',
        transform: [{ translateY: rise }, { rotate: wobble }] }}>
        {theme.glow && <View style={{ position: 'absolute', top: T * 0.08, width: T * 0.9, height: T * 0.9, borderRadius: T, backgroundColor: theme.glow }} />}
        <Text style={{ fontSize: T * 0.85, lineHeight: T, transform: [{ scaleX: toCenter }] }}>{theme.who}</Text>
      </Animated.View>
      {/* What they say, toward the middle of the screen */}
      <Animated.View style={{ position: 'absolute', bottom: H * 0.5 + T * 0.8, [side]: W / 2 + T * 0.3, width: u * 18,
        alignItems: side === 'left' ? 'flex-start' : 'flex-end',
        opacity: bubble, transform: [{ scale: bubble.interpolate({ inputRange: [0, 1], outputRange: [0.6, 1] }) }] }}>
        <Text style={{ backgroundColor: '#fff', color: C.ink, fontSize: u * 0.95, fontWeight: '900', paddingHorizontal: u * 0.6, paddingVertical: u * 0.3,
          borderRadius: u * 0.8, overflow: 'hidden' }}>{theme.says}</Text>
      </Animated.View>
      {theme.pile.kind === 'drift' ? <Drift pile={theme.pile} W={W} H={H} u={u} /> : <Scatter pile={theme.pile} W={W} H={H} u={u} />}
      {/* Kicked up as the character pops out */}
      {PUFF.map((p, i) => (
        <Animated.Text key={`puff${i}`} style={{ position: 'absolute', left: W / 2 - u, top: H * 0.15, fontSize: u * 1.8,
          opacity: t.interpolate({ inputRange: [0, 0.04, 0.4, 0.55, 1], outputRange: [0, 1, 1, 0, 0] }),
          transform: [
            { translateX: t.interpolate({ inputRange: [0, 0.5, 1], outputRange: [0, p.dx * u, p.dx * u] }) },
            { translateY: t.interpolate({ inputRange: [0, 0.22, 0.55, 1], outputRange: [0, p.dy * u, (p.dy + 2.5) * u, (p.dy + 2.5) * u] }) },
            { rotate: t.interpolate({ inputRange: [0, 0.55, 1], outputRange: ['0deg', `${(i % 2 ? 1 : -1) * 220}deg`, '0deg'] }) },
          ] }}>{theme.puff[i % 2]}</Animated.Text>
      ))}
    </View>
  );
}

/** Leaves or acorns heaped on a dark mound, so the character disappears into it. */
function Scatter({ pile, W, H, u }: { pile: Extract<PileArt, { kind: 'scatter' }>; W: number; H: number; u: number }) {
  return (
    <>
      <View style={{ position: 'absolute', left: W * 0.04, right: W * 0.04, bottom: -H * 0.55, height: H * 1.25, borderRadius: W, backgroundColor: pile.mound }} />
      {SCATTER.map((l, i) => (
        <Text key={i} style={{ position: 'absolute', left: l.x * W - (l.size * u) / 2, top: l.y * H - (l.size * u) / 2,
          fontSize: l.size * u, lineHeight: l.size * u * 1.1, transform: [{ rotate: `${l.tilt}deg` }] }}>{pile.items[l.item % pile.items.length]}</Text>
      ))}
    </>
  );
}

/** A drift (snow, sand): two shaded humps behind a bright one, with a little sparkle, or shells, on top. */
function Drift({ pile, W, H, u }: { pile: Extract<PileArt, { kind: 'drift' }>; W: number; H: number; u: number }) {
  const hump = (left: number, right: number, height: number, color: string) => (
    <View style={{ position: 'absolute', left: W * left, right: W * right, bottom: -H * 0.55, height: H * height, borderRadius: W, backgroundColor: color }} />
  );
  return (
    <>
      {hump(0, 0.38, 1.3, pile.humps[0])}
      {hump(0.4, 0, 1.4, pile.humps[1])}
      {hump(0.08, 0.1, 1.2, pile.humps[2])}
      {[0.22, 0.5, 0.7, 0.36].map((x, i) => pile.on ? (
        <Text key={i} style={{ position: 'absolute', left: W * x, top: H * (0.4 + (i % 2) * 0.14), fontSize: u * 1.3, transform: [{ rotate: `${i * 40 - 30}deg` }] }}>{pile.on}</Text>
      ) : (
        <View key={i} style={{ position: 'absolute', left: W * x, top: H * (0.42 + (i % 2) * 0.12), width: 4, height: 4, borderRadius: 2, backgroundColor: '#BAE6FD' }} />
      ))}
    </>
  );
}

/** Flakes for the snowfall: across (fraction of the width), how far through their fall they start, size, sway and speed group. */
const FLAKES = Array.from({ length: 48 }, (_, i) => ({
  x: noise(i + 300), phase: 0.02 + noise(i + 350) * 0.96, size: 3 + noise(i + 400) * 5, sway: 6 + noise(i + 450) * 18, speed: i % 3,
}));
const FALL_MS = [16000, 22000, 30000];

/**
 * Snow falling behind the board before Christmas break: drawn first, so the white rows cover it and it
 * only shows in the gaps, around the header and in the margins. Each flake loops top to bottom forever.
 */
export function Snowfall({ width, height }: { width: number; height: number }) {
  const [falls] = useState(() => FALL_MS.map(() => new Animated.Value(0)));
  useEffect(() => {
    const loops = falls.map((f, i) => Animated.loop(Animated.timing(f, { toValue: 1, duration: FALL_MS[i], easing: Easing.linear, useNativeDriver: native })));
    loops.forEach((l) => l.start());
    return () => loops.forEach((l) => l.stop());
  }, [falls]);
  const top = -12, bottom = height + 12;
  return (
    <View pointerEvents="none" style={{ position: 'absolute', left: 0, top: 0, right: 0, bottom: 0, overflow: 'hidden' }}>
      {FLAKES.map((f, i) => {
        const t = falls[f.speed];
        // Start part way down the screen (phase), reach the bottom, then come back in at the top.
        const start = top + f.phase * (bottom - top), turn = 1 - f.phase;
        return (
          <Animated.View key={i} style={{
            position: 'absolute', left: f.x * width, top: 0, width: f.size, height: f.size, borderRadius: f.size, backgroundColor: '#fff', opacity: 0.75,
            transform: [
              { translateY: t.interpolate({ inputRange: [0, turn, turn + 0.0001, 1], outputRange: [start, bottom, top, start] }) },
              { translateX: t.interpolate({ inputRange: [0, 0.25, 0.5, 0.75, 1], outputRange: [0, f.sway, 0, -f.sway, 0] }) },
            ],
          }} />
        );
      })}
    </View>
  );
}
