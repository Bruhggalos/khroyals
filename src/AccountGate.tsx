/**
 * Only approved accounts use the app. Until someone is signed in with one, this covers every screen:
 * the Kingdom Heights shield, large in the middle, with Log in / Create account below it, or, once
 * they've asked for an account, Waiting for approval. Everything underneath stays mounted, so sign-in
 * links (email, Google on the web) and notification taps still finish there. Demo builds without the
 * school server stay open. Mounted last in app/_layout.tsx, over the whole app. The shield fades in
 * first, then everything below it (straight away for people who turn on Reduce Motion). Once someone
 * signs in (or is approved), the page fades away while the shield shrinks into the Home button in the
 * middle of the tab bar, as if it turns into the button (a plain fade with Reduce Motion, or when the
 * button isn't on screen).
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, ActivityIndicator, Animated, AppState, Easing, Keyboard, Platform, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { errorText, hasSignIn, live, me, onAuthChange, session, signOut, updateMyName } from './api/connect';
import { disableAutoCheckIn } from './carline/autoCheckIn';
import { forgetCarPass } from './carline/carPass';
import { SignIn } from './comms/SignIn';
import { disablePush } from './comms/push';
import { gateFor, type Gate } from './gate';
import { flightPath, frameOf, hideHomeButton, homeButtonFrame } from './homeShield';
import { Shield } from './Shield';
import { Button, C, Card, Field, H, P, s } from './ui';

/** Where the signed-in person stands; checks again on sign-in and out, when the app comes back to the front, and every minute while waiting. */
export function useAccountGate(): { gate: Gate; recheck: (refresh?: boolean) => void } {
  const [gate, setGate] = useState<Gate>(live ? 'checking' : 'in');
  const recheck = useCallback((refresh = false) => {
    if (!live) return;
    session({ refresh })
      .then((p) => setGate(gateFor(p)))
      // The profile didn't load (no connection?): someone already signed in on this phone stays in.
      .catch(() => hasSignIn().then((yes) => setGate(yes ? 'in' : 'out')).catch(() => setGate('out')));
  }, []);
  useEffect(() => {
    recheck();
    const off = onAuthChange(() => recheck());
    const front = AppState.addEventListener('change', (state) => { if (state === 'active') recheck(true); });
    return () => { off(); front.remove(); };
  }, [recheck]);
  // Waiting for approval: notice the office's yes without a restart.
  useEffect(() => {
    if (gate !== 'waiting') return;
    const t = setInterval(() => recheck(true), 60_000);
    return () => clearInterval(t);
  }, [gate, recheck]);
  return { gate, recheck };
}

const native = Platform.OS !== 'web';

/** The shield fades in, then the rest; both show at once with Reduce Motion on. */
function useWelcomeFade() {
  const [shield] = useState(() => new Animated.Value(0));
  const [rest] = useState(() => new Animated.Value(0));
  useEffect(() => {
    let fade: Animated.CompositeAnimation | null = null;
    AccessibilityInfo.isReduceMotionEnabled().catch(() => false).then((still) => {
      if (still) { shield.setValue(1); rest.setValue(1); return; }
      fade = Animated.sequence([
        Animated.timing(shield, { toValue: 1, duration: 700, useNativeDriver: native }),
        Animated.timing(rest, { toValue: 1, duration: 500, useNativeDriver: native }),
      ]);
      fade.start();
    });
    return () => fade?.stop();
  }, [shield, rest]);
  return { shield, rest };
}

type Plan = { dx: number; dy: number; scale: number } | 'fade';

/**
 * Leaving: the page and the form fade out while the shield flies into the Home button (`shield` is the
 * shield's own box, measured on screen); `onGone` when it's there.
 */
