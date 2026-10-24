/**
 * Photos of the uniform for the Planner tab's Today section. Until the school sends them,
 * each is null and the app shows a placeholder. To add one, put the picture in
 * assets/uniforms/ and set it here, e.g. `boys: require('../../assets/uniforms/daily-boys.jpg')`.
 */
import type { ImageSourcePropType } from 'react-native';

export const UNIFORM_IMAGES: Record<'daily' | 'chapel', { boys: ImageSourcePropType | null; girls: ImageSourcePropType | null }> = {
  daily: { boys: null, girls: null },
  chapel: { boys: null, girls: null },
};
