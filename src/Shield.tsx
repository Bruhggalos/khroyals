/** The Kingdom Heights shield in a white circle with a blue ring, like the Home button in the middle of the tab bar. */
import { Image, View } from 'react-native';
import { C } from './ui';

export function Shield({ size }: { size: number }) {
  return (
    <View accessibilityRole="image" accessibilityLabel="Kingdom Heights" style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: '#fff',
      borderWidth: Math.max(3, size * 0.045), borderColor: C.primary, alignItems: 'center', justifyContent: 'center',
      shadowColor: '#000', shadowOpacity: 0.18, shadowRadius: 10, shadowOffset: { width: 0, height: 4 }, elevation: 6 }}>
      <Image source={require('../assets/icon.png')} style={{ width: size * 0.88, height: size * 0.88, borderRadius: size * 0.44 }} />
    </View>
  );
}
