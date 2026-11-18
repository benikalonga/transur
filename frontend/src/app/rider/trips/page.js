import ActivityScreen from '@/components/screens/ActivityScreen';

export const metadata = { title: 'Activity' };

export default function RiderTrips() {
  return <ActivityScreen perspective="rider" basePath="/rider/trips" />;
}
