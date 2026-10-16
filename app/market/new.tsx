/** Sell an item: photo, title, price, quantity, condition and a description. */
import { useState } from 'react';
import { Alert, Image, Platform, ScrollView, Text, TextInput, View } from 'react-native';
import { router } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import { Ionicons } from '@expo/vector-icons';
import { marketPost, uploadMarketPhoto, type Condition } from '../../src/api/connect';
import { MarketGate } from '../../src/market/MarketGate';
import { CONDITIONS, parseMoney } from '../../src/market/format';
import { Button, C, Card, P, s } from '../../src/ui';

const MAX_WIDTH = 1200;

export default function NewListing() {
  return <MarketGate title="Sell an item">{() => <Form />}</MarketGate>;
}

function Form() {
  const [photo, setPhoto] = useState<{ uri: string; base64: string } | null>(null);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [price, setPrice] = useState('');
  const [quantity, setQuantity] = useState('1');
  const [condition, setCondition] = useState<Condition | null>(null);
  const [busy, setBusy] = useState(false);

  const pick = async (camera: boolean) => {
    if (camera && !(await ImagePicker.requestCameraPermissionsAsync()).granted) {
      return Alert.alert('Camera is off', 'Allow camera access for KH Royals in Settings to take a photo.');
    }
    const options: ImagePicker.ImagePickerOptions = { mediaTypes: ['images'], allowsEditing: true, aspect: [4, 3], quality: 1 };
    const result = camera ? await ImagePicker.launchCameraAsync(options) : await ImagePicker.launchImageLibraryAsync(options);
    const asset = result.canceled ? null : result.assets[0];
    if (!asset) return;
    // Shrink before uploading: phone photos are several megabytes.
    const ctx = ImageManipulator.manipulate(asset.uri);
    if (asset.width > MAX_WIDTH) ctx.resize({ width: MAX_WIDTH });
    const out = await (await ctx.renderAsync()).saveAsync({ compress: 0.7, format: SaveFormat.JPEG, base64: true });
    if (out.base64) setPhoto({ uri: out.uri, base64: out.base64 });
  };

  const post = async () => {
    const cents = parseMoney(price);
    const qty = Number.parseInt(quantity, 10);
    const missing = !title.trim() ? 'Add a title.' : cents == null ? 'Enter a price, like 15 or 12.50.'
      : !(qty >= 1) ? 'Quantity must be at least 1.' : !condition ? 'Choose the condition.' : null;
    if (missing) return Alert.alert('Almost there', missing);
    setBusy(true);
    try {
      const photoPath = photo ? await uploadMarketPhoto(photo.base64) : null;
      const listing = await marketPost({ title: title.trim(), description: description.trim(), priceCents: cents!, quantity: qty, condition: condition!, photoPath });
      router.replace(`/market/${listing.id}`);
    } catch (e: any) {
      Alert.alert("Couldn't post", e.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <ScrollView style={s.screen} contentContainerStyle={s.pad} keyboardShouldPersistTaps="handled">
      <P muted>Uniforms and school-related items only.</P>

      <Card style={{ alignItems: 'center', gap: 10 }}>
        {photo
          ? <Image source={{ uri: photo.uri }} style={{ width: '100%', aspectRatio: 4 / 3, borderRadius: 10 }} />
          : <Ionicons name="camera-outline" size={40} color={C.muted} />}
        <View style={[s.row, { gap: 16 }]}>
          {Platform.OS !== 'web' && <Text style={{ color: C.primary, fontWeight: '700' }} onPress={() => pick(true)}>Take photo</Text>}
          <Text style={{ color: C.primary, fontWeight: '700' }} onPress={() => pick(false)}>{photo ? 'Choose another' : 'Choose photo'}</Text>
          {photo && <Text style={{ color: C.danger, fontWeight: '600' }} onPress={() => setPhoto(null)}>Remove</Text>}
        </View>
      </Card>

      <TextInput style={s.input} placeholder="What are you selling? (e.g. Navy polo, size M)" value={title} onChangeText={setTitle} maxLength={80} />
      <View style={s.row}>
        <TextInput style={[s.input, { flex: 1 }]} placeholder="Price ($)" keyboardType="decimal-pad" value={price} onChangeText={setPrice} />
        <TextInput style={[s.input, { width: 110 }]} placeholder="Quantity" keyboardType="number-pad" value={quantity} onChangeText={setQuantity} />
      </View>
      <Text style={{ fontSize: 12, fontWeight: '700', color: C.muted }}>CONDITION</Text>
      <View style={[s.row, { flexWrap: 'wrap', gap: 6 }]}>
        {CONDITIONS.map((c) => (
          <Text key={c.key} onPress={() => setCondition(c.key)}
            style={{ paddingHorizontal: 12, paddingVertical: 7, borderRadius: 999, overflow: 'hidden', borderWidth: 1, borderColor: C.line,
              backgroundColor: condition === c.key ? C.primary : '#fff', color: condition === c.key ? '#fff' : C.ink, fontWeight: '600' }}>
            {c.label}
          </Text>
        ))}
      </View>
      <TextInput style={[s.input, { minHeight: 90, textAlignVertical: 'top' }]} multiline maxLength={1000}
        placeholder="Details: size, color, wear, what's included…" value={description} onChangeText={setDescription} />
      <P muted>Quantity describes the bundle. One buyer gets the whole post.</P>
      <Button label={busy ? 'Posting…' : 'Post item'} disabled={busy} onPress={post} />
    </ScrollView>
  );
}
