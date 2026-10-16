/**
 * Android Auto car line: the phone app gives the car screen a car pass so it
 * can show and check in the parent's children without the app's sign-in.
 * Android only (CarPlay needs Apple's approval first); a no-op elsewhere.
 */
import { requireOptionalNativeModule } from 'expo';

type CarLineNative = {
  setPass(url: string, key: string, token: string): void;
  clearPass(): void;
  /** The saved pass, or null. */
  token(): string | null;
};

export const CarLine = requireOptionalNativeModule<CarLineNative>('CarLine');
