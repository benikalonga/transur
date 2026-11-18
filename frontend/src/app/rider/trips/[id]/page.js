'use client';
import { useParams } from 'next/navigation';
import BookingDetailScreen from '@/components/screens/BookingDetailScreen';

export default function RiderTripDetail() {
  const { id } = useParams();
  return <BookingDetailScreen id={id} perspective="rider" />;
}
