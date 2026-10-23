import { replacePhoto, removeStoredPhoto } from './storage';
/** profile: internal API implementation. Screens import the connect facade. */
import { jsonObject, enumValue } from './validation';
import { live, run, sb, rpc } from './client';
import { current, session } from './session';
import type { GroupPref, MySettings } from './types';
import { DEFAULT_SETTINGS, toSettings } from './mappers';

export async function updateMyName(first: string, last: string) {
  await rpc('update_my_profile', { p_first: first, p_last: last });
  await session({ refresh: true });
}

/** Upload a JPEG (base64) as your profile photo, replacing the old one. */
export async function uploadMyAvatar(base64: string) {
  if (!current) throw new Error('Sign in to change your photo.');
  const old = (await run(sb().from('profiles').select('avatar_url').eq('id', current.id).single())).avatar_url;
  const path = `${current!.id}/${Date.now()}.jpg`;
  await replacePhoto(path, base64, () => rpc('set_my_avatar', { p_path: path }), old);
  await session({ refresh: true });
}

export async function removeMyAvatar() {
  const old = (await run(sb().from('profiles').select('avatar_url').eq('id', current!.id).single())).avatar_url;
  await rpc('set_my_avatar', { p_path: null });
  await removeStoredPhoto('avatars', old).catch(() => {});
  await session({ refresh: true });
}

/** Staff with people.roles: take down someone's photo. */
export async function adminClearAvatar(userId: string) {
  await rpc('admin_clear_avatar', { p_user: userId });
  await session({ refresh: true });
}

export async function mySettings(): Promise<MySettings> {
  if (!live) return DEFAULT_SETTINGS;
  return toSettings(await run(sb().from('user_settings').select('*').maybeSingle()));
}

export async function updateMySettings(st: MySettings): Promise<MySettings> {
  return toSettings(await rpc('update_my_settings', {
    p_push_groups: st.pushGroups, p_push_marketplace: st.pushMarketplace, p_push_volunteer: st.pushVolunteer,
    p_quiet_start: st.quietStart, p_quiet_end: st.quietEnd, p_push_school: st.pushSchool, p_push_replies: st.pushReplies,
  }));
}

/** Your notification level in each of your groups (the group's default when you haven't chosen). */
export async function myGroupPrefs(): Promise<GroupPref[]> {
  if (!live || !current) return [];
  const rows = await run(sb().from('memberships').select('group_id, notification, groups(name, icon, settings)').eq('user_id', current.id));
  return rows.flatMap((r) => r.groups ? [{
    groupId: r.group_id, name: r.groups.name, icon: r.groups.icon,
    pref: enumValue(r.notification ?? jsonObject(r.groups.settings).notificationDefault ?? 'all', ['all', 'mentions', 'digest', 'none']) === 'digest' ? 'mentions' as const : enumValue(r.notification ?? jsonObject(r.groups.settings).notificationDefault ?? 'all', ['all', 'mentions', 'none']),
  }] : []).sort((a, b) => a.name.localeCompare(b.name));
}
