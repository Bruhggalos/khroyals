import { Pressable, Switch, TextInput, View } from 'react-native';
import type { Audience, GroupMode, GroupPermissions, GroupSettings, JoinPolicy, Visibility } from './types';
import { MODE_LABELS, PERMISSION_PRESETS } from './presets';
import { C, Card, H, P, s, Text } from '../ui';

const AUDIENCES: Audience[] = ['nobody', 'owners', 'moderators', 'members', 'subscribers'];
const PERM_LABELS: Record<keyof GroupPermissions, string> = {
  viewContent: 'Read posts', post: 'Create posts', comment: 'Reply / comment', react: 'React & vote',
  askQuestion: 'Ask questions', answerQuestion: 'Answer questions', attachFiles: 'Attach files',
  createPolls: 'Create polls', pin: 'Pin posts', seeMemberList: 'See member list',
  directMessageMembers: 'DM other members', mentionEveryone: '@everyone',
};

function Seg<T extends string>({ value, options, onChange, labels }: { value: T; options: T[]; onChange: (v: T) => void; labels?: Record<string, string> }) {
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
      {options.map((o) => (
        <Pressable key={o} onPress={() => onChange(o)}
          style={{ paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8, borderWidth: 1, borderColor: o === value ? C.primary : C.line, backgroundColor: o === value ? C.primary : '#fff' }}>
          <Text style={{ color: o === value ? '#fff' : C.ink, fontSize: 13 }}>{labels?.[o] ?? o}</Text>
        </Pressable>
      ))}
    </View>
  );
}

const Toggle = ({ label, hint, value, onChange }: { label: string; hint?: string; value: boolean; onChange: (v: boolean) => void }) => (
  <View style={[s.row, { justifyContent: 'space-between' }]}>
    <View style={{ flex: 1 }}><Text style={{ fontWeight: '600', color: C.ink }}>{label}</Text>{hint && <P muted>{hint}</P>}</View>
    <Switch value={value} onValueChange={onChange} trackColor={{ true: C.primary }} />
  </View>
);

export function SettingsForm({ value, onChange }: { value: GroupSettings; onChange: (v: GroupSettings) => void }) {
  const set = (patch: Partial<GroupSettings>) => onChange({ ...value, ...patch });
  const setPerm = (k: keyof GroupPermissions, a: Audience) => set({ permissions: { ...value.permissions, [k]: a } });

  return (
    <View style={{ gap: 12 }}>
      <Card style={{ borderColor: value.locked ? C.danger : C.line }}>
        <Toggle label="🔒 Lock group" hint="Instantly makes everything read-only for non-moderators." value={value.locked} onChange={(locked) => set({ locked })} />
        {value.locked && <TextInput style={s.input} placeholder="Reason shown to members" value={value.lockReason ?? ''} onChangeText={(lockReason) => set({ lockReason })} />}
      </Card>

      <Card>
        <H>Style</H>
        <Seg<GroupMode> value={value.mode} options={['chat', 'forum', 'broadcast', 'qa']} labels={Object.fromEntries(Object.entries(MODE_LABELS).map(([k, v]) => [k, v.title]))}
          onChange={(mode) => set({ mode, permissions: { ...PERMISSION_PRESETS[mode] } })} />
        <P muted>{MODE_LABELS[value.mode].blurb} Changing style resets permissions to that style's defaults.</P>
      </Card>

      <Card>
        <H>Access</H>
        <Text style={{ fontWeight: '600', color: C.ink }}>Visibility</Text>
        <Seg<Visibility> value={value.visibility} options={['public', 'school', 'private', 'hidden']} onChange={(visibility) => set({ visibility })} />
        <Text style={{ fontWeight: '600', color: C.ink }}>How people join</Text>
        <Seg<JoinPolicy> value={value.joinPolicy} options={['assigned', 'open', 'request', 'invite']} onChange={(joinPolicy) => set({ joinPolicy })} />
        <Toggle label="Members can leave" value={value.membersCanLeave} onChange={(membersCanLeave) => set({ membersCanLeave })} />
      </Card>

      <Card>
        <H>Who can…</H>
        <P muted>Each level includes everyone above it (owners ⊂ moderators ⊂ members ⊂ subscribers).</P>
        {(Object.keys(PERM_LABELS) as (keyof GroupPermissions)[]).map((k) => (
          <View key={k} style={{ gap: 4 }}>
            <Text style={{ fontWeight: '600', color: C.ink }}>{PERM_LABELS[k]}</Text>
            <Seg<Audience> value={value.permissions[k]} options={AUDIENCES} onChange={(a) => setPerm(k, a)} />
          </View>
        ))}
      </Card>

      <Card>
        <H>Moderation</H>
        <Toggle label="Approve posts before publishing" value={value.requirePostApproval} onChange={(requirePostApproval) => set({ requirePostApproval })} />
        <Toggle label="Approve questions before publishing" value={value.requireQuestionApproval} onChange={(requireQuestionApproval) => set({ requireQuestionApproval })} />
        <Toggle label="Allow anonymous questions" value={value.allowAnonymousQuestions} onChange={(allowAnonymousQuestions) => set({ allowAnonymousQuestions })} />
        <Toggle label="Keep deleted content for admin review" value={value.retainDeletedContent} onChange={(retainDeletedContent) => set({ retainDeletedContent })} />
        <Text style={{ fontWeight: '600', color: C.ink }}>Slow mode</Text>
        <Seg value={String(value.slowModeSeconds)} options={['0', '30', '60', '300']} labels={{ 0: 'Off', 30: '30s', 60: '1m', 300: '5m' }} onChange={(v) => set({ slowModeSeconds: Number(v) })} />
        <Text style={{ fontWeight: '600', color: C.ink }}>Close replies after</Text>
        <Seg value={String(value.autoCloseCommentsAfterDays)} options={['null', '7', '14', '30']} labels={{ null: 'Never', 7: '7 days', 14: '14 days', 30: '30 days' }}
          onChange={(v) => set({ autoCloseCommentsAfterDays: v === 'null' ? null : Number(v) })} />
        <Text style={{ fontWeight: '600', color: C.ink }}>Content filter</Text>
        <Seg value={value.contentFilter} options={['off', 'standard', 'strict']} onChange={(contentFilter) => set({ contentFilter })} />
        <Toggle label="Quiet hours for members (9 PM – 7 AM)" value={!!value.quietHours}
          onChange={(on) => set({ quietHours: on ? { start: '21:00', end: '07:00', appliesTo: ['member'] } : null })} />
      </Card>
    </View>
  );
}
