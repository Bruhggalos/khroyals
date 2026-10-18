/**
 * Swipe a row sideways to delete it (iPhone, Android and web with a mouse).
 * Built on React Native's own PanResponder, so it needs no extra native module.
 */
import { useRef } from 'react';
import { Animated, PanResponder, Text, View } from 'react-native';
import { C } from '../ui';

const THRESHOLD = 110;

export function SwipeToDelete({ children, onDelete, label = 'Delete' }: {
  children: React.ReactNode; onDelete: () => void; label?: string;
}) {
  const x = useRef(new Animated.Value(0)).current;
  const pan = useRef(PanResponder.create({
    // Only claim clearly sideways drags, so the list still scrolls.
    onMoveShouldSetPanResponder: (_, g) => Math.abs(g.dx) > 12 && Math.abs(g.dx) > Math.abs(g.dy) * 1.5,
    onPanResponderMove: Animated.event([null, { dx: x }], { useNativeDriver: false }),
    onPanResponderRelease: (_, g) => {
      if (Math.abs(g.dx) > THRESHOLD || Math.abs(g.vx) > 1.2) {
        Animated.timing(x, { toValue: g.dx > 0 ? 600 : -600, duration: 180, useNativeDriver: false }).start(onDelete);
      } else {
        Animated.spring(x, { toValue: 0, useNativeDriver: false }).start();
      }
    },
    onPanResponderTerminate: () => Animated.spring(x, { toValue: 0, useNativeDriver: false }).start(),
  })).current;

  return (
    <View>
      <View style={{ position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, borderRadius: 14, backgroundColor: C.danger,
        flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20 }}>
        <Text style={{ color: '#fff', fontWeight: '700' }}>{label}</Text>
        <Text style={{ color: '#fff', fontWeight: '700' }}>{label}</Text>
      </View>
      <Animated.View style={{ transform: [{ translateX: x }] }} {...pan.panHandlers}>{children}</Animated.View>
    </View>
  );
}
