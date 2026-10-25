/** Form fees on screen: a payment's line ("Paid $25.00 · Check · Front office · Oct 24") and the sender's editor for it. */
import { useState } from 'react';
import { Alert, Pressable, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { clearPayment, errorText, recordPayment, type FormPayment, type PaymentMethod } from '../api/connect';
import { schoolToday } from '../calendar/past';
import { DateField } from '../forms/DateTimeField';
import { Button, C, Field, ask, s } from '../ui';
import { GREEN } from './parts';
import { HANDED_IN, PAYMENT_METHODS, methodLabel, money, parseDollars } from './payments';

const shortDay = (iso: string) => new Date(`${iso}T12:00:00`).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

/** Paid (how much, how, where and when, plus the sender's note), or the fee still to pay. */
export function PaymentLine({ fee, payment }: { fee: number; payment: FormPayment | null }) {
  if (!payment) {
    return (
      <View style={[s.row, { gap: 6 }]}>
        <Ionicons name="cash-outline" size={20} color={C.accent} />
        <Text style={{ flex: 1, fontWeight: '700', color: C.ink }}>Fee {money(fee)} · not paid yet</Text>
      </View>
    );
  }
  const short = payment.amountCents < fee;
  return (
    <View style={{ gap: 2 }}>
      <View style={[s.row, { gap: 6 }]}>
        <Ionicons name="cash" size={20} color={short ? C.accent : GREEN} />
        <Text style={{ flex: 1, fontWeight: '700', color: C.ink }}>
          Paid {money(payment.amountCents)}{short ? ` of ${money(fee)}` : ''} · {methodLabel(payment.method)} · {payment.deliveredTo} · {shortDay(payment.receivedOn)}
        </Text>
      </View>
      {!!payment.note && <Text style={{ color: C.muted }}>{payment.note}</Text>}
      {!!payment.recordedBy && <Text style={{ color: C.muted, fontSize: 12 }}>Recorded by {payment.recordedBy}</Text>}
    </View>
  );
}

function Pills<T extends string>({ options, value, onChange }: { options: { value: T; label: string }[]; value: T | null; onChange: (v: T) => void }) {
  return (
    <View style={[s.row, { flexWrap: 'wrap', gap: 8 }]}>
      {options.map((o) => {
        const on = value === o.value;
        return (
          <Pressable key={o.value} onPress={() => onChange(o.value)} accessibilityRole="radio" accessibilityState={{ selected: on }}
            style={{ paddingHorizontal: 14, paddingVertical: 7, borderRadius: 999, borderWidth: 1.5, borderColor: on ? C.primary : C.line, backgroundColor: on ? C.primary : '#fff' }}>
            <Text style={{ fontWeight: '700', color: on ? '#fff' : C.ink }}>{o.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

/** For the sender: record a child's payment, change it, or remove it. */
export function PaymentEditor({ formId, studentId, name, fee, payment, onSaved }: {
  formId: string; studentId: string; name: string; fee: number; payment: FormPayment | null; onSaved: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [method, setMethod] = useState<PaymentMethod | null>(payment?.method ?? null);
  const known = !payment || HANDED_IN.includes(payment.deliveredTo);
  const [place, setPlace] = useState<string | null>(payment ? (known ? payment.deliveredTo : 'other') : null);
  const [otherPlace, setOtherPlace] = useState(known ? '' : payment!.deliveredTo);
  const [amount, setAmount] = useState(((payment?.amountCents ?? fee) / 100).toFixed(2));
  const [day, setDay] = useState(payment?.receivedOn ?? schoolToday());
  const [note, setNote] = useState(payment?.note ?? '');
  const [busy, setBusy] = useState(false);

  if (!open) {
    return (
      <View style={{ gap: 8 }}>
        <Button kind={payment ? 'ghost' : 'primary'} label={payment ? 'Change payment' : `Record payment for ${name}`} onPress={() => setOpen(true)} />
        {payment && (
          <Button kind="ghost" label="Remove payment" onPress={() => ask('Remove this payment?', `${name} will show as not paid.`, 'Remove', async () => {
            try { await clearPayment(formId, studentId); onSaved(); } catch (e) { Alert.alert("Couldn't remove it", errorText(e)); }
          })} />
        )}
      </View>
    );
  }

  const save = async () => {
    const cents = parseDollars(amount);
    const where = place === 'other' ? otherPlace.trim() : place;
    const problem = !method ? 'Pick how it was paid.' : !where ? 'Say where it was handed in.' : !cents ? 'Enter the amount paid, like 25 or 25.50.' : null;
    if (problem) return Alert.alert('Almost there', problem);
    setBusy(true);
    try {
      await recordPayment(formId, studentId, { amountCents: cents!, method: method!, deliveredTo: where!, receivedOn: day, note: note.trim() });
      setOpen(false);
      onSaved();
    } catch (e) {
      Alert.alert("Couldn't save it", errorText(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={{ gap: 10, paddingTop: 4 }}>
      <Text style={{ fontWeight: '700', color: C.ink }}>How was it paid?</Text>
      <Pills options={PAYMENT_METHODS} value={method} onChange={(m) => { setMethod(m); if (m === 'online' && !place) setPlace('Online'); }} />
      <Text style={{ fontWeight: '700', color: C.ink }}>Where was it handed in?</Text>
      <Pills options={[...HANDED_IN.map((h) => ({ value: h, label: h })), { value: 'other', label: 'Somewhere else' }]} value={place} onChange={setPlace} />
      {place === 'other' && <Field label="Where" placeholder="e.g. Coach Davis" value={otherPlace} onChangeText={setOtherPlace} maxLength={80} />}
      <View style={s.row}>
        <Field label={`Amount (fee ${money(fee)})`} value={amount} onChangeText={setAmount} keyboardType="decimal-pad" style={{ flex: 1 }} />
        <DateField label="Received" value={day} max={schoolToday()} onChange={setDay} style={{ flex: 1 }} />
      </View>
      <Field label="Note (optional)" placeholder="e.g. Check #1042" value={note} onChangeText={setNote} maxLength={200} />
      <Button label={busy ? 'Saving…' : 'Save payment'} disabled={busy} onPress={save} />
      <Button kind="ghost" label="Cancel" disabled={busy} onPress={() => setOpen(false)} />
    </View>
  );
}
