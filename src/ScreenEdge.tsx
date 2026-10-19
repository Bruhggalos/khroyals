/**
 * The thin red line around every light screen: from under the blue header on the left,
 * down the side, along the bottom of the phone and back up to the header on the right.
 * Navigators add it with `edgeLayout`; on the tab screens the tab bar draws the bottom
 * part (`TabBarEdge`), so the line still runs around the very edge of the phone.
 */
import type { ReactElement, ReactNode } from 'react';
import { Platform, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { C } from './ui';

const WIDTH = 2;

/** About the phone screen's own corner radius, so the line follows the glass instead of being cut off at the corners. */
function useCornerRadius() {
  const { bottom } = useSafeAreaInsets();
  if (Platform.OS === 'web') return 0;
  if (Platform.OS === 'ios') return bottom === 0 ? 0 : Platform.isPad ? 18 : 62; // Home-button iPhones are square
  return 32; // Android phones vary; a curve a little rounder than the glass still shows
}

/** The line itself, laid over the screen (taps go through). `bottom` closes it along the bottom of the phone. */
export function ScreenEdge({ bottom }: { bottom: boolean }) {
  const radius = useCornerRadius();
  return (
    <View pointerEvents="none" style={[StyleSheet.absoluteFill, {
      borderColor: C.accent, borderLeftWidth: WIDTH, borderRightWidth: WIDTH,
      ...(bottom && { borderBottomWidth: WIDTH, borderBottomLeftRadius: radius, borderBottomRightRadius: radius }),
    }]} />
  );
}

/** A navigator's `screenLayout`: every screen gets the line except the ones named in `skip` (dark screens). */
export function edgeLayout({ bottom, skip = [] }: { bottom: boolean; skip?: string[] }) {
  return ({ route, children }: { route: { name: string }; children: ReactNode }): ReactElement =>
    skip.includes(route.name) ? <>{children}</> : (
      <View style={{ flex: 1 }}>
        {children}
        <ScreenEdge bottom={bottom} />
      </View>
    );
}

/** The tab bar's background (`tabBarBackground`): white, with the line down its sides and along the bottom of the phone. */
export const TabBarEdge = () => (
  <View style={[StyleSheet.absoluteFill, { backgroundColor: '#fff' }]}>
    <ScreenEdge bottom />
  </View>
);
