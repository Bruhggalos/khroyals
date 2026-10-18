/**
 * The car line on CarPlay. Loaded by index.js before anything renders: CarPlay can launch the
 * app without its phone screen, and then native code starts JavaScript with the empty "carplay"
 * component registered here, so this file is all that runs. Uses the same sign-in and car line
 * functions as the phone (src/api/connect.ts): checking in sends the phone's location, which
 * the server checks against the pickup spot and hours.
 */
import { AppRegistry } from 'react-native';
import CarPlay from '../../modules/carplay';
import {
  carlineAnnounce, carlineCancel, carlineConfig, carlineToday, live, myChildren, onAuthChange, pickupNumbers, session, subscribeCarline,
} from '../api/connect';
import { currentSpot } from '../carline/location';
import { hoursLabel } from '../carline/time';
import { carScreen, parseAction, type CarState } from './screen';

const REFRESH_MS = 30_000;  // in case a live update is missed

async function load(): Promise<CarState> {
  if (!live) return { kind: 'offline' };
  const me = await session();
  if (!me) return { kind: 'signed-out' };
  if (me.pending) return { kind: 'pending' };
  const [kids, pickups, config, numbers] = await Promise.all([
    myChildren(), carlineToday(), carlineConfig().catch(() => null), pickupNumbers().catch(() => ({} as Record<string, string>)),
  ]);
  return {
    kind: 'parent',
    kids: kids.map((k) => ({ id: k.id, firstName: k.firstName, lastName: k.lastName, number: numbers[k.id] ?? null })),
    pickups,
    hours: config ? hoursLabel(config.start, config.end) : undefined,
    line: config?.line.state,
  };
}

if (CarPlay) {
  const car = CarPlay;
  AppRegistry.registerComponent('carplay', () => () => null);

  const refresh = () => load()
    .then((state) => car.setScreen(carScreen(state)))
    .catch((e) => car.setScreen(carScreen({ kind: 'error', message: e?.message ?? String(e) })));

  const act = async (id: string) => {
    const action = parseAction(id);
    try {
      if (action && 'checkIn' in action) await carlineAnnounce(action.checkIn, await currentSpot());
      else if (action) await carlineCancel(action.cancel);
    } catch (e: any) {
      await car.showAlert(e?.message ?? "That didn't go through. Try again.");
    }
    await refresh();
  };

  let stop: (() => void) | null = null;
  const start = () => {
    stop?.();
    const offLive = subscribeCarline(refresh);
    const offAuth = onAuthChange(refresh);
    const timer = setInterval(refresh, REFRESH_MS);
    stop = () => { offLive(); offAuth(); clearInterval(timer); };
    refresh();
  };

  car.addListener('onConnect', start);
  car.addListener('onDisconnect', () => { stop?.(); stop = null; });
  car.addListener('onSelect', ({ id }) => { act(id); });
  if (car.isConnected()) start();  // CarPlay connected before this file loaded
}
