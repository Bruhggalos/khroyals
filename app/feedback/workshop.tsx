/** Triage: add or change a workshop (students learn by working on real reports), and see the reports in it. */
import { useEffect, useState } from 'react';
import { Alert, ScrollView, View } from 'react-native';
import { Stack, router, useLocalSearchParams } from 'expo-router';
import { deleteWorkshop, errorText, listFeedback, listWorkshops, saveWorkshop, type Feedback } from '../../src/api/connect';
import { DateField } from '../../src/forms/DateTimeField';
import { FeedbackCard } from '../../src/feedback/ui';
import { Button, Card, Field, H, Loading, P, ask, s } from '../../src/ui';

export default function EditWorkshop() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  const [loaded, setLoaded] = useState(!id);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [heldOn, setHeldOn] = useState('');
  const [items, setItems] = useState<Feedback[]>([]);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!id) return;
    Promise.all([listWorkshops(), listFeedback()]).then(([ws, list]) => {
      const w = ws.find((x) => x.id === id);
      if (w) { setTitle(w.title); setDescription(w.description); setHeldOn(w.heldOn ?? ''); }
      setItems(list.filter((f) => f.workshopId === id));
    }).catch((e) => Alert.alert('Could not load it', errorText(e))).finally(() => setLoaded(true));
  }, [id]);

  const header = <Stack.Screen options={{ title: id ? 'Workshop' : 'New workshop' }} />;
  if (!loaded) return <>{header}<Loading /></>;

  const save = () => {
    setBusy(true);
    saveWorkshop({ id: id ?? null, title: title.trim(), description: description.trim(), heldOn: heldOn || null })
      .then(() => router.back()).catch((e) => Alert.alert('Could not save it', errorText(e))).finally(() => setBusy(false));
  };
  const remove = () => ask('Delete this workshop?', 'Its reports stay, just not in a workshop.', 'Delete',
    () => deleteWorkshop(id!).then(() => router.back()).catch((e) => Alert.alert('Could not delete it', errorText(e))));

  return (
    <ScrollView style={s.screen} contentContainerStyle={s.pad} keyboardShouldPersistTaps="handled">
      {header}
      <Card>
        <Field label="Title" placeholder="e.g. Debugging the car line map" value={title} onChangeText={setTitle} maxLength={100} />
        <DateField label="Date (optional)" optional value={heldOn} onChange={setHeldOn} placeholder="Not set yet" />
        <Field label="What students will do (optional)" value={description} onChangeText={setDescription} multiline maxLength={2000}
          style={{ minHeight: 90, textAlignVertical: 'top' }} />
      </Card>
      <Button label={busy ? 'Saving…' : id ? 'Save' : 'Add workshop'} onPress={save} disabled={busy || !title.trim()} />
      {!!id && (<>
        <View style={{ gap: 8 }}>
          <H>Reports in this workshop</H>
          {items.length === 0 && <Card><P muted>None yet. Open a report under Triage and pick this workshop.</P></Card>}
          {items.map((f) => <FeedbackCard key={f.id} f={f} who onPress={() => router.push(`/feedback/${f.id}`)} />)}
        </View>
        <Button kind="ghost" label="Delete workshop" onPress={remove} />
      </>)}
    </ScrollView>
  );
}
