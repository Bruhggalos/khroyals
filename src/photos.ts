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

/**
 * Pick photos for the gallery (several at once): each shrunk to at most 1600 px on its long side,
 * plus a 400 px thumbnail, as base64 JPEG. Empty when cancelled.
 */
export async function pickGalleryPhotos(limit = 30): Promise<{ full: string; thumb: string; width: number; height: number }[]> {
  const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], allowsMultipleSelection: true, selectionLimit: limit, quality: 1 });
  if (result.canceled) return [];
  const out: { full: string; thumb: string; width: number; height: number }[] = [];
  for (const asset of result.assets) {
    const fit = (max: number) => {
      const k = Math.min(1, max / Math.max(asset.width, asset.height));
      return { width: Math.round(asset.width * k), height: Math.round(asset.height * k) };
    };
    const size = fit(1600);
    const full = ImageManipulator.manipulate(asset.uri);
    if (size.width < asset.width) full.resize(size);
    const big = await (await full.renderAsync()).saveAsync({ compress: 0.8, format: SaveFormat.JPEG, base64: true });
    const small = ImageManipulator.manipulate(asset.uri).resize(fit(400));
    const thumb = await (await small.renderAsync()).saveAsync({ compress: 0.7, format: SaveFormat.JPEG, base64: true });
    if (big.base64 && thumb.base64) out.push({ full: big.base64, thumb: thumb.base64, width: size.width, height: size.height });
  }
  return out;
}
