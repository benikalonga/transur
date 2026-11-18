'use client';
import { Suspense } from 'react';
import BookingFlow from '@/components/booking/BookingFlow';

export default function SendParcelPage() {
  return (
    <Suspense>
      <BookingFlow service="parcel" />
    </Suspense>
  );
}
