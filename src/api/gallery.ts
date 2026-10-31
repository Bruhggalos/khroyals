/**
 * Photo gallery: internal API implementation. Screens import the connect facade.
 * Each photo is stored twice in the private 'gallery' bucket: "<uid>/<id>.jpg" (up to 1600 px)
 * and a thumbnail "<uid>/<id>_t.jpg" (400 px) for grids, so browsing stays light.
 */
import type { RemovalReason } from '../gallery/removal';
import { schoolYearOf } from '../gallery/years';
import { live, rpc, run, sb } from './client';
import type { Database } from './database.types';
import { current } from './session';

export type GalleryCategory = { id: string; name: string; icon: string };
/** 'everyone': every approved account; 'staff': staff only (e.g. while it's being put together). */
export type AlbumVisibility = 'everyone' | 'staff';
/**
 * `grade`: a grade album (only that grade's students and parents, and staff, see it); `schoolYear`: the year its
 * school year ends in (2027 = 2026–27); `event`: the Volunteer or school calendar event it's for; `mine`: it's on
 * the signed-in person's account (a grade album they were given and haven't taken off).
 */
export type GalleryAlbum = {
  id: string; title: string; description: string; takenOn: string; createdBy: string | null;
  count: number; cover: string | null; categoryId: string | null; visibility: AlbumVisibility;
  grade: number | null; schoolYear: number; event: { kind: 'volunteer' | 'calendar'; id: string } | null; mine: boolean;
};
type AlbumRow = Database['public']['Tables']['gallery_albums']['Row'];
const albumFields = (a: AlbumRow, mine: Set<string>) => ({
  id: a.id, title: a.title, description: a.description, takenOn: a.taken_on, createdBy: a.created_by,
  categoryId: a.category_id, visibility: a.visibility as AlbumVisibility, grade: a.grade, schoolYear: a.school_year ?? schoolYearOf(a.taken_on),
  event: a.volunteer_event_id ? { kind: 'volunteer' as const, id: a.volunteer_event_id } : a.calendar_event_id ? { kind: 'calendar' as const, id: a.calendar_event_id } : null,
  mine: mine.has(a.id),
});

/** The grade albums on the signed-in person's account. */
async function myAlbumIds(): Promise<Set<string>> {
  if (!current) return new Set();
  const rows = await run(sb().from('gallery_album_members').select('album_id').eq('user_id', current.id).is('removed_at', null));
  return new Set(rows.map((r) => r.album_id));
}
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

export async function listCategories(): Promise<GalleryCategory[]> {
  if (!live || !current) return [];
  return (await run(sb().from('gallery_categories').select('id, name, icon').order('position').order('name')));
}

/** Words for a PostgREST filter, without the characters that separate its conditions. */
const words = (q: string) => q.replace(/[,()%*\\]/g, ' ').trim().split(/\s+/).filter(Boolean);

/**
 * Albums you can see, newest first, each with its photo count and a cover thumbnail. `category`
 * narrows to one category; `search` matches every word against the album's name, description and
 * category, or its photos' captions.
 */
export async function listAlbums(opts: { limit?: number; category?: string | null; search?: string } = {}): Promise<GalleryAlbum[]> {
  if (!live || !current) return [];
  let q = sb().from('gallery_albums').select('*, gallery_photos(path, created_at)')
    .order('taken_on', { ascending: false }).order('created_at', { ascending: false }).limit(opts.limit ?? 200);
  if (opts.category) q = q.eq('category_id', opts.category);
  const [found, mine] = await Promise.all([run(q), myAlbumIds()]);
  let albums = found;
  const terms = words(opts.search ?? '').map((w) => w.toLowerCase());
  if (terms.length) {
    const cats = new Map((await listCategories()).map((c) => [c.id, c.name.toLowerCase()]));
    const captions = new Map<string, string>();
    const ids = albums.map((a) => a.id);
    if (ids.length) {
      for (const r of await run(sb().from('gallery_photos').select('album_id, caption').in('album_id', ids).neq('caption', ''))) {
        captions.set(r.album_id, `${captions.get(r.album_id) ?? ''} ${r.caption.toLowerCase()}`);
      }
    }
    albums = albums.filter((a) => {
      const text = `${a.title} ${a.description} ${cats.get(a.category_id ?? '') ?? ''} ${captions.get(a.id) ?? ''}`.toLowerCase();
      return terms.every((t) => text.includes(t));
    });
  }
  const covers = albums.map((a) => [...a.gallery_photos].sort((x, y) => x.created_at.localeCompare(y.created_at))[0]?.path ?? null);
  const u = await signed(covers.filter((c): c is string => !!c).map(thumbPath));
  return albums.map((a, i) => ({
    ...albumFields(a, mine), count: a.gallery_photos.length, cover: covers[i] ? u[thumbPath(covers[i]!)] ?? null : null,
  }));
}

