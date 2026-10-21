'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ApiError, type AvailabilityDay, type PromotionPreview, type Station } from '@cyberbook/api-client';
import { useApi, useAuth } from '@/lib/auth-context';
import { useI18n } from '@/lib/i18n/context';
import { apiErrorMessage } from '@/lib/i18n/errors';
import { isoDateInTz, todayIsoInTz } from '@/lib/format';

interface Slot {
  iso: string;
  endIso: string;
}

const DURATIONS = [30, 60, 90, 120, 180, 240, 360];

function enumerateSlots(free: { startsAt: string; endsAt: string }[], stepMinutes = 30): Slot[] {
  const slots: Slot[] = [];
  for (const w of free) {
    let t = new Date(w.startsAt).getTime();
    const end = new Date(w.endsAt).getTime();
    while (t + stepMinutes * 60_000 <= end) {
      slots.push({ iso: new Date(t).toISOString(), endIso: new Date(t + stepMinutes * 60_000).toISOString() });
      t += stepMinutes * 60_000;
    }
  }
  return slots;
}

/** Latest end time (ms) of the free window that contains `startMs`. */
function maxEndForStart(free: { startsAt: string; endsAt: string }[], startMs: number): number {
  for (const w of free) {
    const s = new Date(w.startsAt).getTime();
    const e = new Date(w.endsAt).getTime();
    if (startMs >= s && startMs < e) return e;
  }
  return 0;
}

