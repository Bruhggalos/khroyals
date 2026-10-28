/** Small pieces the Feedback screens share: a row of choice pills, and a feedback card. */
import { Text, View } from 'react-native';
import type { Feedback } from '../api/types';
import { C, Card, Chip, P } from '../ui';
import { areaLabel, kindInfo, priorityInfo, statusInfo } from './kinds';

export function Pills<K extends string>({ options, value, onChange }: { options: { key: K; label: string }[]; value: K | null; onChange: (k: K) => void }) {
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
      {options.map((o) => (
        <Text key={o.key} onPress={() => onChange(o.key)} accessibilityRole="button" accessibilityState={{ selected: o.key === value }}
          style={{ paddingHorizontal: 12, paddingVertical: 7, borderRadius: 999, overflow: 'hidden', borderWidth: 1, borderColor: C.line,
            backgroundColor: o.key === value ? C.primary : '#fff', color: o.key === value ? '#fff' : C.ink, fontWeight: '600' }}>
          {o.label}
        </Text>
      ))}
    </View>
  );
}

const ago = (iso: string) => new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

/** One report in a list; `who` adds the sender (triage). */
export function FeedbackCard({ f, who, onPress }: { f: Feedback; who?: boolean; onPress: () => void }) {
  const st = statusInfo(f.status);
  const pr = priorityInfo(f.priority);
  return (
    <Card onPress={onPress} style={{ gap: 6 }}>
      <View style={{ flexDirection: 'row', gap: 8 }}>
        <Text style={{ fontSize: 18 }}>{kindInfo(f.kind).emoji}</Text>
        <Text style={{ flex: 1, fontWeight: '700', color: C.ink }}>{f.title}</Text>
      </View>
      <P muted>{[areaLabel(f.area), who ? `${f.authorName}${f.authorRole ? ` (${f.authorRole})` : ''}` : null, ago(f.createdAt)].filter(Boolean).join(' · ')}</P>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
        <Chip label={st.label} color={st.color} />
        {who && pr && <Chip label={`${pr.label} priority`} color={pr.color} />}
        {who && f.workshopTitle && <Chip label={`🎓 ${f.workshopTitle}`} color="#0D9488" />}
        {!who && !!f.reply && <Chip label="Reply from the team" color="#0D9488" />}
      </View>
    </Card>
  );
}
