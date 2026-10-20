/** Pick a photo (camera or library), cropped square and shrunk to 512 px, as base64 JPEG. Null when cancelled. */
import { Alert } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';

export async function pickSquarePhoto(camera: boolean): Promise<string | null> {
  if (camera && !(await ImagePicker.requestCameraPermissionsAsync()).granted) {
    Alert.alert('Camera is off', 'Allow camera access for KH Royals in Settings to take a photo.');
    return null;
  }
  const options: ImagePicker.ImagePickerOptions = { mediaTypes: ['images'], allowsEditing: true, aspect: [1, 1], quality: 1 };
  const result = camera ? await ImagePicker.launchCameraAsync(options) : await ImagePicker.launchImageLibraryAsync(options);
  const asset = result.canceled ? null : result.assets[0];
  if (!asset) return null;
  const ctx = ImageManipulator.manipulate(asset.uri);
  const side = Math.min(asset.width, asset.height);
  if (asset.width !== asset.height) ctx.crop({ originX: (asset.width - side) / 2, originY: (asset.height - side) / 2, width: side, height: side });
  if (side > 512) ctx.resize({ width: 512, height: 512 });
  const out = await (await ctx.renderAsync()).saveAsync({ compress: 0.75, format: SaveFormat.JPEG, base64: true });
  return out.base64 ?? null;
}
