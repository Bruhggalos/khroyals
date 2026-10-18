/**
 * The car line on CarPlay (iPhone only). Native code (ios/) draws the screen with CarPlay's
 * templates; src/carplay/controller.ts decides what it shows and handles taps. null where
 * there's no CarPlay: Android, the web and Expo Go.
 */
import { requireOptionalNativeModule } from 'expo';

type Subscription = { remove(): void };

export type CarItem = {
  /** What a tap does ('' = information only). */
  id: string;
  text: string;
  detail?: string;
  /** An SF Symbol, like "car.fill". */
  symbol?: string;
  /** Ask before acting. */
  confirm?: { title: string; ok: string; cancel: string };
};
export type CarScreen = { sections: { header?: string; items: CarItem[] }[] };

type CarPlayModule = {
  isConnected(): boolean;
  setScreen(screen: CarScreen): Promise<void>;
  showAlert(message: string): Promise<void>;
  addListener(event: 'onConnect' | 'onDisconnect', listener: () => void): Subscription;
  addListener(event: 'onSelect', listener: (e: { id: string }) => void): Subscription;
};

export default requireOptionalNativeModule<CarPlayModule>('KHCarPlay');
