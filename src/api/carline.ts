import { subscribeChanges } from './realtime';
import { carlineConfigSchema } from './schemas';
/** carline: internal API implementation. Screens import the connect facade. */
import type { VehicleColor, VehicleKind } from '../carline/vehicles';
import type { Arrival, BoardRow, CarlineConfig, Person, Pickup, Spot, Vehicle } from './types';
import { live, rpc, run, sb } from './client';
import { current, directory } from './session';
import { toPickup, toVehicle } from './mappers';

/** Students linked to the signed-in parent (or the children a Family account picks up), from the directory loaded by session(). */
export async function myChildren(): Promise<Person[]> {
  if (!live || !current) return [];
  const links = current.schoolRole === 'family'
    ? await run(sb().from('family_pickups').select('student_id').eq('family_id', current.id))
    : await run(sb().from('guardians').select('student_id').eq('guardian_id', current.id));
  return links.map((l) => directory.get(l.student_id)).filter(Boolean) as Person[];
}

/** Today's car line: your children's check-ins, or everyone's for staff on duty. */
export async function carlineToday(): Promise<Pickup[]> {
  if (!live || !current) return [];
  return (await rpc('carline_today')).map(toPickup);
}

/** "I'm here": announce these children, from where the parent is (the server checks the radius), in this vehicle (else their default). */
export async function carlineAnnounce(studentIds: string[], at: Spot, vehicleId?: string | null) {
  await rpc('carline_announce', {
    p_students: studentIds, p_lat: at.lat, p_lng: at.lng, p_accuracy: at.accuracy, p_vehicle: vehicleId ?? null,
  });
}

export async function myVehicles(): Promise<Vehicle[]> {
  if (!live || !current) return [];
  return (await run(sb().from('vehicles').select('*').eq('owner_id', current.id)
    .order('last_used_at', { ascending: false, nullsFirst: false }).order('created_at', { ascending: false }))).map(toVehicle);
}

export async function saveVehicle(v: { id?: string | null; make: string; kind: VehicleKind; color: VehicleColor }): Promise<Vehicle> {
  return toVehicle(await rpc('vehicle_save', { p_id: v.id ?? null, p_make: v.make, p_kind: v.kind, p_color: v.color }));
}

export async function deleteVehicle(id: string) { await rpc('vehicle_delete', { p_id: id }); }

/** Make this the default for the next pickup. */
export async function chooseVehicle(id: string) { await rpc('vehicle_use', { p_id: id }); }

export async function carlineCancel(pickupId: string) { await rpc('carline_cancel', { p_pickup: pickupId }); }

export async function carlineConfirm(pickupId: string) { await rpc('carline_confirm', { p_pickup: pickupId }); }

export async function carlineReopen(pickupId: string) { await rpc('carline_reopen', { p_pickup: pickupId }); }

/** Where and when automatic check-in runs. */
export async function carlineConfig(): Promise<CarlineConfig> { return rpc('carline_config') as Promise<CarlineConfig>; }

/** The phone reached the car line: the server checks in the children if the line is open. */
export async function carlineArrived(at: Spot): Promise<Arrival> {
  return rpc('carline_arrived', { p_lat: at.lat, p_lng: at.lng, p_accuracy: at.accuracy }) as Promise<Arrival>;
}

/** Staff: today's line with pickup numbers. */
export async function carlineBoard(): Promise<BoardRow[]> { return rpc('carline_board') as Promise<BoardRow[]>; }

export async function carlineSetConfig(c: { latitude: number; longitude: number; radius: number; start: string; end: string }): Promise<CarlineConfig> {
  return carlineConfigSchema.parse(await rpc('carline_set_config', { p_lat: c.latitude, p_lng: c.longitude, p_radius: c.radius, p_start: c.start, p_end: c.end }));
}

/** Open the line for the rest of today (drills, demos, early dismissal), or close it again. */
export async function carlineOpenNow(open: boolean): Promise<CarlineConfig> {
  return carlineConfigSchema.parse(await rpc('carline_open_now', { p_open: open }));
}

export async function setPickupNumber(studentId: string, number: string) {
  await rpc('set_pickup_number', { p_student: studentId, p_number: number });
}

/** Pickup numbers this person may see (their children's, or everyone's for staff). */
export async function pickupNumbers(): Promise<Record<string, string>> {
  if (!live || !current) return {};
  const rows = await run(sb().from('pickup_numbers').select('student_id, number'));
  return Object.fromEntries(rows.map((r) => [r.student_id, r.number]));
}

/** Live car line changes (row-level security limits them to what this person may see). */
export function subscribeCarline(onChange: () => void): () => void {
  return subscribeChanges('subscribeCarline', [{ event: '*', table: 'carline_pickups' }], onChange);
}

/** A car pass for this phone: lets the car screen show and check in only this parent's children. */
export async function createCarPass(): Promise<string> {
  return rpc('create_car_pass') as Promise<string>;
}

export async function revokeCarPass(token: string) {
  await rpc('revoke_car_pass', { p_token: token });
}
