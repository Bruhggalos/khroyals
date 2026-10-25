/** Pieces of the Forms screens: a form's header, answering its questions, and a signature line. */
import { Linking, Pressable, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { FormQuestion, FormSignature, SchoolForm } from '../api/connect';
import { dueLabel } from '../assignments/groups';
import { C, Card, Chip, Field, P, s } from '../ui';

export const GREEN = '#15803D';

/** "Due Fri, Oct 30", or "Closed". */
export const dueText = (f: Pick<SchoolForm, 'dueOn' | 'status'>) => (f.status === 'closed' ? 'Closed' : dueLabel(f.dueOn).replace(/^Overdue · /, 'Was due '));

/** Title, who sent it to whom, the due date, details and the attached link. */
export function FormHeader({ form }: { form: SchoolForm }) {
  const late = form.status === 'open' && dueText(form).startsWith('Was due');
  return (
    <Card style={{ gap: 8 }}>
      <View style={s.row}>
        <Ionicons name="document-text-outline" size={24} color={C.primary} />
        <Text style={{ flex: 1, fontSize: 19, fontWeight: '800', color: C.ink }}>{form.title}</Text>
      </View>
      <View style={[s.row, { flexWrap: 'wrap', gap: 6 }]}>
        <Chip label={dueText(form)} color={form.status === 'closed' ? C.muted : late ? C.danger : C.accent} />
        {!!form.sentTo && <Chip label={form.sentTo} />}
      </View>
      {!!form.author && <P muted>From {form.author}</P>}
      {!!form.details && <P>{form.details}</P>}
      {!!form.link && (
        <Pressable onPress={() => Linking.openURL(form.link!)} accessibilityRole="link"
          style={({ pressed }) => [s.row, { gap: 8, paddingVertical: 6 }, pressed && { opacity: 0.6 }]}>
          <Ionicons name="attach" size={18} color={C.primary} />
          <Text style={{ color: C.primary, fontWeight: '700' }}>Open the attached document ↗</Text>
        </Pressable>
      )}
    </Card>
  );
}

/** Pill buttons for one answer out of a few. */
function Pills({ options, value, onChange }: { options: { value: string; label: string }[]; value?: string; onChange: (v: string) => void }) {
  return (
    <View style={[s.row, { flexWrap: 'wrap', gap: 8 }]}>
      {options.map((o) => {
        const on = value === o.value;
        return (
          <Pressable key={o.value} onPress={() => onChange(o.value)} accessibilityRole="radio" accessibilityState={{ selected: on }}
            style={{ paddingHorizontal: 16, paddingVertical: 8, borderRadius: 999, borderWidth: 1.5,
              borderColor: on ? C.primary : C.line, backgroundColor: on ? C.primary : '#fff' }}>
            <Text style={{ fontWeight: '700', color: on ? '#fff' : C.ink }}>{o.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

/** One question to answer: Yes / No, a choice, or a short answer. */
export function QuestionInput({ q, value, onChange }: { q: FormQuestion; value?: string; onChange: (v: string) => void }) {
  const label = `${q.prompt}${q.required ? '' : ' (optional)'}`;
  if (q.kind === 'text') return <Field label={label} value={value ?? ''} onChangeText={onChange} maxLength={500} multiline />;
  return (
    <View style={{ gap: 6 }}>
      <Text style={{ fontWeight: '700', color: C.ink }}>{label}</Text>
      <Pills value={value} onChange={onChange}
        options={q.kind === 'yes_no' ? [{ value: 'yes', label: 'Yes' }, { value: 'no', label: 'No' }] : q.options.map((o) => ({ value: o, label: o }))} />
    </View>
  );
}

/** "Agreed · signed by Rosa Reyes, Oct 24", with the answers. */
export function SignatureLine({ r, questions }: { r: FormSignature; questions: FormQuestion[] }) {
  const when = new Date(r.signedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  return (
    <View style={{ gap: 4 }}>
      <View style={[s.row, { gap: 6 }]}>
        <Ionicons name={r.agreed ? 'checkmark-circle' : 'close-circle'} size={20} color={r.agreed ? GREEN : C.danger} />
        <Text style={{ flex: 1, fontWeight: '700', color: C.ink }}>
          {r.agreed ? 'Agreed' : 'Declined'} · signed “{r.signature}”{r.signedBy ? ` (${r.signedBy})` : ''}, {when}
        </Text>
      </View>
      {questions.filter((q) => r.answers[q.id]).map((q) => (
        <Text key={q.id} style={{ color: C.muted }}>{q.prompt} <Text style={{ color: C.ink, fontWeight: '600' }}>{q.kind === 'yes_no' ? (r.answers[q.id] === 'yes' ? 'Yes' : 'No') : r.answers[q.id]}</Text></Text>
      ))}
    </View>
  );
}

/** A thin bar: how many of the students have been signed for. */
export function Progress({ done, total }: { done: number; total: number }) {
  return (
    <View style={{ height: 8, borderRadius: 4, backgroundColor: C.line, overflow: 'hidden' }}>
      <View style={{ width: `${total ? Math.round((done / total) * 100) : 0}%`, height: 8, backgroundColor: GREEN }} />
    </View>
  );
}
