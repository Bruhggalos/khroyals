/**
 * Pictures of the uniform for the Planner's "What to wear" card: the approved pieces from the
 * school's French Toast store (frenchtoast.com, school code QS61ALG), put together as one outfit
 * per square (assets/uniforms/). Matches the 2026–2027 Uniform Guide: daily polo with pants or a
 * skort; Chapel oxford or Peter Pan blouse with a tie or crossbow, sweater vest, pants or jumper.
 */
import type { ImageSourcePropType } from 'react-native';

export const UNIFORM_IMAGES: Record<'daily' | 'chapel', { boys: ImageSourcePropType | null; girls: ImageSourcePropType | null }> = {
  daily: { boys: require('../../assets/uniforms/daily-boys.jpg'), girls: require('../../assets/uniforms/daily-girls.jpg') },
  chapel: { boys: require('../../assets/uniforms/chapel-boys.jpg'), girls: require('../../assets/uniforms/chapel-girls.jpg') },
};

/** The school's French Toast store, where K4–12 uniforms are bought. */
export const UNIFORM_STORE = 'https://www.frenchtoast.com/schoolbox/schools/kingdom-heights-prep-QS61ALG';
