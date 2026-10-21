'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  readStationLayout,
  type LiveAvailability,
  type LiveStation,
  type LiveStationState,
  type Station,
} from '@cyberbook/api-client';
import { useApi } from '@/lib/auth-context';
import { useI18n } from '@/lib/i18n/context';

const POLL_MS = 15_000;

const STATE_BORDER: Record<LiveStationState, string> = {
  FREE: 'border-accent/50 bg-accent/10 text-accent',
  BUSY: 'border-amber-500/40 bg-amber-500/15 text-amber-300',
  MAINTENANCE: 'border-orange-500/40 bg-orange-500/15 text-orange-300',
  CLOSED: 'border-border bg-inactive text-muted',
  OFFLINE: 'border-border bg-inactive text-muted',
};

interface Cell extends LiveStation {
  layout: { zone: string | null; mapX: number | null; mapY: number | null };
}

/**
 * Interactive 2D floor plan for customers. Seats are positioned from each
 * station's optional `specs.mapX` / `specs.mapY` coordinates and coloured by the
 * live availability snapshot. Only FREE seats are selectable; selecting a seat
 * notifies the parent so the booking widget follows the choice.
 */
export function InteractiveFloorPlan(props: {
  clubId: number;
  timezone: string;
  stations: Station[];
  selectedStationId?: number | null;
  onSelect?: (stationId: number) => void;
}) {
  const api = useApi();
  const { t, fmt } = useI18n();
  const [snapshot, setSnapshot] = useState<LiveAvailability | null>(null);
  const [error, setError] = useState(false);
  const mounted = useRef(true);

  const load = useCallback(async () => {
    try {
      const data = await api.getAvailabilityNow(props.clubId);
      if (!mounted.current) return;
      setSnapshot(data);
      setError(false);
    } catch {
      if (mounted.current) setError(true);
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

  const layoutById = useMemo(() => {
    const map = new Map<number, { zone: string | null; mapX: number | null; mapY: number | null }>();
    for (const s of props.stations) map.set(s.id, readStationLayout(s));
    return map;
  }, [props.stations]);

  // Merge live state (authoritative) with layout coordinates.
  const cells = useMemo<Cell[]>(() => {
    const live = snapshot?.stations ?? [];
    return live.map((s) => ({
      ...s,
      layout: layoutById.get(s.stationId) ?? { zone: null, mapX: null, mapY: null },
    }));
  }, [snapshot, layoutById]);

  // Only stations with real coordinates are placed; the rest fall back to a grid.
  const hasCoords = cells.some((c) => c.layout.mapX !== null && c.layout.mapY !== null);
  const placed = useMemo(() => {
    if (!hasCoords) return [] as { cell: Cell; x: number; y: number }[];
    const cols = Math.max(...cells.map((c) => c.layout.mapX ?? 0)) + 1;
    return cells
      .filter((c) => c.layout.mapX !== null && c.layout.mapY !== null)
      .map((c) => ({ cell: c, x: c.layout.mapX as number, y: Math.min(c.layout.mapY as number, 50) }))
      .sort((a, b) => a.y - b.y || a.x - b.x || (a.cell.stationId - b.cell.stationId))
      .map((it) => ({ ...it, x: Math.min(it.x, cols + 2) }));
  }, [cells, hasCoords]);

  const unplaced = useMemo(
    () => cells.filter((c) => c.layout.mapX === null || c.layout.mapY === null),
    [cells],
  );

  const zones = useMemo(() => {
    const set = new Set<string>();
    for (const c of cells) if (c.layout.zone) set.add(c.layout.zone);
    return Array.from(set);
  }, [cells]);

  const stateLabel = (state: LiveStationState) => {
    const key = `live.state.${state}`;
    const label = t(key);
    return label === key ? state : label;
  };

  const busyUntil = (s: LiveStation) =>
    s.state === 'BUSY' && s.busyUntil ? ` · ${t('live.until', { time: fmt.time(s.busyUntil, props.timezone) })}` : '';

  const renderSeat = (cell: Cell) => {
    const selectable = cell.state === 'FREE';
    const active = props.selectedStationId === cell.stationId;
    return (
      <button
        key={cell.stationId}
        type="button"
        disabled={!selectable}
        onClick={() => selectable && props.onSelect?.(cell.stationId)}
        aria-pressed={active}
        aria-label={`${cell.label} — ${stateLabel(cell.state)}${busyUntil(cell)}`}
        className={`flex min-h-[64px] min-w-0 flex-col items-center justify-center gap-0.5 rounded-control border p-2 text-center text-xs transition ${
          STATE_BORDER[cell.state]
        } ${active ? 'ring-2 ring-accent' : ''} ${
          selectable ? 'cursor-pointer hover:brightness-125' : 'cursor-not-allowed opacity-90'
        }`}
      >
        <span className="w-full truncate font-semibold text-text">{cell.label}</span>
        <span className="text-[11px]">{stateLabel(cell.state)}{busyUntil(cell)}</span>
      </button>
    );
  };

  return (
    <section className="surface mt-6 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-heading text-lg font-bold text-text">{t('floorPlan.title')}</h2>
        {snapshot && (
          <span className="text-sm text-muted">
            {t('live.freeOfTotal', { free: snapshot.counts.free, total: snapshot.counts.total })}
          </span>
        )}
      </div>

      <p className="mt-1 text-xs text-muted">{t('floorPlan.hint')}</p>

      {zones.length > 1 && (
        <ul className="mt-2 flex flex-wrap gap-2 text-xs">
          {zones.map((z) => (
            <li key={z} className="rounded-control border border-border bg-inactive px-2 py-0.5 text-muted">
              {t('floorPlan.zone')}: {z}
            </li>
          ))}
        </ul>
      )}

      {error && !snapshot && <p className="mt-3 text-sm text-red-300">{t('live.error')}</p>}

      {!snapshot && !error && (
        <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="h-16 animate-pulse rounded-control border border-border bg-inactive" />
          ))}
        </div>
      )}

      {snapshot && placed.length > 0 && (
        <div
          className="mt-3 grid gap-2"
          style={{ gridTemplateColumns: `repeat(${Math.max(1, Math.min(placed.length, 6))}, minmax(0, 1fr))` }}
          role="group"
          aria-label={t('floorPlan.title')}
        >
          {/* CSS grid auto-flows row-major; seats are pre-sorted by y then x. */}
          {placed.map(({ cell }) => renderSeat(cell))}
        </div>
      )}

      {snapshot && placed.length > 0 && unplaced.length > 0 && (
        <ul
          className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3"
          role="group"
          aria-label={t('floorPlan.otherSeats')}
        >
          {unplaced.map((cell) => (
            <li key={cell.stationId}>{renderSeat(cell)}</li>
          ))}
        </ul>
      )}

      {snapshot && placed.length === 0 && (
        <ul className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4" role="group" aria-label={t('floorPlan.title')}>
          {cells.map((cell) => (
            <li key={cell.stationId}>{renderSeat(cell)}</li>
          ))}
        </ul>
      )}

      <ul className="mt-3 flex flex-wrap gap-3 text-xs text-muted">
        <li className="inline-flex items-center gap-1">
          <span className="h-3 w-3 rounded-sm border border-accent/50 bg-accent/10" aria-hidden /> {t('live.state.FREE')}
        </li>
        <li className="inline-flex items-center gap-1">
          <span className="h-3 w-3 rounded-sm border border-amber-500/40 bg-amber-500/15" aria-hidden /> {t('live.state.BUSY')}
        </li>
        <li className="inline-flex items-center gap-1">
          <span className="h-3 w-3 rounded-sm border border-orange-500/40 bg-orange-500/15" aria-hidden /> {t('live.state.MAINTENANCE')}
        </li>
      </ul>
    </section>
  );
}
