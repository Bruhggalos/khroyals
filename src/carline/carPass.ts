/**
 * Android Auto car line: after a parent signs in, the app saves a car pass for
 * the car screen (modules/car-line), and removes it again on sign-out. The pass
 * can only show today's car line for their children and check them in.
 */
import { CarLine } from '../../modules/car-line';
import { createCarPass, revokeCarPass, type Person } from '../api/connect';
import { supabaseKey, supabaseUrl } from '../api/supabase';

/** Give the car screen a pass if this parent doesn't have one on this phone yet. */
export async function syncCarPass(p: Person | null) {
  if (!CarLine || !p || p.pending || p.schoolRole === 'student' || !supabaseUrl || !supabaseKey) return;
  if (CarLine.token()) return;
  try {
    CarLine.setPass(supabaseUrl, supabaseKey, await createCarPass());
  } catch {
    // Not a parent with linked children (yet): nothing for the car screen to show.
  }
}

/** Sign-out: the car screen stops working until the next sign-in. */
export async function forgetCarPass() {
  const token = CarLine?.token();
  if (!token) return;
  CarLine!.clearPass();
  await revokeCarPass(token).catch(() => {});
}
