import InboxScreen from '@/components/screens/InboxScreen';

export const metadata = { title: 'Inbox' };

export default function Inbox() {
  return <InboxScreen tripsPath="/courier/jobs" />;
}
