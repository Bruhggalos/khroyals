/** storage: internal API implementation. Screens import the connect facade. */
import { sb } from './client';
import { run } from './client';

export function clearSignedUrls() { avatarSigned.clear(); photoUrls.clear(); }

export async function uploadJpeg(bucket: 'avatars' | 'marketplace', path: string, base64: string) {
  const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
  await run(sb().storage.from(bucket).upload(path, bytes.buffer, { contentType: 'image/jpeg' }));
}

export async function removeStoredPhoto(bucket: 'avatars' | 'marketplace', path?: string | null) {
  if (path && !/^https?:/.test(path)) await run(sb().storage.from(bucket).remove([path]));
}

/** Roll back an upload if attaching it to its record fails. Old files are removed only after attachment. */
export async function replacePhoto(path: string, base64: string, attach: () => Promise<unknown>, oldPath?: string | null) {
  await uploadJpeg('avatars', path, base64);
  try { await attach(); }
  catch (error) { await removeStoredPhoto('avatars', path).catch(() => {}); throw error; }
  // A cleanup failure must not report a successful profile change as a failed save.
  await removeStoredPhoto('avatars', oldPath).catch(() => {});
}

// Profile photos: the bucket is private, so storage paths become signed URLs.
export const avatarSigned = new Map<string, { url: string; until: number }>();

export const avatarUrl = (path: string | null | undefined) => (!path ? '' : /^https?:/.test(path) ? path : avatarSigned.get(path)?.url ?? '');

export async function signAvatars(paths: (string | null | undefined)[]) {
  const need = [...new Set(paths.filter((x): x is string =>
    !!x && !/^https?:/.test(x) && (avatarSigned.get(x)?.until ?? 0) < Date.now()))];
  if (!need.length) return;
  const { data } = await sb().storage.from('avatars').createSignedUrls(need, 24 * 3600);
  for (const d of data ?? []) if (d.path && d.signedUrl) avatarSigned.set(d.path, { url: d.signedUrl, until: Date.now() + 20 * 3600_000 });
}

export const photoUrls = new Map<string, { url: string; until: number }>();

/** Signed URLs for marketplace photos (the bucket is private), cached for most of their hour. */
export async function marketPhotoUrls(paths: string[]): Promise<Record<string, string>> {
  const need = [...new Set(paths)].filter((p) => (photoUrls.get(p)?.until ?? 0) < Date.now());
  if (need.length) {
    const { data } = await sb().storage.from('marketplace').createSignedUrls(need, 3600);
    for (const d of data ?? []) if (d.path && d.signedUrl) photoUrls.set(d.path, { url: d.signedUrl, until: Date.now() + 50 * 60_000 });
  }
  return Object.fromEntries(paths.flatMap((p) => (photoUrls.has(p) ? [[p, photoUrls.get(p)!.url]] : [])));
}
