/**
 * Only approved accounts use the app. Until someone is signed in with one, this covers every screen:
 * the Kingdom Heights shield, large in the middle, with Log in / Create account below it, or, once
 * they've asked for an account, Waiting for approval. Everything underneath stays mounted, so sign-in
 * links (email, Google on the web) and notification taps still finish there. Demo builds without the
 * school server stay open. Mounted last in app/_layout.tsx, over the whole app. The shield fades in
 * first, then everything below it (straight away for people who turn on Reduce Motion).
 */
import { useCallback, useEffect, useState } from 'react';
import { AccessibilityInfo, ActivityIndicator, Animated, AppState, Platform, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { errorText, hasSignIn, live, me, onAuthChange, session, signOut, updateMyName } from './api/connect';
import { disableAutoCheckIn } from './carline/autoCheckIn';
import { forgetCarPass } from './carline/carPass';
import { SignIn } from './comms/SignIn';
import { disablePush } from './comms/push';
import { gateFor, type Gate } from './gate';
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

/** `linking`: the app opened on a sign-in link (/auth), which finishes underneath. */
export function AccountGate({ gate, recheck, linking }: { gate: Gate; recheck: (refresh?: boolean) => void; linking: boolean }) {
  const insets = useSafeAreaInsets();
  const fade = useWelcomeFade();
  const checking = gate === 'checking' || (gate === 'out' && linking);
  return (
    <View style={[StyleSheet.absoluteFill, { backgroundColor: C.bg }]} accessibilityViewIsModal>
      <ScrollView keyboardShouldPersistTaps="handled" automaticallyAdjustKeyboardInsets
        contentContainerStyle={{ flexGrow: 1, justifyContent: 'center', gap: 24, padding: 16, paddingTop: insets.top + 32, paddingBottom: insets.bottom + 32,
          width: '100%', maxWidth: 480, alignSelf: 'center' }}>
        <Animated.View style={{ alignItems: 'center', opacity: fade.shield }}><Shield size={160} /></Animated.View>
        <Animated.View style={{ opacity: fade.rest }}>
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
