'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import type { Booking } from '@cyberbook/api-client';
import { useApi } from '@/lib/auth-context';
import { Protected } from '@/components/Protected';
import { useI18n } from '@/lib/i18n/context';
import { apiErrorMessage } from '@/lib/i18n/errors';

const STATUS_COLORS: Record<string, string> = {
  PENDING: 'text-amber-300',
  CONFIRMED: 'text-green-300',
  COMPLETED: 'text-sky-300',
  CANCELLED: 'text-gray-400',
  EXPIRED: 'text-gray-500',
  NO_SHOW: 'text-red-300',
};

function BookingsInner() {
  const api = useApi();
  const { t, fmt } = useI18n();
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<{ value: unknown } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const result = await api.myBookings({ size: 50 });
      setBookings(result.items);
    } catch (e) {
      setError({ value: e });
    } finally {
      setLoading(false);
    }
  }, [api]);

  useEffect(() => {
    void load();
  }, [load]);

  const cancel = async (id: number) => {
    try {
      await api.cancelBooking(id, 'Cancelled from web');
      await load();
    } catch (e) {
      setError({ value: e });
    }
  };

  if (loading) return <p className="text-muted">{t('myBookings.loading')}</p>;

  return (
    <div>
      <h1 className="font-heading text-xl font-bold text-text">{t('myBookings.title')}</h1>
      {error && <p className="mt-2 text-sm text-red-300">{apiErrorMessage(error.value, t, { log: false })}</p>}
      {bookings.length === 0 ? (
        <p className="mt-3 text-muted">
          {t('myBookings.empty')}{' '}
          <Link href="/" className="font-medium text-accent hover:underline">
            {t('myBookings.findClub')}
          </Link>
          .
        </p>
      ) : (
        <ul className="mt-4 space-y-3">
          {bookings.map((b) => {
            const tz = b.timezone ?? 'Asia/Tashkent';
            const cancellable = b.status === 'PENDING' || b.status === 'CONFIRMED';
            return (
              <li key={b.id} className="surface p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <div className="font-medium text-text">
                      {b.clubName ?? t('myBookings.clubFallback', { id: b.clubId })}
                    </div>
                    <div className="text-sm text-muted">
                      {b.stationLabel ?? t('myBookings.stationFallback', { id: b.stationId })} ·{' '}
                      {fmt.date(b.startsAt, tz)}, {fmt.time(b.startsAt, tz)}–{fmt.time(b.endsAt, tz)}
                    </div>
                    <div className="mt-1 text-xs text-muted">
                      {t('myBookings.reference')} {b.reference}
                    </div>
                  </div>
                  <div className="text-right">
                    <div className={`font-semibold ${STATUS_COLORS[b.status] ?? 'text-text'}`}>
                      {t(`bookingStatus.${b.status}`)}
                    </div>
                    <div className="text-sm text-muted">{fmt.money(b.priceAmount)}</div>
                    {cancellable && (
                      <button onClick={() => cancel(b.id)} className="btn btn-ghost mt-1 min-h-0 px-3 py-1 text-xs">
                        {t('myBookings.cancel')}
                      </button>
                    )}
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

export default function BookingsPage() {
  return (
    <Protected>
      <BookingsInner />
    </Protected>
  );
}
