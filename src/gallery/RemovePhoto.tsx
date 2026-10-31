/**
 * A teacher, staff member or admin removing someone else's photo: they pick why (and can add a note; "Another
 * reason" needs one), and the person who added it is told. Shown over the full-size photo.
 */
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, Text, View } from 'react-native';
import { C, Field, P, s, useBottomInset } from '../ui';
import { chip } from './AlbumForm';
import { REMOVAL_REASONS, type RemovalReason } from './removal';

export function RemovePhoto({ owner, onCancel, onRemove }: {
  owner: string | null; onCancel: () => void; onRemove: (why: { reason: RemovalReason; note: string }) => Promise<void>;
}) {
  const [reason, setReason] = useState<RemovalReason | null>(null);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const bottom = useBottomInset();
  const ready = !!reason && (reason !== 'other' || !!note.trim()) && !busy;
  const remove = async () => {
    if (!reason) return;
    setBusy(true);
    try { await onRemove({ reason, note }); } finally { setBusy(false); }
  };
  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      style={{ position: 'absolute', left: 0, right: 0, bottom: 0, maxHeight: '80%' }}>
      <ScrollView style={{ backgroundColor: '#fff', borderTopLeftRadius: 18, borderTopRightRadius: 18 }}
        contentContainerStyle={{ padding: 16, paddingBottom: 16 + bottom, gap: 10 }} keyboardShouldPersistTaps="handled">
        <Text style={{ fontSize: 18, fontWeight: '800', color: C.ink }}>Remove this photo?</Text>
        <P muted>{owner ? `${owner} added it. They'll get a notice with your name, the reason and your note.`
          : 'Whoever added it gets a notice with your name, the reason and your note, if their account is still open.'}</P>
        <View style={[s.row, { flexWrap: 'wrap', gap: 6 }]}>
          {REMOVAL_REASONS.map((r) => chip(r.label, reason === r.key, () => setReason(r.key), r.key))}
        </View>
        <Field label={reason === 'other' ? 'Note (needed)' : 'Note (optional)'} placeholder="A word about why, or where it belongs instead"
          value={note} onChangeText={setNote} multiline maxLength={300} />
        <Text accessibilityRole="button" onPress={ready ? remove : undefined}
          style={{ textAlign: 'center', paddingVertical: 12, borderRadius: 12, overflow: 'hidden', fontWeight: '800', color: '#fff',
            backgroundColor: ready ? C.danger : '#E5A9A3' }}>{busy ? 'Removing…' : 'Remove photo'}</Text>
        <Text style={{ color: C.muted, textAlign: 'center', paddingVertical: 4 }} accessibilityRole="button" onPress={onCancel}>Cancel</Text>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
