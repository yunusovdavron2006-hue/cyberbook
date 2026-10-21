'use client';

import { useState } from 'react';
import type { Station } from '@cyberbook/api-client';
import { BookingWidget } from '@/components/BookingWidget';
import { InteractiveFloorPlan } from '@/components/InteractiveFloorPlan';

/**
 * Client wrapper that couples the 2D floor plan with the booking widget so that
 * picking a seat on the plan automatically selects it in the booking form.
 */
export function ClubBookingPanel(props: {
  clubId: number;
  timezone: string;
  stations: Station[];
}) {
  const [selected, setSelected] = useState<number | null>(null);

  return (
    <>
      <InteractiveFloorPlan
        clubId={props.clubId}
        timezone={props.timezone}
        stations={props.stations}
        selectedStationId={selected}
        onSelect={setSelected}
      />
      <BookingWidget
        clubId={props.clubId}
        timezone={props.timezone}
        stations={props.stations}
        selectedStationId={selected}
        onStationChange={setSelected}
      />
    </>
  );
}
