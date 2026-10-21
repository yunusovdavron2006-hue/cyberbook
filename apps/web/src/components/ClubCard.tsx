'use client';

import Link from 'next/link';
import type { ClubSummary } from '@cyberbook/api-client';
import { useI18n } from '@/lib/i18n/context';

export function ClubCard({ club }: { club: ClubSummary }) {
  const { t, tp, fmt } = useI18n();

  const categoryLabel = (value: string) => {
    const key = `categories.${value}`;
    const label = t(key);
    return label === key ? value : label;
  };

  return (
    <div className="surface flex min-w-0 flex-col overflow-hidden transition hover:border-accent/60">
      {/* Cover image or a themed placeholder when the club has no photo. */}
      <div className="relative h-40 w-full overflow-hidden bg-inactive">
        {club.coverImageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={club.coverImageUrl}
            alt={club.name}
            className="h-full w-full object-cover"
            loading="lazy"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center bg-[radial-gradient(circle_at_30%_20%,rgba(198,255,61,0.14),transparent_60%)]">
            <svg
              viewBox="0 0 24 24"
              className="h-12 w-12 text-accent/50"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              aria-hidden
            >
              <rect x="3" y="4" width="18" height="12" rx="2" />
              <path d="M8 20h8M12 16v4" strokeLinecap="round" />
            </svg>
          </div>
        )}
        <span className="absolute right-3 top-3 rounded-full bg-bg/80 px-2 py-1 text-xs font-semibold text-accent">
          ★ {club.rating.toFixed(1)}
        </span>
      </div>

      <div className="flex flex-1 flex-col p-4">
        <h3 className="min-w-0 break-words font-heading text-base font-bold text-text">{club.name}</h3>
        <p className="mt-1 text-sm text-muted">
          {club.district ? `${club.district}, ` : ''}
          {club.city}
          {typeof club.distanceKm === 'number' && (
            <span className="text-muted">
              {' · '}
              {fmt.km(club.distanceKm)} {t('clubs.distanceAway')}
            </span>
          )}
        </p>

        <div className="mt-3 flex flex-wrap gap-2">
          {club.categories.slice(0, 3).map((c) => (
            <span key={c} className="chip">
              {categoryLabel(c)}
            </span>
          ))}
        </div>

        <div className="mt-4 flex flex-1 flex-wrap items-end justify-between gap-x-2 gap-y-2">
          <div className="min-w-0 text-sm text-muted">
            <div>
              {t('clubs.from')}{' '}
              <span className="font-semibold text-text">{fmt.money(club.minPricePerHour)}</span>
              {t('common.perHour')}
            </div>
            <div className="text-xs">
              {tp('common.seatsCount', club.stationCount)} · {tp('common.reviewsCount', club.reviewCount)}
            </div>
          </div>
          <Link href={`/clubs/${club.slug}`} className="btn btn-outline shrink-0">
            {t('home.chooseClub')}
          </Link>
        </div>
      </div>
    </div>
  );
}
