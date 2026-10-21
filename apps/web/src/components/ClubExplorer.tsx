'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { ClubSummary } from '@cyberbook/api-client';
import { useApi } from '@/lib/auth-context';
import { useI18n } from '@/lib/i18n/context';
import { ClubCard } from '@/components/ClubCard';
import { ClubMap } from '@/components/ClubMap';

interface Filters {
  q?: string;
  city?: string;
  category?: string;
}

type SortKey = 'relevance' | 'cheapest' | 'rating' | 'distance';

interface Props {
  initialClubs: ClubSummary[];
  initialError?: string | null;
  filters: Filters;
}

function shortError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function ClubExplorer({ initialClubs, initialError = null, filters }: Props) {
  const api = useApi();
  const { t } = useI18n();
  const [clubs, setClubs] = useState<ClubSummary[]>(initialClubs);
  const [error, setError] = useState<{ message: string } | null>(
    initialError ? { message: initialError } : null,
  );
  const [view, setView] = useState<'list' | 'map'>('list');
  const [sort, setSort] = useState<SortKey>('relevance');
  const [availableNow, setAvailableNow] = useState(false);
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [locating, setLocating] = useState(false);
  const [geoError, setGeoError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [activeId, setActiveId] = useState<number | null>(null);

  const initialRef = useRef(initialClubs);
  useEffect(() => {
    if (initialRef.current === initialClubs) return;
    initialRef.current = initialClubs;
    setClubs(initialClubs);
    setError(initialError ? { message: initialError } : null);
  }, [initialClubs, initialError]);

  const runSearch = useCallback(
    async (overrides: {
      lat?: number;
      lng?: number;
      sort?: string;
      availableNow?: boolean;
    }) => {
      setLoading(true);
      setError(null);
      try {
        const result = await api.searchClubs({
          q: filters.q,
          city: filters.city,
          category: filters.category,
          availableNow: overrides.availableNow,
          sort: overrides.sort,
          lat: overrides.lat,
          lng: overrides.lng,
          size: 50,
        });
        let items = result.items;
        if (typeof overrides.lat === 'number') {
          items = [...items].sort(
            (a, b) => (a.distanceKm ?? Number.POSITIVE_INFINITY) - (b.distanceKm ?? Number.POSITIVE_INFINITY),
          );
        }
        setClubs(items);
      } catch (e) {
        setError({ message: t('clubs.apiError', { error: shortError(e) }) });
      } finally {
        setLoading(false);
      }
    },
    [api, filters.q, filters.city, filters.category, t],
  );

  const nearMe = () => {
    setGeoError(null);
    if (typeof navigator === 'undefined' || !('geolocation' in navigator)) {
      setGeoError(t('clubs.geoUnsupported'));
      return;
    }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const lat = pos.coords.latitude;
        const lng = pos.coords.longitude;
        setCoords({ lat, lng });
        setSort('distance');
        void runSearch({ lat, lng });
        setLocating(false);
      },
      (err) => {
        setGeoError(
          err.code === err.PERMISSION_DENIED
            ? t('clubs.locationDenied')
            : err.code === err.POSITION_UNAVAILABLE
              ? t('clubs.geoUnavailable')
              : t('clubs.geoUnavailable'),
        );
        setLocating(false);
      },
      { enableHighAccuracy: false, timeout: 8000, maximumAge: 60000 },
    );
  };

  const changeSort = (value: SortKey) => {
    setSort(value);
    if (value === 'distance') {
      if (!coords) {
        nearMe();
        return;
      }
      void runSearch({ lat: coords.lat, lng: coords.lng });
      return;
    }
    void runSearch({ sort: value === 'relevance' ? undefined : value });
  };

  const toggleAvailableNow = (checked: boolean) => {
    setAvailableNow(checked);
    void runSearch({ availableNow: checked, lat: coords?.lat, lng: coords?.lng });
  };

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div className="flex overflow-hidden rounded-control border border-border">
          <button
            type="button"
            onClick={() => setView('list')}
            aria-pressed={view === 'list'}
            className={`inline-flex items-center px-3 py-2 text-sm font-medium transition ${view === 'list' ? 'bg-accent text-accent-fg' : 'text-muted hover:text-text'}`}
          >
            {t('clubs.viewList')}
          </button>
          <button
            type="button"
            onClick={() => setView('map')}
            aria-pressed={view === 'map'}
            className={`inline-flex items-center border-l border-border px-3 py-2 text-sm font-medium transition ${view === 'map' ? 'bg-accent text-accent-fg' : 'text-muted hover:text-text'}`}
          >
            {t('clubs.viewMap')}
          </button>
        </div>

        <label className="flex min-w-0 items-center gap-2 text-sm text-muted">
          <span className="sr-only">{t('clubs.sortRelevance')}</span>
          <select
            value={sort}
            onChange={(e) => changeSort(e.target.value as SortKey)}
            aria-label={t('clubs.sortRelevance')}
            className="field max-w-full py-2"
          >
            <option value="relevance">{t('clubs.sortRelevance')}</option>
            <option value="cheapest">{t('clubs.sortCheapest')}</option>
            <option value="rating">{t('clubs.sortRating')}</option>
            <option value="distance">{t('clubs.sortNearest')}</option>
          </select>
        </label>

        <label className="inline-flex min-h-[44px] items-center gap-2 py-2 text-sm text-muted">
          <input
            type="checkbox"
            className="h-4 w-4 accent-accent"
            checked={availableNow}
            onChange={(e) => toggleAvailableNow(e.target.checked)}
          />
          {t('clubs.availableNow')}
        </label>

        <button type="button" onClick={nearMe} disabled={locating} className="btn btn-ghost">
          {locating ? t('clubs.locating') : t('clubs.nearMe')}
        </button>

        {loading && <span className="text-sm text-muted">{t('common.loading')}</span>}
      </div>

      {geoError && <p className="mb-3 text-sm text-amber-200">{geoError}</p>}
      {coords && sort === 'distance' && (
        <p className="mb-3 text-xs text-muted">{t('clubs.sortedByDistance')}</p>
      )}

      {error && (
        <div className="break-words rounded-card border border-red-500/40 bg-red-500/10 p-4 text-sm text-red-200">
          {error.message}
        </div>
      )}

      {!error && clubs.length === 0 && <p className="text-muted">{t('clubs.noResults')}</p>}

      {!error && clubs.length > 0 && view === 'map' && (
        <ClubMap clubs={clubs} activeId={activeId} onSelect={(c) => setActiveId(c.id)} />
      )}

      {!error && clubs.length > 0 && view === 'list' && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {clubs.map((club) => (
            <div
              key={club.id}
              className={`min-w-0 ${activeId === club.id ? 'rounded-card ring-2 ring-accent' : ''}`}
            >
              <ClubCard club={club} />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
