/** Check-out lists now live in the Attendance app, below the classes; old links land there. */
import { Redirect } from 'expo-router';

export default function CheckoutLists() {
  return <Redirect href="/attendance" />;
}
