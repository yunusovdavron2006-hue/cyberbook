'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useI18n } from '@/lib/i18n/context';

type SeatState = 'free' | 'busy';

/** Static 4x3 hall layout: indexes of seats that start occupied. */
const BUSY_SEATS = new Set([2, 5, 7, 11]);
const SEAT_COUNT = 12;

/**
 * Decorative "floor plan" card for the hero. Seat states are purely visual and
 * local; the real availability lives on the club page. Kept as real buttons so
 * it stays keyboard- and screen-reader-friendly.
 */
export function FloorPlanCard() {
  const { t } = useI18n();
  const [selected, setSelected] = useState<number | null>(1);

  const stateOf = (i: number): SeatState => (BUSY_SEATS.has(i) ? 'busy' : 'free');

  return (
    <div className="panel p-5">
      <div className="flex items-center justify-between gap-3">
        <h2 className="font-heading text-lg font-bold text-text">{t('home.floorPlanTitle')}</h2>
        <span className="chip">{t('categories.PC')}</span>
      </div>

      <div
        role="group"
        aria-label={t('home.floorPlanTitle')}
        className="mt-4 grid grid-cols-4 gap-2.5"
      >
        {Array.from({ length: SEAT_COUNT }, (_, i) => {
          const state = stateOf(i);
          const isSelected = selected === i;
          const disabled = state === 'busy';
          return (
            <button
              key={i}
              type="button"
              disabled={disabled}
              onClick={() => setSelected(i)}
              aria-pressed={isSelected}
              aria-label={`${t('home.floorPlanTitle')} ${i + 1} — ${
                disabled ? t('home.seatBusy') : isSelected ? t('home.seatSelected') : t('home.seatFree')
              }`}
              className={`flex aspect-square items-center justify-center rounded-control border text-sm font-semibold transition ${
                disabled
                  ? 'cursor-not-allowed border-transparent bg-inactive text-muted/60'
                  : isSelected
                    ? 'border-accent bg-accent text-accent-fg'
                    : 'border-accent/60 bg-transparent text-accent hover:bg-accent/10'
              }`}
            >
              {i + 1}
            </button>
          );
        })}
      </div>

      <ul className="mt-4 flex flex-wrap gap-x-4 gap-y-2 text-xs text-muted">
        <li className="inline-flex items-center gap-2">
          <span className="h-3 w-3 rounded-sm border border-accent" aria-hidden />
          {t('home.seatFree')}
        </li>
        <li className="inline-flex items-center gap-2">
          <span className="h-3 w-3 rounded-sm bg-inactive" aria-hidden />
          {t('home.seatBusy')}
        </li>
        <li className="inline-flex items-center gap-2">
          <span className="h-3 w-3 rounded-sm bg-accent" aria-hidden />
          {t('home.seatSelected')}
        </li>
      </ul>

      <Link href="/clubs" className="btn btn-primary mt-5 w-full">
        {t('home.reserveSeat')}
      </Link>
    </div>
  );
}
