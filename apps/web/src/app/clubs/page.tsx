import { publicApi } from '@/lib/api';
import { ClubExplorer } from '@/components/ClubExplorer';
import { apiErrorMessage } from '@/lib/i18n/errors';
import { getServerI18n } from '@/lib/i18n/server';
import type { ClubSummary } from '@cyberbook/api-client';

export const revalidate = 0;

export default async function ClubsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; city?: string; category?: string }>;
}) {
  const params = await searchParams;
  const { t } = await getServerI18n();
  let clubs: ClubSummary[] = [];
  let error: string | null = null;

  try {
    const result = await publicApi.searchClubs({
      q: params.q,
      city: params.city,
      category: params.category,
      size: 50,
    });
    clubs = result.items;
  } catch (e) {
    error = apiErrorMessage(e, t);
  }

  return (
    <div className="space-y-6">
      <header>
        <h1 className="font-heading text-2xl font-bold text-text sm:text-3xl">{t('nav.clubs')}</h1>
        <p className="mt-1 text-sm text-muted">{t('home.subtitle')}</p>
      </header>

      <form className="flex flex-col gap-3 sm:flex-row sm:items-end" action="/clubs" method="get">
        <label className="flex-1 text-sm">
          <span className="mb-1 block text-muted">{t('home.searchDistrict')}</span>
          <input
            name="q"
            defaultValue={params.q ?? ''}
            placeholder={t('home.searchPlaceholder')}
            className="field"
          />
        </label>
        <label className="text-sm sm:w-48">
          <span className="mb-1 block text-muted">{t('home.cityPlaceholder')}</span>
          <input name="city" defaultValue={params.city ?? ''} className="field" />
        </label>
        <button className="btn btn-primary" type="submit">
          {t('home.searchNow')}
        </button>
      </form>

      <ClubExplorer
        initialClubs={clubs}
        initialError={error}
        filters={{ q: params.q, city: params.city, category: params.category }}
      />
    </div>
  );
}
