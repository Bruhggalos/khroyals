/** Activities this phone opened recently (newest first), for "Your activities" on the Activities page. */
import AsyncStorage from '@react-native-async-storage/async-storage';

const KEY = 'khroyals.activities.recent';
const MAX = 8;

export async function recentActivities(): Promise<string[]> {
  try { return JSON.parse((await AsyncStorage.getItem(KEY)) ?? '[]'); } catch { return []; }
}
export async function noteActivityViewed(id: string) {
  try {
    const list = [id, ...(await recentActivities()).filter((x) => x !== id)].slice(0, MAX);
    await AsyncStorage.setItem(KEY, JSON.stringify(list));
  } catch { /* storage unavailable: it just won't be remembered */ }
}
