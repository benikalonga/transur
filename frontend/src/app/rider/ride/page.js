'use client';
import { Suspense } from 'react';
import BookingFlow from '@/components/booking/BookingFlow';

export default function RidePage() {
  return (
    <Suspense>
      <BookingFlow service="ride" />
    </Suspense>
  );
}