export async function getAlbum(id: string): Promise<{ album: GalleryAlbum; photos: GalleryPhoto[] } | null> {
  if (!live) return null;
  const [[a], mine] = await Promise.all([run(sb().from('gallery_albums').select('*').eq('id', id)), myAlbumIds()]);
  if (!a) return null;
  const rows = await run(sb().from('gallery_photos').select('*').eq('album_id', id).order('created_at'));
  const u = await signed(rows.flatMap((r) => [r.path, thumbPath(r.path)]));
  const photos = rows.map((r) => ({
    id: r.id, path: r.path, width: r.width, height: r.height, caption: r.caption, createdBy: r.created_by,
    thumb: u[thumbPath(r.path)] ?? u[r.path] ?? '', full: u[r.path] ?? '',
  }));
  return {
    album: { ...albumFields(a, mine), count: photos.length, cover: photos[0]?.thumb ?? null },
    photos,
  };
}

/** Staff: start (or change) an album. `notify` (push.send holders, everyone-albums) tells everyone it's there. */
export async function saveAlbum(a: {
  id?: string | null; title: string; description: string; takenOn: string; categoryId: string; visibility: AlbumVisibility; notify?: boolean;
}): Promise<string> {
  return rpc('gallery_album_save', {
    p_id: a.id ?? null, p_title: a.title, p_description: a.description, p_taken_on: a.takenOn, p_notify: !!a.notify,
    p_category: a.categoryId, p_visibility: a.visibility,
  });
}

/** gallery.manage: add (no id) or rename a category. */
export async function saveCategory(c: { id?: string | null; name: string; icon?: string }): Promise<string> {
  return rpc('gallery_category_save', { p_id: c.id ?? null, p_name: c.name, p_icon: c.icon || '📷' });
}

/** gallery.manage: remove a category, moving its albums to another. */
export async function deleteCategory(id: string, moveTo: string) { await rpc('gallery_category_delete', { p_id: id, p_move_to: moveTo }); }

const bytes = (base64: string) => Uint8Array.from(atob(base64), (c) => c.charCodeAt(0)).buffer;

/** Upload photos (already resized, base64 JPEG) to your folder and add them to an album you can see. */
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

/** Remove a photo: your own, or (teachers, staff, admins) anyone's with a reason; whoever added it is told. */
export async function deleteGalleryPhoto(id: string, why?: { reason: RemovalReason; note?: string }) {
  const path = await rpc('gallery_photo_delete', { p_photo: id, p_reason: why?.reason, p_note: why?.note?.trim() || undefined });
  if (path) await sb().storage.from('gallery').remove([path, thumbPath(path)]).catch(() => {});
}

export async function deleteAlbum(id: string) {
  const paths = (await rpc('gallery_album_delete', { p_album: id })) ?? [];
  if (paths.length) await sb().storage.from('gallery').remove(paths.flatMap((p) => [p, thumbPath(p)])).catch(() => {});
}

/** Take a grade album off your own account (the office can give it back). */
export async function leaveAlbum(id: string) { await rpc('gallery_album_leave', { p_album: id }); }

export type AlbumPerson = { id: string; name: string; role: string; removed: boolean; removedBySelf: boolean };

/** gallery.manage: the people on a grade album, and anyone taken off. */
export async function albumPeople(id: string): Promise<AlbumPerson[]> {
  return (await rpc('gallery_album_people', { p_album: id })).map((p) => ({
    id: p.user_id, name: p.name, role: p.school_role, removed: p.removed, removedBySelf: !!p.removed_by_self,
  }));
}

/** gallery.manage: put someone on a grade album (or back on it), or take them off. */
export async function setAlbumMember(albumId: string, userId: string, on: boolean) {
  await rpc('gallery_album_set_member', { p_album: albumId, p_user: userId, p_on: on });
}

/** Make the photo album for a Volunteer event or a school calendar event (or get the one it has). */
export async function makeEventAlbum(event: { kind: 'volunteer' | 'calendar'; id: string }): Promise<string> {
  return rpc('gallery_event_album', event.kind === 'volunteer' ? { p_volunteer_event: event.id } : { p_calendar_event: event.id });
}

/** The album of a Volunteer event or a school calendar event, if it has one you can see. */
export async function eventAlbumId(event: { kind: 'volunteer' | 'calendar'; id: string }): Promise<string | null> {
  if (!live || !current) return null;
  const rows = await run(sb().from('gallery_albums').select('id').eq(event.kind === 'volunteer' ? 'volunteer_event_id' : 'calendar_event_id', event.id));
  return rows[0]?.id ?? null;
}
