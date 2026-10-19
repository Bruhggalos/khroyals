/** My profile → My vehicles: what you drive to pickup. The first is your default (the last one used). */
import { useCallback, useState } from 'react';
import { Alert, Pressable, Text, View } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { chooseVehicle, myVehicles, type Vehicle } from '../api/connect';
import { Button, C, Card, Chip, H, P, s } from '../ui';
import { VehicleIcon } from './VehicleIcon';
import { vehicleLabel } from './vehicles';

export function MyVehicles() {
  const [vehicles, setVehicles] = useState<Vehicle[] | null>(null);
  const load = useCallback(() => { myVehicles().then(setVehicles).catch(() => setVehicles([])); }, []);
  useFocusEffect(useCallback(() => { load(); }, [load]));
  if (!vehicles) return null;

  return (
    <Card style={{ gap: 10 }}>
      <H>My vehicles</H>
      <P muted>Car line staff see the vehicle you arrive in. The one you used last is picked for you next time.</P>
      {vehicles.map((v, i) => (
        <Pressable key={v.id} onPress={() => router.push({ pathname: '/vehicle', params: { id: v.id } })} accessibilityRole="button"
          accessibilityLabel={`${vehicleLabel(v)}${i === 0 ? ', default' : ''}. Edit`}
          style={({ pressed }) => [s.row, { gap: 12 }, pressed && { opacity: 0.6 }]}>
          <VehicleIcon kind={v.kind} color={v.color} />
          <View style={{ flex: 1, gap: 2 }}>
            <Text style={{ fontWeight: '700', color: C.ink }}>{vehicleLabel(v)}</Text>
            {i === 0
              ? <Chip label="Default" color="#15803D" />
              : <Text style={{ color: C.primary, fontWeight: '600' }}
                  onPress={() => chooseVehicle(v.id).then(load).catch((e) => Alert.alert('Vehicle', e.message))}>Use for next pickup</Text>}
          </View>
          <Ionicons name="chevron-forward" size={18} color={C.muted} />
        </Pressable>
      ))}
      <Button kind="ghost" label={vehicles.length ? '+ Add a vehicle' : 'Add your vehicle'} onPress={() => router.push('/vehicle')} />
    </Card>
  );
}
