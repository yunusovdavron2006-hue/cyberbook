'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { LiveAvailability, LiveStationState } from '@cyberbook/api-client';
import { useApi } from '@/lib/auth-context';
import { useI18n } from '@/lib/i18n/context';

/** Poll cadence for the live availability snapshot (kept gentle to spare the API). */
const POLL_MS = 15_000;

const STATE_STYLE: Record<LiveStationState, string> = {
  FREE: 'border-accent/40 bg-accent/10 text-accent',
  BUSY: 'border-amber-500/30 bg-amber-500/15 text-amber-300',
  MAINTENANCE: 'border-orange-500/30 bg-orange-500/15 text-orange-300',
  CLOSED: 'border-border bg-inactive text-muted',
  OFFLINE: 'border-border bg-inactive text-muted',
};

/**
 * Real-time availability indicator for a club's stations.
 *
 * There is no WebSocket/SSE transport in this codebase (and none is needed for
 * this scale), so "real-time" is implemented as a short-interval poll of the
 * read-only `/clubs/:clubId/availability/now` endpoint. The component surfaces
 * explicit loading, error and reconnect states and cancels its timer on unmount
 * and when the tab is hidden, so it never leaks requests on route change.
 */
export function LiveAvailabilityStrip(props: { clubId: number; timezone: string }) {
  const api = useApi();
  const { t, fmt } = useI18n();
  const [snapshot, setSnapshot] = useState<LiveAvailability | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const mounted = useRef(true);

  const load = useCallback(async () => {
    try {
      const data = await api.getAvailabilityNow(props.clubId);
      if (!mounted.current) return;
      setSnapshot(data);
      setError(false);
    } catch {
      if (!mounted.current) return;
      setError(true);
    } finally {
      if (mounted.current) setLoading(false);
    }
  }, [api, props.clubId]);

  useEffect(() => {
    mounted.current = true;
    void load();

    let timer: ReturnType<typeof setInterval> | null = null;
    const start = () => {
      if (timer === null) timer = setInterval(() => void load(), POLL_MS);
    };
    const stop = () => {
      if (timer !== null) {
        clearInterval(timer);
        timer = null;
      }
    };
    // Poll only while the tab is visible; resume (and refresh immediately) when
    // the user returns so the view is never stale.
    const onVisibility = () => {
      if (document.visibilityState === 'visible') {
        void load();
        start();
      } else {
        stop();
      }
    };

    if (document.visibilityState === 'visible') start();
    document.addEventListener('visibilitychange', onVisibility);

    return () => {
      mounted.current = false;
      stop();
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [load]);

  const stateLabel = (state: LiveStationState) => {
    const key = `live.state.${state}`;
    const label = t(key);
    return label === key ? state : label;
  };

  return (
    <section className="surface p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 font-heading text-lg font-bold text-text">
          {t('live.title')}
          <span
            className="inline-flex items-center gap-1 text-xs font-normal text-muted"
            title={snapshot ? fmt.time(snapshot.now, props.timezone) : undefined}
          >
            <span
              className={`h-2 w-2 rounded-full ${
                error ? 'bg-red-400' : loading ? 'bg-inactive' : 'bg-accent'
              } ${loading || error ? '' : 'animate-pulse'}`}
              aria-hidden
            />
            {error ? t('live.reconnecting') : loading ? t('common.loading') : t('live.live')}
          </span>
        </h2>
        {snapshot && (
          <span className="text-sm text-muted">
            {t('live.freeOfTotal', { free: snapshot.counts.free, total: snapshot.counts.total })}
          </span>
        )}
      </div>

      {error && !snapshot && <p className="mt-3 text-sm text-red-300">{t('live.error')}</p>}

      {!snapshot && loading && (
        <ul className="mt-3 grid gap-2 sm:grid-cols-2">
          {[0, 1, 2, 3].map((i) => (
            <li key={i} className="h-9 animate-pulse rounded-control border border-border bg-inactive" />
          ))}
        </ul>
      )}

      {snapshot && (
        <>
          {snapshot.isOpenNow ? null : (
            <p className="mt-2 text-sm text-amber-300">{t('live.closedNow')}</p>
          )}
          <ul className="mt-3 grid gap-2 sm:grid-cols-2">
            {snapshot.stations.map((s) => (
              <li
                key={s.stationId}
                className="flex min-w-0 flex-wrap items-center justify-between gap-x-3 gap-y-1 rounded-control border border-border bg-inactive px-3 py-2 text-sm"
              >
                <span className="min-w-0 truncate text-text">{s.label}</span>
                <span className={`shrink-0 rounded-full border px-2 py-0.5 text-xs ${STATE_STYLE[s.state]}`}>
                  {stateLabel(s.state)}
                  {s.state === 'BUSY' && s.busyUntil
                    ? ` · ${t('live.until', { time: fmt.time(s.busyUntil, props.timezone) })}`
                    : ''}
                </span>
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}
