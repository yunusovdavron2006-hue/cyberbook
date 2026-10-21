import Link from 'next/link';
import { notFound } from 'next/navigation';
import type { ClubDetail, Paged, Promotion, Review } from '@cyberbook/api-client';
import { publicApi } from '@/lib/api';
import { ClubBookingPanel } from '@/components/ClubBookingPanel';
import { LiveAvailabilityStrip } from '@/components/LiveAvailabilityStrip';
import { formatMoney, weekdayLabel } from '@/lib/format';
import { getServerI18n } from '@/lib/i18n/server';

export const revalidate = 0;

export default async function ClubPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const { t, tp, locale } = await getServerI18n();
  let club: ClubDetail;
  let reviews: Paged<Review> | null = null;
  let offers: Promotion[] = [];
  try {
    club = await publicApi.getClub(slug);
  } catch {
    notFound();
  }
  try {
    reviews = await publicApi.clubReviews(club.id, { size: 5 });
  } catch {
    reviews = null;
  }
  try {
    offers = await publicApi.clubPromotions(club.id);
  } catch {
    offers = [];
  }

  const categoryLabel = (value?: string) => {
    if (!value) return '';
    const key = `categories.${value}`;
    const label = t(key);
    return label === key ? value : label;
  };

  return (
    <div className="grid gap-8 lg:grid-cols-[1fr_380px]">
      <div>
        <Link href="/clubs" className="text-sm font-medium text-accent hover:underline">
          {t('clubs.backToClubs')}
        </Link>
        <div className="mt-3 flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <h1 className="break-words font-heading text-xl font-bold text-text sm:text-2xl">{club.name}</h1>
            <p className="mt-1 text-sm text-muted sm:text-base">
              {club.address}
              {club.district ? `, ${club.district}` : ''}, {club.city}
            </p>
          </div>
          <div className="shrink-0 text-right text-accent">
            ★ {club.rating.toFixed(1)}
            <div className="text-xs text-muted">{tp('common.reviewsCount', club.reviewCount)}</div>
          </div>
        </div>

        {club.description && <p className="mt-4 text-muted">{club.description}</p>}

        <div className="mt-6 grid gap-6 sm:grid-cols-2">
          <section className="surface p-4">
            <h2 className="mb-2 font-heading text-lg font-bold text-text">{t('clubs.seatsSection')}</h2>
            <ul className="space-y-1 text-sm">
              {(club.stations ?? []).map((s) => (
                <li key={s.id} className="flex flex-wrap justify-between gap-x-3 gap-y-0.5 border-b border-border py-1.5 last:border-0">
                  <span className="min-w-0 text-text">
                    {s.label}{' '}
                    <span className="text-muted">
                      ({categoryLabel(s.category?.key)}{' '}
                      {s.status !== 'ACTIVE' ? `· ${t(`stationStatus.${s.status}`)}` : ''})
                    </span>
                  </span>
                  <span className="whitespace-nowrap text-muted">
                    {formatMoney(s.pricePerHour, t('common.currency'), locale)}
                    {t('common.perHour')}
                  </span>
                </li>
              ))}
            </ul>
          </section>

          <section className="surface p-4">
            <h2 className="mb-2 font-heading text-lg font-bold text-text">{t('clubs.hoursSection')}</h2>
            <ul className="space-y-1 text-sm">
              {(club.hours ?? [])
                .slice()
                .sort((a, b) => a.dayOfWeek - b.dayOfWeek)
                .map((h) => (
                  <li key={h.id} className="flex justify-between border-b border-border py-1.5 last:border-0">
                    <span className="text-muted">{weekdayLabel(h.dayOfWeek, locale)}</span>
                    <span className="text-text">
                      {h.closed ? t('clubs.closed') : `${h.opensAt} – ${h.closesAt}`}
                    </span>
                  </li>
                ))}
            </ul>
          </section>
        </div>

        {offers.length > 0 && (
          <section className="mt-8">
            <h2 className="mb-2 font-heading text-lg font-bold text-text">{t('promotions.title')}</h2>
            <ul className="grid gap-2 sm:grid-cols-2">
              {offers.map((p) => (
                <li key={p.id} className="rounded-card border border-accent/30 bg-accent/5 p-3">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="text-sm font-semibold text-text">{p.name}</div>
                      <div className="mt-1 text-sm text-accent">
                        {p.type === 'PERCENT'
                          ? t('promotions.percent', { value: p.value })
                          : t('promotions.flat', {
                              value: formatMoney(p.value, t('common.currency'), locale),
                            })}
                      </div>
                      {p.description && <p className="mt-1 text-xs text-muted">{p.description}</p>}
                      {p.dayOfWeeks.length === 0 && !p.startsAtTime && (
                        <p className="mt-1 text-xs text-muted">{t('promotions.always')}</p>
                      )}
                    </div>
                    {p.code && (
                      <span className="shrink-0 rounded-control bg-inactive px-2 py-1 font-mono text-xs text-text">
                        {p.code}
                      </span>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          </section>
        )}

        <section className="mt-8">
          <h2 className="mb-2 font-heading text-lg font-bold text-text">{t('clubs.reviewsSection')}</h2>
          {reviews && reviews.items.length > 0 ? (
            <ul className="space-y-3">
              {reviews.items.map((r) => (
                <li key={r.id} className="surface p-3">
                  <div className="flex justify-between text-sm">
                    <span className="text-muted">{r.authorName}</span>
                    <span className="text-accent">{'★'.repeat(r.rating)}</span>
                  </div>
                  {r.comment && <p className="mt-1 text-sm text-muted">{r.comment}</p>}
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted">{t('clubs.noReviews')}</p>
          )}
        </section>
      </div>

      <div className="lg:sticky lg:top-6 lg:self-start">
        <LiveAvailabilityStrip clubId={club.id} timezone={club.timezone} />
        <ClubBookingPanel clubId={club.id} timezone={club.timezone} stations={club.stations ?? []} />
      </div>
    </div>
  );
}
