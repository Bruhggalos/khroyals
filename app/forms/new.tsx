/**
 * Send a form. Teachers pick one of the classes they lead, coaches and directors one of
 * their activities' seasons, and people with Send forms some grades or the whole
 * school. A form has a title, details, an optional link (a PDF or web page), a due date
 * and up to 10 questions. It can't be changed once it's sent.
 */
import { useEffect, useState } from 'react';
import { Alert, Pressable, ScrollView, Switch, Text, View } from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import {
  canManageSport, errorText, isSchoolStaff, listSports, myAccess, mySections, sendForm,
  type FormQuestion, type Person, type Section, type SportSeason,
} from '../../src/api/connect';
import { schoolToday } from '../../src/calendar/past';
import { GRADES } from '../../src/comms/grades';
import { DateField } from '../../src/forms/DateTimeField';
import { addDays } from '../../src/info/today';
import { FormsGate } from '../../src/schoolForms/FormsGate';
import { SectionTitle } from '../../src/volunteer/parts';
import { Button, C, Card, Field, Loading, P, ask, s } from '../../src/ui';

export default function NewForm() {
  return (
    <FormsGate title="New form">
      {(me) => (isSchoolStaff(me) ? <Compose me={me} /> : <View style={[s.screen, s.pad]}><Card><P muted>Faculty and staff send forms.</P></Card></View>)}
    </FormsGate>
  );
}

type Audience = { kind: 'section'; id: string; label: string } | { kind: 'season'; id: string; label: string } | { kind: 'grades' } | { kind: 'school' };
type Draft = { key: number; kind: FormQuestion['kind']; prompt: string; required: boolean; options: string };
const KINDS: { kind: FormQuestion['kind']; label: string }[] = [{ kind: 'yes_no', label: 'Yes / No' }, { kind: 'text', label: 'Short answer' }, { kind: 'choice', label: 'Choice' }];

