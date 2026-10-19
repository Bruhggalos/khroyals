/**
 * Vehicle types and colors for the car line. The database checks the same lists
 * (supabase/migrations/20261019000021_carline_vehicles.sql); change them together.
 */
import type { ComponentProps } from 'react';
import type { MaterialCommunityIcons } from '@expo/vector-icons';

export type VehicleKind = 'car' | 'truck' | 'suv' | 'van' | 'hatchback' | 'motorcycle' | 'bicycle' | 'golf_cart';
export type VehicleColor = 'white' | 'silver' | 'black' | 'gray' | 'red' | 'blue' | 'green' | 'brown' | 'beige' | 'gold' | 'orange' | 'yellow';

export const VEHICLE_KINDS: { key: VehicleKind; label: string; icon: ComponentProps<typeof MaterialCommunityIcons>['name'] }[] = [
  { key: 'car', label: 'Car', icon: 'car-side' },
  { key: 'truck', label: 'Truck', icon: 'car-pickup' },
  { key: 'suv', label: 'SUV', icon: 'car-estate' },
  { key: 'van', label: 'Van', icon: 'van-passenger' },
  { key: 'hatchback', label: 'Hatchback', icon: 'car-hatchback' },
  { key: 'motorcycle', label: 'Motorcycle', icon: 'motorbike' },
  { key: 'bicycle', label: 'Bicycle', icon: 'bicycle' },
  { key: 'golf_cart', label: 'Golf cart', icon: 'golf-cart' },
];

/** `hex` paints the swatch; `ring` outlines the light ones so they show on a white card. */
export const VEHICLE_COLORS: { key: VehicleColor; label: string; hex: string; ring?: boolean }[] = [
  { key: 'white', label: 'White', hex: '#F7F7F7', ring: true },
  { key: 'silver', label: 'Silver', hex: '#A3A9B1' },
  { key: 'black', label: 'Black', hex: '#111111' },
  { key: 'gray', label: 'Gray', hex: '#5F6670' },
  { key: 'red', label: 'Red', hex: '#C8102E' },
  { key: 'blue', label: 'Blue', hex: '#1F4E9A' },
  { key: 'green', label: 'Green', hex: '#1E7A4C' },
  { key: 'brown', label: 'Brown', hex: '#6B4226' },
  { key: 'beige', label: 'Beige', hex: '#E3D3B0', ring: true },
  { key: 'gold', label: 'Gold', hex: '#C9A227' },
  { key: 'orange', label: 'Orange', hex: '#E8702A' },
  { key: 'yellow', label: 'Yellow', hex: '#F4C430', ring: true },
];

/** Quick picks under the make field; any make can be typed. */
export const COMMON_MAKES = [
  'Toyota', 'Honda', 'Ford', 'Chevrolet', 'Nissan', 'Hyundai', 'Kia', 'Jeep', 'GMC', 'Subaru',
  'Tesla', 'Volkswagen', 'BMW', 'Mercedes-Benz', 'Lexus', 'Mazda', 'Dodge', 'Ram', 'Buick', 'Cadillac',
];

export const kindInfo = (k: string | null | undefined) => VEHICLE_KINDS.find((x) => x.key === k) ?? VEHICLE_KINDS[0];
export const colorInfo = (c: string | null | undefined) => VEHICLE_COLORS.find((x) => x.key === c) ?? VEHICLE_COLORS[0];

/** "Silver Honda SUV", the same wording the database stores for the board. */
export const vehicleLabel = (v: { make: string; kind: string; color: string }) =>
  `${colorInfo(v.color).label} ${v.make.trim()} ${kindInfo(v.kind).label}`;
