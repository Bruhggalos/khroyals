/**
 * The full-screen critical alert. While an alert is active and a teacher or staff
 * member hasn't answered it, it covers the app (whatever screen they're on) until they
 * tap I'm safe or I need help, or open the details. Everyone else never sees it.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, Keyboard, KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import {
  getUser, isSchoolStaff, listAlerts, live, me, myAlertAnswers, onAuthChange, session, subscribeAlerts,
  type AlertAnswer, type CriticalAlert,
} from '../api/connect';
import { clock } from '../carline/time';
import { AnswerButtons } from './AlertParts';
import { alertKind } from './kinds';

export function AlertTakeover() {
  const insets = useSafeAreaInsets();
  const [alerts, setAlerts] = useState<CriticalAlert[]>([]);
  const [answers, setAnswers] = useState<AlertAnswer[]>([]);
  const [later, setLater] = useState<Set<string>>(new Set());  // "Read the details" puts one away for now
  const scroll = useRef<ScrollView>(null);
  // Typing where they are: bring "Send for help" up above the keyboard.
  useEffect(() => {
    const sub = Keyboard.addListener('keyboardDidShow', () => scroll.current?.scrollToEnd({ animated: true }));
    return () => sub.remove();
  }, []);

  const refresh = useCallback(async () => {
    if (!isSchoolStaff(me())) { setAlerts([]); return; }
    try {
      const [a, r] = await Promise.all([listAlerts(5), myAlertAnswers()]);
      setAlerts(a.filter((x) => !x.endedAt)); setAnswers(r);
    } catch { /* offline: keep what's showing */ }
  }, []);
  useEffect(() => {
    if (!live) return;
    const signedIn = () => session().then(refresh).catch(() => {});
    signedIn();
    const offAuth = onAuthChange(signedIn);
    const offLive = subscribeAlerts(refresh);
    const offApp = AppState.addEventListener('change', (st) => { if (st === 'active') refresh(); });
    return () => { offAuth(); offLive(); offApp.remove(); };
  }, [refresh]);

  const alert = alerts.find((a) => !later.has(a.id) && !answers.some((x) => x.alertId === a.id)) ?? null;
  if (!alert) return null;
  const kind = alertKind(alert.kind);
  const sender = alert.createdBy ? getUser(alert.createdBy) : null;

  return (
    <Modal visible animationType="fade" onRequestClose={() => setLater(new Set([...later, alert.id]))} statusBarTranslucent>
      {/* Keeps "Send for help" above the keyboard while they type where they are. */}
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={{ flex: 1, backgroundColor: kind.color, paddingTop: insets.top + 16, paddingBottom: insets.bottom + 16 }}>
        <ScrollView ref={scroll} contentContainerStyle={{ paddingHorizontal: 20, gap: 16, paddingBottom: 24, width: '100%', maxWidth: 640, alignSelf: 'center' }}
          keyboardShouldPersistTaps="handled">
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <MaterialCommunityIcons name={kind.icon} size={40} color="#fff" />
            <Text style={{ color: '#fff', fontWeight: '900', letterSpacing: 1.5, fontSize: 14, flexShrink: 1 }}>
              CRITICAL ALERT · {kind.label.toUpperCase()}
            </Text>
          </View>
          <Text style={{ color: '#fff', fontSize: 32, fontWeight: '900', lineHeight: 38 }} accessibilityRole="header">{alert.title}</Text>
          {!!alert.body && <Text style={{ color: '#fff', fontSize: 19, lineHeight: 27 }}>{alert.body}</Text>}
          <Text style={{ color: 'rgba(255,255,255,0.85)' }}>
            Sent {clock(alert.createdAt)}{sender ? ` by ${sender.firstName} ${sender.lastName}`.trimEnd() : ''} to every teacher and staff member.
          </Text>
          <View style={{ height: 1, backgroundColor: 'rgba(255,255,255,0.35)' }} />
          <Text style={{ color: '#fff', fontSize: 17, fontWeight: '700' }}>Let the office know you're OK:</Text>
          <AnswerButtons alert={alert} dark onDone={refresh} />
          <Pressable onPress={() => { setLater(new Set([...later, alert.id])); router.push('/alerts'); }} accessibilityRole="button"
            style={{ alignSelf: 'center', padding: 12 }}>
            <Text style={{ color: '#fff', fontWeight: '700', textDecorationLine: 'underline' }}>Read the details</Text>
          </Pressable>
        </ScrollView>
      </KeyboardAvoidingView>
    </Modal>
  );
}
