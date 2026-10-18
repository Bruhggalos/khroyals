/**
 * Every link that opens the app passes through here before a screen is
 * chosen — whether the app was closed or already running. Email sign-in links
 * arrive as khroyals://auth#access_token=…; finish signing in, then open Connect.
 */
import { completeSignInFromUrl } from '../src/api/connect';

export async function redirectSystemPath({ path }: { path: string; initial: boolean }) {
  try {
    if (/access_token|refresh_token|[?&]code=|error_description/.test(path)) {
      await completeSignInFromUrl(path);
      return '/connect';
    }
  } catch {
    return '/connect';  // e.g. an expired or already-used link; Connect shows sign-in again
  }
  return path;
}
