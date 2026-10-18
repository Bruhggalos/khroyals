// App entry. Background tasks (the car line arrival geofence) have to be
// defined before anything renders, and CarPlay can start the app without its
// phone screen, so both load first; then expo-router starts.
import './src/carline/autoCheckIn';
import './src/carplay/controller';
import 'expo-router/entry';
