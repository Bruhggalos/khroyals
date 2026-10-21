/**
 * Staff view: teachers, staff and admins choose on the Main Page whether the apps open in
 * their staff versions (the car line duty board, questions assigned to them, Critical
 * Alerts, the admin portal) or the standard ones a parent sees, which they use for their
 * own children. It only changes what's shown: the database still decides what each person
 * may do. Remembered on this phone; it starts on.
 */
import { useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { isSchoolStaff, type Person } from './api/connect';

const KEY = 'khroyals.staffView';
let on = true;
const listeners = new Set<(on: boolean) => void>();

function set(value: boolean, save: boolean) {
  on = value;
  listeners.forEach((l) => l(value));
  if (save) AsyncStorage.setItem(KEY, value ? '1' : '0').catch(() => { /* storage unavailable: it just won't be remembered */ });
}
AsyncStorage.getItem(KEY).then((v) => { if (v !== null) set(v === '1', false); }).catch(() => {});

/** The switch itself (the Main Page shows it to staff only). */
export function useStaffViewSetting(): [boolean, (on: boolean) => void] {
  const [value, setValue] = useState(on);
  useEffect(() => {
    listeners.add(setValue);
    setValue(on);
    return () => { listeners.delete(setValue); };
  }, []);
  return [value, (v) => set(v, true)];
}

/** Whether this person sees the staff versions: staff with staff view on. Never parents, students or Family accounts. */
export function useStaffView(person: Person | null | undefined): boolean {
  const [value] = useStaffViewSetting();
  return isSchoolStaff(person) && value;
}
