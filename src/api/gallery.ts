/**
 * Photo gallery: internal API implementation. Screens import the connect facade.
 * Each photo is stored twice in the private 'gallery' bucket: "<uid>/<id>.jpg" (up to 1600 px)
 * and a thumbnail "<uid>/<id>_t.jpg" (400 px) for grids, so browsing stays light.
 */
import { live, rpc, run, sb } from './client';
import { current } from './session';

export type GalleryAlbum = {
  id: string; title: string; description: string; takenOn: string; createdBy: string | null;
  count: number; cover: string | null;
};
export type GalleryPhoto = { id: string; path: string; width: number; height: number; caption: string; createdBy: string | null; thumb: string; full: string };
export type NewGalleryPhoto = { full: string; thumb: string; width: number; height: number; caption?: string };

export const thumbPath = (path: string) => path.replace(/\.jpg$/, '_t.jpg');

const urls = new Map<string, { url: string; until: number }>();
async function signed(paths: string[]): Promise<Record<string, string>> {
  const need = [...new Set(paths)].filter((p) => (urls.get(p)?.until ?? 0) < Date.now());
  for (let i = 0; i < need.length; i += 200) {
    const { data } = await sb().storage.from('gallery').createSignedUrls(need.slice(i, i + 200), 3600);
    for (const d of data ?? []) if (d.path && d.signedUrl) urls.set(d.path, { url: d.signedUrl, until: Date.now() + 50 * 60_000 });
  }
  return Object.fromEntries(paths.flatMap((p) => (urls.has(p) ? [[p, urls.get(p)!.url]] : [])));
}

/** Albums, newest first, each with its photo count and a cover thumbnail. */
export async function listAlbums(limit = 100): Promise<GalleryAlbum[]> {
  if (!live || !current) return [];
  const albums = await run(sb().from('gallery_albums').select('*, gallery_photos(path, created_at)')
    .order('taken_on', { ascending: false }).order('created_at', { ascending: false }).limit(limit));
  const covers = albums.map((a) => [...a.gallery_photos].sort((x, y) => x.created_at.localeCompare(y.created_at))[0]?.path ?? null);
  const u = await signed(covers.filter((c): c is string => !!c).map(thumbPath));
  return albums.map((a, i) => ({
    id: a.id, title: a.title, description: a.description, takenOn: a.taken_on, createdBy: a.created_by,
    count: a.gallery_photos.length, cover: covers[i] ? u[thumbPath(covers[i]!)] ?? null : null,
  }));
}

export async function getAlbum(id: string): Promise<{ album: GalleryAlbum; photos: GalleryPhoto[] } | null> {
  if (!live) return null;
  const [a] = await run(sb().from('gallery_albums').select('*').eq('id', id));
  if (!a) return null;
  const rows = await run(sb().from('gallery_photos').select('*').eq('album_id', id).order('created_at'));
  const u = await signed(rows.flatMap((r) => [r.path, thumbPath(r.path)]));
  const photos = rows.map((r) => ({
    id: r.id, path: r.path, width: r.width, height: r.height, caption: r.caption, createdBy: r.created_by,
    thumb: u[thumbPath(r.path)] ?? u[r.path] ?? '', full: u[r.path] ?? '',
  }));
  return {
    album: { id: a.id, title: a.title, description: a.description, takenOn: a.taken_on, createdBy: a.created_by, count: photos.length, cover: photos[0]?.thumb ?? null },
    photos,
  };
}

/** Staff: start (or change) an album. `notify` (push.send holders) tells everyone it's there. */
export async function saveAlbum(a: { id?: string | null; title: string; description: string; takenOn: string; notify?: boolean }): Promise<string> {
  return rpc('gallery_album_save', { p_id: a.id ?? null, p_title: a.title, p_description: a.description, p_taken_on: a.takenOn, p_notify: !!a.notify });
}

const bytes = (base64: string) => Uint8Array.from(atob(base64), (c) => c.charCodeAt(0)).buffer;

/** Staff: upload photos (already resized, base64 JPEG) to your folder and add them to the album. */
export async function addGalleryPhotos(albumId: string, photos: NewGalleryPhoto[], onProgress?: (done: number) => void): Promise<number> {
  const me = current?.id;
  if (!me) throw new Error('Sign in first.');
  const added: { path: string; width: number; height: number; caption: string }[] = [];
  try {
    for (const [i, p] of photos.entries()) {
      const path = `${me}/${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}.jpg`;
      await run(sb().storage.from('gallery').upload(path, bytes(p.full), { contentType: 'image/jpeg' }));
      await run(sb().storage.from('gallery').upload(thumbPath(path), bytes(p.thumb), { contentType: 'image/jpeg' }));
      added.push({ path, width: p.width, height: p.height, caption: p.caption ?? '' });
      onProgress?.(i + 1);
    }
    return await rpc('gallery_add_photos', { p_album: albumId, p_photos: added });
  } catch (e) {
    // Don't leave files behind that no photo points to.
    await sb().storage.from('gallery').remove(added.flatMap((a) => [a.path, thumbPath(a.path)])).catch(() => {});
    throw e;
  }
}

export async function deleteGalleryPhoto(id: string) {
  const path = await rpc('gallery_photo_delete', { p_photo: id });
  if (path) await sb().storage.from('gallery').remove([path, thumbPath(path)]).catch(() => {});
}

export async function deleteAlbum(id: string) {
  const paths = (await rpc('gallery_album_delete', { p_album: id })) ?? [];
  if (paths.length) await sb().storage.from('gallery').remove(paths.flatMap((p) => [p, thumbPath(p)])).catch(() => {});
}
