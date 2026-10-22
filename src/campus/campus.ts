/**
 * The Campus Map's content. Until the school provides its map, the app shows the places
 * below with directions. To add the map: put the picture in assets/ and set
 * `CAMPUS_IMAGE = require('../../assets/campus-map.png')`, then give each place a `pin`
 * (where it is on the picture, 0–1 across and down) to number it on the map.
 */
import type { ImageSourcePropType } from 'react-native';
import type { Ionicons } from '@expo/vector-icons';
import site from '../../content/site/site.json';

export type Place = {
  id: string; name: string; detail: string; icon: React.ComponentProps<typeof Ionicons>['name'];
  /** Directions go here (an address, or "lat,lng"). */
  directionsTo?: string;
  phone?: string;
  pin?: { x: number; y: number };
};

export const CAMPUS_IMAGE: ImageSourcePropType | null = null;

const { address, phone, email, ministryOf } = site.school;
export const CAMPUS_ADDRESS = `${address.line1}, ${address.city}, ${address.state} ${address.zip}`;

export const PLACES: Place[] = [
  { id: 'campus', name: 'Kingdom Heights campus', icon: 'business-outline', directionsTo: CAMPUS_ADDRESS,
    detail: `${CAMPUS_ADDRESS}. The historic S.R. Butler High School campus, shared with ${ministryOf.name}.` },
  { id: 'office', name: 'Front office', icon: 'call-outline', phone, detail: `${phone} · ${email}` },
];
