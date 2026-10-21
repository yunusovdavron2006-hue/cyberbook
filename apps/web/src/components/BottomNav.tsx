'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useAuth } from '@/lib/auth-context';
import { useI18n } from '@/lib/i18n/context';

interface Item {
  href: string;
  labelKey: string;
  match: (path: string) => boolean;
  icon: React.ReactNode;
  requiresAuth?: boolean;
}

const IconHome = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-6 w-6">
    <path d="M3 10.5 12 3l9 7.5" strokeLinecap="round" strokeLinejoin="round" />
    <path d="M5 9.5V21h14V9.5" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

const IconTicket = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-6 w-6">
    <path
      d="M4 7a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v2a2 2 0 0 0 0 6v2a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2v-2a2 2 0 0 0 0-6V7Z"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
    <path d="M12 5v14" strokeLinecap="round" strokeDasharray="2 3" />
  </svg>
);

const IconHeart = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-6 w-6">
    <path
      d="M12 20s-7-4.35-7-9.5A4.5 4.5 0 0 1 12 7a4.5 4.5 0 0 1 7 3.5C19 15.65 12 20 12 20Z"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

const IconGift = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-6 w-6">
    <path d="M4 11h16v9a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1v-9Z" strokeLinejoin="round" />
    <path d="M3 7h18v4H3z" strokeLinejoin="round" />
    <path d="M12 7v14M12 7S11 3 8.5 3.5 12 7 12 7Zm0 0s1-4 3.5-3.5S12 7 12 7Z" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

const IconLogin = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-6 w-6">
    <path d="M15 3h4a1 1 0 0 1 1 1v16a1 1 0 0 1-1 1h-4" strokeLinecap="round" strokeLinejoin="round" />
    <path d="M10 17l5-5-5-5M15 12H3" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

/** Fixed, thumb-friendly navigation for phones. Hidden from md upward, where
 *  the full header nav takes over. Only shows links the visitor may access. */
export function BottomNav() {
  const pathname = usePathname() || '/';
  const { user } = useAuth();
  const { t } = useI18n();

  const items: Item[] = [
    {
      href: '/',
      labelKey: 'nav.searchShort',
      icon: IconHome,
      match: (p) => p === '/' || p.startsWith('/clubs'),
    },
  ];

  if (user) {
    items.push(
      {
        href: '/bookings',
        labelKey: 'nav.bookingsShort',
        icon: IconTicket,
        match: (p) => p.startsWith('/bookings'),
      },
      {
        href: '/favorites',
        labelKey: 'nav.favoritesShort',
        icon: IconHeart,
        match: (p) => p.startsWith('/favorites'),
      },
      {
        href: '/loyalty',
        labelKey: 'nav.loyaltyShort',
        icon: IconGift,
        match: (p) => p.startsWith('/loyalty'),
      },
    );
    if (user.role === 'CLUB_OWNER' || user.role === 'STAFF') {
      items.push({
        href: '/dashboard',
        labelKey: 'nav.ownerDashboard',
        icon: IconHome,
        match: (p) => p.startsWith('/dashboard'),
      });
    }
    if (user.role === 'ADMIN') {
      items.push({
        href: '/admin',
        labelKey: 'nav.admin',
        icon: IconHome,
        match: (p) => p.startsWith('/admin'),
      });
    }
  } else {
    items.push({
      href: '/login',
      labelKey: 'nav.login',
      icon: IconLogin,
      match: (p) => p.startsWith('/login'),
    });
  }

  return (
    <nav
      aria-label={t('nav.menu')}
      className="safe-bottom fixed inset-x-0 bottom-0 z-40 border-t border-border bg-bg/95 backdrop-blur md:hidden"
    >
      <ul className="mx-auto flex max-w-shell items-stretch justify-around">
        {items.map((item) => {
          const active = item.match(pathname);
          return (
            <li key={item.href} className="flex-1">
              <Link
                href={item.href}
                aria-current={active ? 'page' : undefined}
                className={`flex min-h-[56px] flex-col items-center justify-center gap-0.5 px-1 py-2 text-[11px] transition ${
                  active ? 'text-accent' : 'text-muted hover:text-text'
                }`}
              >
                <span className={`rounded-lg p-1 ${active ? 'bg-accent/15 text-accent' : ''}`} aria-hidden>
                  {item.icon}
                </span>
                <span className="max-w-full truncate">{t(item.labelKey)}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
