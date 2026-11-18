'use client';
import { useParams } from 'next/navigation';
import BookingDetailScreen from '@/components/screens/BookingDetailScreen';

export default function JobDetail() {
  const { id } = useParams();
  return <BookingDetailScreen id={id} perspective="provider" />;
}
