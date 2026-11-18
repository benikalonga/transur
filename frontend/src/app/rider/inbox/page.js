import InboxScreen from '@/components/screens/InboxScreen';

export const metadata = { title: 'Inbox' };

export default function RiderInbox() {
  return <InboxScreen tripsPath="/rider/trips" />;
}