function Compose({ me }: { me: Person }) {
  const [choices, setChoices] = useState<{ sections: Section[]; seasons: { season: SportSeason; label: string }[]; office: boolean } | null>(null);
  const [audience, setAudience] = useState<Audience | null>(null);
  const [grades, setGrades] = useState<number[]>([]);
  const [title, setTitle] = useState('');
  const [details, setDetails] = useState('');
  const [link, setLink] = useState('');
  const [due, setDue] = useState(() => addDays(schoolToday(), 7));
  const [questions, setQuestions] = useState<Draft[]>([]);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    (async () => {
      const [sections, sports, access] = await Promise.all([mySections().catch(() => []), listSports().catch(() => ({ sports: [], seasons: [] })), myAccess().catch(() => null)]);
      const today = schoolToday();
      const seasons = sports.seasons
        .filter((se) => se.endsOn >= today)
        .flatMap((se) => {
          const sport = sports.sports.find((x) => x.id === se.sportId);
          return sport && canManageSport(sport, access, me) ? [{ season: se, label: `${sport.name} · ${se.name}` }] : [];
        });
      setChoices({ sections, seasons, office: !!access?.permissions.includes('forms.send') });
    })();
  }, [me]);
  if (!choices) return <Loading />;

  const nothing = !choices.sections.length && !choices.seasons.length && !choices.office;
  if (nothing) return (
    <View style={[s.screen, s.pad]}>
      <Card><P muted>You can send forms to the classes you teach and the activities you coach or direct. Classes are set up in Admin portal → Classes; the office sends forms to grades or the whole school.</P></Card>
    </View>
  );

  const edit = (key: number, change: Partial<Draft>) => setQuestions((qs) => qs.map((q) => (q.key === key ? { ...q, ...change } : q)));
  const to = !audience ? null : audience.kind === 'school' ? 'the whole school'
    : audience.kind === 'grades' ? (grades.length ? GRADES.filter((g) => grades.includes(g.value)).map((g) => g.label).join(', ') : null)
    : audience.label;

  const send = async () => {
    const opts = (q: Draft) => q.options.split(',').map((o) => o.trim()).filter(Boolean);
    const bad = questions.find((q) => !q.prompt.trim() || (q.kind === 'choice' && new Set(opts(q)).size < 2));
    const problem = !title.trim() ? 'Give the form a title.'
      : !to ? 'Choose who gets the form.'
      : due < schoolToday() ? "The due date can't be in the past."
      : link.trim() && !/^https:\/\//i.test(link.trim()) ? 'Links start with https://'
      : bad ? (bad.prompt.trim() ? `"${bad.prompt.trim()}" needs at least two choices, separated by commas.` : 'Every question needs a question.') : null;
    if (problem) return Alert.alert('Almost there', problem);
    ask('Send this form?', `The parents of ${to} are told right away. A form can't be changed once it's sent.`, 'Send', async () => {
      setBusy(true);
      try {
        const id = await sendForm({
          title: title.trim(), details: details.trim(), link: link.trim(), dueOn: due, audience: audience!.kind,
          sectionId: audience!.kind === 'section' ? audience!.id : null, seasonId: audience!.kind === 'season' ? audience!.id : null,
          grades: audience!.kind === 'grades' ? grades : null,
          questions: questions.map((q) => ({ kind: q.kind, prompt: q.prompt.trim(), required: q.required, options: q.kind === 'choice' ? opts(q) : [] })),
        });
        router.replace(`/forms/${id}`);
      } catch (e) {
        Alert.alert("Couldn't send it", errorText(e));
      } finally {
        setBusy(false);
      }
    });
  };

  const pick = (a: Audience, label: string, key: string) => {
    const on = !!audience && audience.kind === a.kind && ('id' in a ? 'id' in audience && audience.id === a.id : true);
    return (
      <Pressable key={key} onPress={() => setAudience(a)} accessibilityRole="radio" accessibilityState={{ selected: on }}
        style={({ pressed }) => [s.row, { gap: 10, paddingVertical: 10, borderTopWidth: 1, borderTopColor: C.line }, pressed && { opacity: 0.7 }]}>
        <Ionicons name={on ? 'radio-button-on' : 'radio-button-off'} size={22} color={on ? C.primary : C.muted} />
        <Text style={{ flex: 1, fontWeight: '600', color: C.ink }}>{label}</Text>
      </Pressable>
    );
  };

  return (
    <ScrollView style={s.screen} contentContainerStyle={s.pad} keyboardShouldPersistTaps="handled">
      <Card>
        <Field label="Title" placeholder="e.g. Zoo field trip permission" value={title} onChangeText={setTitle} maxLength={100} />
        <Field label="Details" style={{ minHeight: 110, textAlignVertical: 'top' }} multiline maxLength={4000} value={details} onChangeText={setDetails}
          placeholder={'What it\'s for, when and where, what to bring…'} />
        <Field label="Link to a document (optional)" placeholder="https://… a PDF or web page" value={link} onChangeText={setLink}
          autoCapitalize="none" keyboardType="url" maxLength={500} hint="Parents open it from the form, e.g. the venue's waiver." />
        <DateField label="Due" value={due} min={schoolToday()} onChange={setDue} />
      </Card>

      <Card style={{ gap: 0 }}>
        <SectionTitle icon="people-outline" title="Send to" />
        <View style={{ height: 8 }} />
        {choices.sections.map((sec) => pick({ kind: 'section', id: sec.id, label: sec.name }, `${sec.name} · ${sec.students} student${sec.students === 1 ? '' : 's'}`, `sec-${sec.id}`))}
        {choices.seasons.map(({ season, label }) => pick({ kind: 'season', id: season.id, label }, `${label} (signed-up students)`, `season-${season.id}`))}
        {choices.office && pick({ kind: 'grades' }, 'Some grades', 'grades')}
        {choices.office && audience?.kind === 'grades' && (
          <View style={[s.row, { flexWrap: 'wrap', gap: 8, paddingVertical: 8 }]}>
            {GRADES.map((g) => {
              const on = grades.includes(g.value);
              return (
                <Pressable key={g.value} onPress={() => setGrades((gs) => (on ? gs.filter((x) => x !== g.value) : [...gs, g.value]))}
                  accessibilityRole="checkbox" accessibilityState={{ checked: on }}
                  style={{ paddingHorizontal: 12, paddingVertical: 6, borderRadius: 999, borderWidth: 1.5, borderColor: on ? C.primary : C.line, backgroundColor: on ? C.primary : '#fff' }}>
                  <Text style={{ fontWeight: '700', color: on ? '#fff' : C.ink }}>{g.short}</Text>
                </Pressable>
              );
            })}
          </View>
        )}
        {choices.office && pick({ kind: 'school' }, 'The whole school', 'school')}
      </Card>

      <Card style={{ gap: 12 }}>
        <SectionTitle icon="help-circle-outline" title="Questions (optional)" />
        <P muted>Parents always agree or decline and type their name. Add questions for anything else you need to know.</P>
        {questions.map((q, i) => (
          <View key={q.key} style={{ gap: 8, paddingTop: 10, borderTopWidth: 1, borderTopColor: C.line }}>
            <View style={s.row}>
              <Text style={{ flex: 1, fontWeight: '800', color: C.ink }}>Question {i + 1}</Text>
              <Pressable onPress={() => setQuestions((qs) => qs.filter((x) => x.key !== q.key))} hitSlop={8} accessibilityRole="button" accessibilityLabel={`Remove question ${i + 1}`}>
                <Ionicons name="trash-outline" size={18} color={C.muted} />
              </Pressable>
            </View>
            <View style={{ flexDirection: 'row', padding: 4, borderRadius: 999, backgroundColor: '#fff', borderWidth: 1, borderColor: C.line }}>
              {KINDS.map((k) => (
                <Pressable key={k.kind} onPress={() => edit(q.key, { kind: k.kind })} accessibilityRole="radio" accessibilityState={{ selected: q.kind === k.kind }}
                  style={{ flex: 1, alignItems: 'center', paddingVertical: 7, borderRadius: 999, backgroundColor: q.kind === k.kind ? C.primary : 'transparent' }}>
                  <Text style={{ fontWeight: '700', fontSize: 13, color: q.kind === k.kind ? '#fff' : C.muted }}>{k.label}</Text>
                </Pressable>
              ))}
            </View>
            <Field label="Question" value={q.prompt} onChangeText={(v) => edit(q.key, { prompt: v })} maxLength={200}
              placeholder={q.kind === 'yes_no' ? 'e.g. May your child ride the bus?' : q.kind === 'choice' ? 'e.g. Can you chaperone?' : 'e.g. Any allergies or medicines?'} />
            {q.kind === 'choice' && (
              <Field label="Choices, separated by commas" value={q.options} onChangeText={(v) => edit(q.key, { options: v })} placeholder="e.g. Yes, No, Maybe" />
            )}
            <View style={s.row}>
              <Text style={{ flex: 1, color: C.ink }}>Required to agree</Text>
              <Switch value={q.required} onValueChange={(v) => edit(q.key, { required: v })} trackColor={{ true: C.primary }} accessibilityLabel={`Question ${i + 1} is required`} />
            </View>
          </View>
        ))}
        {questions.length < 10 && (
          <Button kind="ghost" label="+ Add a question"
            onPress={() => setQuestions((qs) => [...qs, { key: Date.now(), kind: 'yes_no', prompt: '', required: true, options: '' }])} />
        )}
      </Card>

      <Button label={busy ? 'Sending…' : to ? `Send to ${to}` : 'Send form'} disabled={busy} onPress={send} />
    </ScrollView>
  );
}
