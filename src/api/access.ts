import { accessSchema } from './schemas';
/** access: internal API implementation. Screens import the connect facade. */
import type { Access } from './types';
import { live, run, sb, rpc } from './client';
import { current } from './session';

export async function myAccess(): Promise<Access | null> {
  if (!live || !current) return null;
  return accessSchema.parse(await rpc('my_access'));
}
