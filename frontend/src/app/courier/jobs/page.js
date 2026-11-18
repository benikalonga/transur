import ActivityScreen from '@/components/screens/ActivityScreen';

export const metadata = { title: 'Jobs' };

export default function Jobs() {
  return <ActivityScreen perspective="provider" basePath="/courier/jobs" title="Jobs" />;
}