export function BookingWidget(props: {
  clubId: number;
  timezone: string;
  stations: Station[];
  /** Optional externally-controlled seat selection (e.g. from the floor plan). */
  selectedStationId?: number | null;
  onStationChange?: (stationId: number) => void;
}) {
  const api = useApi();
  const router = useRouter();
  const { user } = useAuth();
  const { t, tp, fmt } = useI18n();
  const [date, setDate] = useState(() => todayIsoInTz(props.timezone));
  const [availability, setAvailability] = useState<AvailabilityDay | null>(null);
  const [loading, setLoading] = useState(false);
  const [internalStationId, setInternalStationId] = useState<number | null>(null);
  const stationId = props.selectedStationId ?? internalStationId;
  const setStationId = (id: number | null) => {
    setInternalStationId(id);
    if (id !== null) props.onStationChange?.(id);
  };
  const [startIso, setStartIso] = useState<string | null>(null);
  const [duration, setDuration] = useState(60);
  const [total, setTotal] = useState<number | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<{ value: unknown } | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [promoInput, setPromoInput] = useState('');
  const [promoPreview, setPromoPreview] = useState<PromotionPreview | null>(null);
  const [appliedPromo, setAppliedPromo] = useState<string | null>(null);
  const [promoError, setPromoError] = useState<{ value: unknown } | null>(null);
  const [checkingPromo, setCheckingPromo] = useState(false);

  const loadAvailability = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await api.getAvailability(props.clubId, date);
      setAvailability(data);
      if (props.selectedStationId == null) {
        setInternalStationId((prev) => prev ?? data.stations.find((s) => s.status === 'ACTIVE')?.stationId ?? null);
      }
      setStartIso(null);
      setTotal(null);
    } catch (e) {
      setError({ value: e });
    } finally {
      setLoading(false);
    }
  }, [api, props.clubId, date, props.selectedStationId]);

  useEffect(() => {
    void loadAvailability();
  }, [loadAvailability]);

  const selectedStation = availability?.stations.find((s) => s.stationId === stationId) ?? null;

  const slots = useMemo<Slot[]>(() => {
    if (!selectedStation) return [];
    const now = Date.now();
    const seen = new Set<string>();
    const out: Slot[] = [];
    for (const slot of enumerateSlots(selectedStation.free)) {
      if (seen.has(slot.iso)) continue;
      if (new Date(slot.iso).getTime() < now) continue;
      if (isoDateInTz(slot.iso, props.timezone) !== date) continue;
      seen.add(slot.iso);
      out.push(slot);
    }
    return out;
  }, [selectedStation, date, props.timezone]);

  const durationOptions = useMemo(() => {
    if (!selectedStation || !startIso) return DURATIONS;
    const startMs = new Date(startIso).getTime();
    const maxEnd = maxEndForStart(selectedStation.free, startMs);
    const available = DURATIONS.filter((d) => startMs + d * 60_000 <= maxEnd);
    return available.length > 0 ? available : [30];
  }, [selectedStation, startIso]);

  const endsAt = useMemo(() => {
    if (!startIso) return null;
    return new Date(new Date(startIso).getTime() + duration * 60_000).toISOString();
  }, [startIso, duration]);

  const fetchQuote = useCallback(async () => {
    if (!stationId || !startIso || !endsAt) return;
    try {
      const quote = await api.quotePrice(props.clubId, { stationId, startsAt: startIso, endsAt });
      setTotal(quote.total);
    } catch {
      setTotal(null);
    }
  }, [api, props.clubId, stationId, startIso, endsAt]);

  useEffect(() => {
    void fetchQuote();
  }, [fetchQuote]);

  const runPromo = useCallback(
    async (code: string) => {
      if (!code || !stationId || !startIso || !endsAt) return;
      setCheckingPromo(true);
      setPromoError(null);
      try {
        const preview = await api.previewPromotion(props.clubId, {
          stationId,
          startsAt: startIso,
          endsAt,
          code,
        });
        setPromoPreview(preview);
      } catch (e) {
        setPromoPreview(null);
        setPromoError({ value: e });
      } finally {
        setCheckingPromo(false);
      }
    },
    [api, props.clubId, stationId, startIso, endsAt],
  );

  // Re-evaluate the applied code whenever the selected booking window changes.
  useEffect(() => {
    setPromoPreview(null);
    setPromoError(null);
  }, [stationId, startIso, endsAt, date]);

  useEffect(() => {
    if (!appliedPromo || !stationId || !startIso || !endsAt) return;
    void runPromo(appliedPromo);
  }, [appliedPromo, stationId, startIso, endsAt, runPromo, date]);

  const applyPromo = () => {
    const code = promoInput.trim().toUpperCase();
    setPromoPreview(null);
    setPromoError(null);
    setAppliedPromo(code || null);
  };

  const removePromo = () => {
    setPromoInput('');
    setAppliedPromo(null);
    setPromoPreview(null);
    setPromoError(null);
  };

  const discount = promoPreview && promoPreview.discount > 0 ? promoPreview.discount : 0;
  const payable = total !== null ? Math.max(0, total - discount) : null;

  const book = async () => {
    setError(null);
    setMessage(null);
    if (!user) {
      router.push(`/login?next=${encodeURIComponent(window.location.pathname)}`);
      return;
    }
    if (!stationId || !startIso || !endsAt) {
      setError({ value: t('booking.pickFields') });
      return;
    }
    setSubmitting(true);
    try {
      const booking = await api.createBooking({
        clubId: props.clubId,
        stationId,
        startsAt: startIso,
        endsAt,
        promoCode: appliedPromo ?? undefined,
        idempotencyKey:
          typeof crypto !== 'undefined' && 'randomUUID' in crypto
            ? crypto.randomUUID()
            : `${Date.now()}-${Math.random()}`,
      });
      setMessage(
        t('booking.booked', {
          reference: booking.reference,
          status: t(`bookingStatus.${booking.status}`),
        }),
      );
      await loadAvailability();
      router.push('/bookings');
    } catch (e) {
      setError({ value: e });
    } finally {
      setSubmitting(false);
    }
  };

  const categoryLabel = (value: string) => {
    const key = `categories.${value}`;
    const label = t(key);
    return label === key ? value : label;
  };

  return (
    <div className="panel mt-4 p-4">
      <h2 className="font-heading text-lg font-bold text-text">{t('booking.reserveSeat')}</h2>

      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <label className="text-sm">
          <span className="mb-1 block text-muted">{t('booking.date')}</span>
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="field"
          />
        </label>

        <label className="text-sm">
          <span className="mb-1 block text-muted">{t('booking.station')}</span>
          <select
            value={stationId ?? ''}
            onChange={(e) => {
              setStationId(Number(e.target.value));
              setStartIso(null);
            }}
            className="field"
          >
            <option value="" disabled>
              {t('booking.selectStation')}
            </option>
            {availability?.stations
              .filter((s) => s.status === 'ACTIVE')
              .map((s) => (
                <option key={s.stationId} value={s.stationId}>
                  {s.label} · {categoryLabel(s.category)} · {fmt.money(s.pricePerHour)}
                  {t('common.perHour')}
                </option>
              ))}
          </select>
        </label>

        <label className="text-sm">
          <span className="mb-1 block text-muted">{t('booking.startTime')}</span>
          <select
            value={startIso ?? ''}
            onChange={(e) => setStartIso(e.target.value || null)}
            disabled={!selectedStation || slots.length === 0}
            className="field disabled:opacity-50"
          >
            <option value="" disabled>
              {slots.length === 0 ? t('booking.noFreeSlots') : t('booking.selectTime')}
            </option>
            {slots.map((slot) => (
              <option key={slot.iso} value={slot.iso}>
                {fmt.time(slot.iso, props.timezone)}
              </option>
            ))}
          </select>
        </label>

        <label className="text-sm">
          <span className="mb-1 block text-muted">{t('booking.duration')}</span>
          <select
            value={duration}
            onChange={(e) => setDuration(Number(e.target.value))}
            disabled={!startIso}
            className="field disabled:opacity-50"
          >
            {durationOptions.map((d) => (
              <option key={d} value={d}>
                {tp('common.minutes', d)}
              </option>
            ))}
          </select>
        </label>
      </div>

      {availability?.closedAllDay && (
        <p className="mt-3 text-sm text-amber-300">{t('booking.closedAllDay')}</p>
      )}

      <div className="mt-4 rounded-card border border-border bg-inactive p-3">
        <div className="flex flex-col gap-2 xs:flex-row xs:items-center">
          <input
            value={promoInput}
            onChange={(e) => setPromoInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                applyPromo();
              }
            }}
            placeholder={t('booking.promoPlaceholder')}
            aria-label={t('booking.promoCode')}
            className="field min-w-0 flex-1"
          />
          <button
            type="button"
            onClick={applyPromo}
            disabled={checkingPromo || !promoInput.trim()}
            className="btn btn-ghost"
          >
            {checkingPromo ? t('common.loading') : t('booking.applyPromo')}
          </button>
        </div>
        {appliedPromo && (
          <div className="mt-2 flex flex-wrap items-center gap-2 text-sm">
            <span className="rounded-control bg-accent/20 px-2 py-1 text-accent">
              {appliedPromo}
            </span>
            <button type="button" onClick={removePromo} className="text-muted underline hover:text-text">
              {t('booking.promoRemove')}
            </button>
            {discount > 0 && (
              <span className="text-accent">
                {t('booking.promoApplied', { amount: fmt.money(discount) })}
              </span>
            )}
          </div>
        )}
      </div>

      <div className="mt-4 flex flex-wrap items-end justify-between gap-x-3 gap-y-2">
        <div className="min-w-0 text-sm text-muted">
          {startIso && endsAt ? (
            <>
              {fmt.time(startIso, props.timezone)} – {fmt.time(endsAt, props.timezone)}
            </>
          ) : (
            t('booking.selectTimeForPrice')
          )}
        </div>
        <div className="text-right">
          {discount > 0 ? (
            <>
              <div className="text-xs text-muted">
                {t('booking.subtotal')} {fmt.money(total ?? 0)}
              </div>
              <div className="text-sm text-accent">
                {t('booking.discount')} −{fmt.money(discount)}
              </div>
              <div className="text-lg font-semibold text-text">
                {payable !== null ? fmt.money(payable) : '—'}
              </div>
            </>
          ) : (
            <div className="text-lg font-semibold text-text">
              {total !== null ? fmt.money(total) : '—'}
            </div>
          )}
        </div>
      </div>

      {promoError && <p className="mt-3 text-sm text-amber-300">{promoErrorText(promoError.value, t)}</p>}
      {error && <p className="mt-3 text-sm text-red-300">{apiErrorText(error.value, t)}</p>}
      {message && <p className="mt-3 text-sm text-accent">{message}</p>}

      <button onClick={book} disabled={submitting || !startIso} className="btn btn-primary mt-4 w-full">
        {submitting ? t('booking.submitting') : user ? t('booking.reserveNow') : t('booking.loginToReserve')}
      </button>
      <p className="mt-2 text-xs text-muted">{t('booking.paymentNote')}</p>
    </div>
  );
}

function apiErrorText(value: unknown, t: (path: string) => string): string {
  if (typeof value === 'string') return value;
  return apiErrorMessage(value, t, { log: false });
}

/** Promotion preview failures are expected (bad/expired code), so map them
 *  to friendly copy instead of a generic server error. */
function promoErrorText(value: unknown, t: (path: string) => string): string {
  const code = value instanceof ApiError ? value.code : undefined;
  if (code === 'PROMO_NOT_APPLICABLE' || code === 'PROMO_NOT_FOUND') {
    return t('booking.promoNone');
  }
  return apiErrorText(value, t);
}
