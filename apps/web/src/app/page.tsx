import Link from 'next/link';
import { publicApi } from '@/lib/api';
import { ClubExplorer } from '@/components/ClubExplorer';
import { FloorPlanCard } from '@/components/FloorPlanCard';
import { apiErrorMessage } from '@/lib/i18n/errors';
import { getServerI18n } from '@/lib/i18n/server';
import type { ClubSummary } from '@cyberbook/api-client';

export const revalidate = 0;

export default async function HomePage({
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
      size: 24,
    });
    clubs = result.items;
  } catch (e) {
    error = apiErrorMessage(e, t);
  }

  return (
    <div className="space-y-14">
      {/* ------------------------------------------------------------- hero */}
      <section className="grid gap-8 lg:grid-cols-[1.1fr_0.9fr] lg:items-center">
        <div>
          <span className="chip border border-accent/40 bg-accent/10 text-accent">
            {t('home.badge')}
          </span>
          <h1 className="mt-4 font-heading text-3xl font-bold leading-[1.1] text-text sm:text-4xl lg:text-5xl">
            {t('home.heroTitle')}{' '}
            <span className="text-accent">{t('home.heroTitleAccent')}</span> {t('home.heroTitleEnd')}
          </h1>
          <p className="mt-4 max-w-xl text-base text-muted">{t('home.heroSubtitle')}</p>

          <form
            className="mt-6 flex flex-col gap-3 rounded-panel border border-border bg-surface p-3 sm:flex-row sm:items-end"
            action="/"
            method="get"
          >
            <label className="flex-1 text-sm">
              <span className="mb-1 block text-muted">{t('home.searchDistrict')}</span>
              <input
                name="q"
                defaultValue={params.q ?? ''}
                placeholder={t('home.searchPlaceholder')}
                className="field"
              />
            </label>
            <label className="text-sm sm:w-40">
              <span className="mb-1 block text-muted">{t('home.searchTime')}</span>
              <input
                name="city"
                defaultValue={params.city ?? 'Tashkent'}
                placeholder={t('home.cityPlaceholder')}
                className="field"
              />
            </label>
            <button className="btn btn-primary sm:w-auto" type="submit">
              {t('home.searchNow')}
            </button>
          </form>
        </div>

        <FloorPlanCard />
      </section>

      {/* ----------------------------------------------------- clubs nearby */}
      <section id="clubs" className="scroll-mt-24">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <h2 className="font-heading text-2xl font-bold text-text">{t('home.clubsNearby')}</h2>
          <Link href="/clubs" className="text-sm font-medium text-accent hover:underline">
            {t('home.seeAllOnMap')}
          </Link>
        </div>

        <ClubExplorer
          initialClubs={clubs}
          initialError={error}
          filters={{ q: params.q, city: params.city, category: params.category }}
        />
      </section>

      {/* ----------------------------------------------------- how it works */}
      <section id="how" className="scroll-mt-24">
        <h2 className="font-heading text-2xl font-bold text-text">{t('home.howTitle')}</h2>
        <ol className="mt-5 grid gap-4 sm:grid-cols-3">
          {[
            { n: 1, title: t('home.step1Title'), text: t('home.step1Text') },
            { n: 2, title: t('home.step2Title'), text: t('home.step2Text') },
            { n: 3, title: t('home.step3Title'), text: t('home.step3Text') },
          ].map((step) => (
            <li key={step.n} className="surface p-5">
              <span
                className="inline-flex h-10 w-10 items-center justify-center rounded-control bg-accent font-heading text-lg font-bold text-accent-fg"
                aria-hidden
              >
                {step.n}
              </span>
              <h3 className="mt-4 font-heading text-lg font-bold text-text">{step.title}</h3>
              <p className="mt-1 text-sm text-muted">{step.text}</p>
            </li>
          ))}
        </ol>
      </section>

      {/* --------------------------------------------------------- for owners */}
      <section
        id="owners"
        className="scroll-mt-24 overflow-hidden rounded-hero border border-border bg-surface p-6 sm:p-8"
      >
        <div className="flex flex-col items-start justify-between gap-6 sm:flex-row sm:items-center">
          <div className="max-w-xl">
            <h2 className="font-heading text-2xl font-bold text-text">{t('home.ownersTitle')}</h2>
            <p className="mt-2 text-base text-muted">{t('home.ownersText')}</p>
          </div>
          <Link href="/register" className="btn btn-primary shrink-0">
            {t('home.ownersCta')}
          </Link>
        </div>
      </section>
    </div>
  );
}
