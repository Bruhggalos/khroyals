// App entry. Background tasks (the car line arrival geofence) have to be
// defined before anything renders, so they load first; then expo-router starts.
import './src/carline/autoCheckIn';
import 'expo-router/entry';