function useFlight(leaving: boolean, onGone?: () => void) {
  const shield = useRef<View>(null);
  const gone = useRef(onGone);
  gone.current = onGone;
  const [flight] = useState(() => new Animated.Value(0));   // 0 → 1 on the way to the Home button
  const [page] = useState(() => new Animated.Value(1));     // the page behind the shield, and the form
  const [plan, setPlan] = useState<Plan | null>(null);

  // Where to: put the keyboard away first so the page stops moving, then measure both ends.
  useEffect(() => {
    if (!leaving) return;
    let stop = false;
    const settle = native && Keyboard.isVisible() ? new Promise((r) => { Keyboard.dismiss(); setTimeout(r, 300); }) : Promise.resolve();
    settle.then(() => Promise.all([frameOf(shield.current), homeButtonFrame(), AccessibilityInfo.isReduceMotionEnabled().catch(() => false)]))
      .then(([from, to, still]) => { if (!stop) setPlan(from && to && !still ? flightPath(from, to) : 'fade'); });
    return () => { stop = true; };
  }, [leaving]);

  useEffect(() => {
    if (!plan) return;
    const fly = plan !== 'fade';
    if (fly) hideHomeButton(true);   // only one shield: the button shows again as this one lands on it
    const run = Animated.parallel([
      Animated.timing(page, { toValue: 0, duration: fly ? 420 : 250, easing: Easing.out(Easing.quad), useNativeDriver: native }),
      ...(fly ? [Animated.timing(flight, { toValue: 1, duration: 800, easing: Easing.inOut(Easing.cubic), useNativeDriver: native })] : []),
    ]);
    run.start(({ finished }) => { if (finished) { hideHomeButton(false); gone.current?.(); } });
    return () => { run.stop(); hideHomeButton(false); };
  }, [plan, page, flight]);

  // A little lift first, then down into the button, shrinking to its size.
  const style = plan && plan !== 'fade' ? { transform: [
    { translateX: flight.interpolate({ inputRange: [0, 1], outputRange: [0, plan.dx] }) },
    { translateY: flight.interpolate({ inputRange: [0, 0.18, 1], outputRange: [0, -14, plan.dy] }) },
    { scale: flight.interpolate({ inputRange: [0, 0.18, 1], outputRange: [1, 1.06, plan.scale] }) },
  ] } : plan === 'fade' ? { opacity: page } : null;
  return { shield, page, style };
}

/**
 * `linking`: the app opened on a sign-in link (/auth), which finishes underneath. `leaving`: they're in;
 * the shield flies into the Home button and `onGone` takes the welcome screen away.
 */
export function AccountGate({ gate, recheck, linking, leaving = false, onGone }: {
  gate: Gate; recheck: (refresh?: boolean) => void; linking: boolean; leaving?: boolean; onGone?: () => void;
}) {
  const insets = useSafeAreaInsets();
  const fade = useWelcomeFade();
  const flight = useFlight(leaving, onGone);
  const checking = gate === 'checking' || (gate === 'out' && linking);
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents={leaving ? 'none' : 'auto'} accessibilityViewIsModal={!leaving}>
      <Animated.View style={[StyleSheet.absoluteFill, { backgroundColor: C.bg, opacity: flight.page }]} />
      <ScrollView keyboardShouldPersistTaps="handled" automaticallyAdjustKeyboardInsets
        contentContainerStyle={{ flexGrow: 1, justifyContent: 'center', gap: 24, padding: 16, paddingTop: insets.top + 32, paddingBottom: insets.bottom + 32,
          width: '100%', maxWidth: 480, alignSelf: 'center' }}>
        <Animated.View style={{ alignItems: 'center', opacity: fade.shield }}>
          <Animated.View ref={flight.shield} collapsable={false} style={flight.style}><Shield size={160} /></Animated.View>
        </Animated.View>
        <Animated.View style={{ opacity: Animated.multiply(fade.rest, flight.page) }}>
          {checking ? <ActivityIndicator color={C.primary} />
            : gate === 'waiting' ? <Waiting recheck={recheck} />
            : <SignIn embedded onDone={() => recheck()} />}
        </Animated.View>
      </ScrollView>
    </View>
  );
}

/** Signed in, but the office hasn't approved the account yet. A name is asked for if the sign-in didn't bring one. */
function Waiting({ recheck }: { recheck: (refresh?: boolean) => void }) {
  const person = me();
  const [first, setFirst] = useState(person?.firstName ?? '');
  const [last, setLast] = useState(person?.lastName ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const needsName = !person?.firstName || !person?.lastName;
  const saveName = async () => {
    setBusy(true); setError(null);
    try { await updateMyName(first.trim(), last.trim()); recheck(true); } catch (e) { setError(errorText(e)); } finally { setBusy(false); }
  };
  return (
    <Card>
      <H>Waiting for approval</H>
      <P>Thanks{person?.firstName ? `, ${person.firstName}` : ''}! The Kingdom Heights office will confirm your account, and then the app opens for you.</P>
      {needsName && (
        <>
          <P muted>Add your name so the office knows who you are.</P>
          <View style={s.row}>
            <Field label="First name" autoComplete="given-name" textContentType="givenName" value={first} onChangeText={setFirst} style={{ flex: 1, minWidth: 0 }} />
            <Field label="Last name" autoComplete="family-name" textContentType="familyName" value={last} onChangeText={setLast} style={{ flex: 1, minWidth: 0 }} error={error} />
          </View>
          <Button label={busy ? 'Saving…' : 'Save my name'} disabled={busy || !first.trim() || !last.trim()} onPress={saveName} />
        </>
      )}
      <Button kind="ghost" label="Check again" onPress={() => recheck(true)} />
      <Button kind="ghost" label="Sign out" onPress={() => disablePush().then(disableAutoCheckIn).then(forgetCarPass).then(signOut).then(() => recheck())} />
    </Card>
  );
}
