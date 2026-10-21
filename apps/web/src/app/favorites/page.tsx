'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import type { ClubSummary } from '@cyberbook/api-client';
import { useApi } from '@/lib/auth-context';
import { Protected } from '@/components/Protected';
import { useI18n } from '@/lib/i18n/context';
import { apiErrorMessage } from '@/lib/i18n/errors';

function FavoritesInner() {
  const api = useApi();
  const { t, fmt } = useI18n();
  const [clubs, setClubs] = useState<ClubSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<{ value: unknown } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setClubs(await api.myFavorites());
    } catch (e) {
      setError({ value: e });
    } finally {
      setLoading(false);
    }
  }, [api]);

  useEffect(() => {
    void load();
  }, [load]);

  const remove = async (clubId: number) => {
    await api.toggleFavorite(clubId);
    await load();
  };

  if (loading) return <p className="text-muted">{t('common.loading')}</p>;

  return (
    <div>
      <h1 className="font-heading text-xl font-bold text-text">{t('favorites.title')}</h1>
      {error && <p className="mt-2 text-sm text-red-300">{apiErrorMessage(error.value, t, { log: false })}</p>}
      {clubs.length === 0 ? (
        <p className="mt-3 text-muted">{t('favorites.empty')}</p>
      ) : (
        <ul className="mt-4 grid gap-3 sm:grid-cols-2">
          {clubs.map((c) => (
            <li key={c.id} className="surface p-4">
              <Link href={`/clubs/${c.slug}`} className="font-medium text-text hover:text-accent hover:underline">
                {c.name}
              </Link>
              <div className="text-sm text-muted">
                {c.district ? `${c.district}, ` : ''}
                {c.city} · {t('favorites.from')} {fmt.money(c.minPricePerHour)}
                {t('common.perHour')}
              </div>
              <button onClick={() => remove(c.id)} className="btn btn-ghost mt-2 min-h-0 px-3 py-1 text-xs">
                {t('favorites.remove')}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export default function FavoritesPage() {
  return (
    <Protected>
      <FavoritesInner />
    </Protected>
  );
}
