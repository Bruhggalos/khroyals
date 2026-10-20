/**
 * The kinds of critical alert (the database checks the same keys). Each comes with a
 * starting title and instructions the sender can edit before sending; the school should
 * keep these in line with its own safety plan.
 */
import type { ComponentProps } from 'react';
import type { MaterialCommunityIcons } from '@expo/vector-icons';

export type AlertKind = 'weather' | 'threat' | 'danger' | 'other';

export const ALERT_KINDS: {
  key: AlertKind; label: string; hint: string; icon: ComponentProps<typeof MaterialCommunityIcons>['name']; color: string;
  title: string; body: string;
}[] = [
  {
    key: 'threat', label: 'Active threat', hint: 'Shooter or intruder: lockdown', icon: 'alert-octagon', color: '#B42318',
    title: 'Lockdown: active threat',
    body: 'Lock your door, turn off the lights, and keep everyone silent and out of sight. Do not open the door for anyone until the all clear.',
  },
  {
    key: 'weather', label: 'Severe weather', hint: 'Tornado or storm: shelter', icon: 'weather-lightning-rainy', color: '#B45309',
    title: 'Severe weather: shelter in place',
    body: 'Take students to your severe weather shelter area now. Stay away from windows and doors. Wait for the all clear.',
  },
  {
    key: 'danger', label: 'Dangerous situation', hint: 'Hold in place', icon: 'shield-alert', color: '#C2410C',
    title: 'Hold in place: dangerous situation',
    body: 'Keep students in your room and keep teaching. No one goes into the halls until the all clear.',
  },
  {
    key: 'other', label: 'Other urgent message', hint: 'From the administration', icon: 'bullhorn', color: '#1E3A8A',
    title: '', body: '',
  },
];

export const alertKind = (k: string | null | undefined) => ALERT_KINDS.find((x) => x.key === k) ?? ALERT_KINDS[3];
