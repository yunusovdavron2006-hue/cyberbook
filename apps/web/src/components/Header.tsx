'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth-context';
import { useI18n } from '@/lib/i18n/context';
import { LanguageSelector } from './LanguageSelector';

interface NavLink {
  href: string;
  labelKey: string;
  match: (path: string) => boolean;
}

/** Sticky top bar: brand, primary nav and auth actions. */
export function Header() {
  const { user, loading, logout } = useAuth();
  const { t } = useI18n();
  const router = useRouter();
  const pathname = usePathname() || '/';
  const [open, setOpen] = useState(false);

  // Close the mobile menu whenever the route changes.
  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  // Lock body scroll while the drawer is open.
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  // Marketing links shown to everyone, plus the signed-in destinations.
  const links: NavLink[] = [
    { href: '/', labelKey: 'nav.clubs', match: (p) => p === '/' || p.startsWith('/clubs') },
    { href: '/#how', labelKey: 'nav.howItWorks', match: () => false },
    { href: '/#owners', labelKey: 'nav.forOwners', match: () => false },
  ];
  if (user) {
    links.push(
      { href: '/bookings', labelKey: 'nav.myBookings', match: (p) => p.startsWith('/bookings') },
      { href: '/favorites', labelKey: 'nav.favorites', match: (p) => p.startsWith('/favorites') },
      { href: '/loyalty', labelKey: 'nav.loyalty', match: (p) => p.startsWith('/loyalty') },
    );
    if (user.role === 'CLUB_OWNER' || user.role === 'STAFF') {
      links.push({ href: '/dashboard', labelKey: 'nav.ownerDashboard', match: (p) => p.startsWith('/dashboard') });
    }
    if (user.role === 'ADMIN') {
      links.push({ href: '/admin', labelKey: 'nav.admin', match: (p) => p.startsWith('/admin') });
    }
  }

  const linkClass = (active: boolean) =>
    `inline-flex items-center rounded-control px-3 py-2 text-sm font-medium transition ${
      active ? 'text-accent' : 'text-muted hover:text-text'
    }`;

  return (
    <header className="sticky top-0 z-40 border-b border-border bg-bg/80 backdrop-blur">
      <nav className="mx-auto flex w-full max-w-shell items-center justify-between gap-3 px-4 py-3">
        <div className="flex min-w-0 items-center gap-1 sm:gap-2">
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            aria-expanded={open}
            aria-controls="mobile-menu"
            aria-label={open ? t('nav.closeMenu') : t('nav.menu')}
            className="inline-flex h-11 w-11 items-center justify-center rounded-control text-text hover:bg-inactive md:hidden"
          >
            {open ? (
              <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="1.8">
                <path d="M6 6l12 12M18 6 6 18" strokeLinecap="round" />
              </svg>
            ) : (
              <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="1.8">
                <path d="M4 7h16M4 12h16M4 17h16" strokeLinecap="round" />
              </svg>
            )}
          </button>

          <Link href="/" className="shrink-0 font-heading text-lg font-bold tracking-tight text-text">
            Cyber<span className="text-accent">Book</span>
          </Link>

          <div className="hidden items-center gap-0.5 md:flex">
            {links.map((link) => (
              <Link key={link.href} href={link.href} className={linkClass(link.match(pathname))}>
                {t(link.labelKey)}
              </Link>
            ))}
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-2">
          <div className="hidden md:block">
            <LanguageSelector />
          </div>
          {loading ? (
            <span className="text-muted">…</span>
          ) : user ? (
            <>
              <span
                className="hidden max-w-[12rem] truncate text-sm text-muted sm:inline"
                title={user.displayName || user.email}
              >
                {user.displayName || user.email}
              </span>
              <button
                onClick={async () => {
                  await logout();
                  router.push('/');
                }}
                className="btn btn-outline hidden md:inline-flex"
              >
                {t('nav.logout')}
              </button>
            </>
          ) : (
            <div className="hidden items-center gap-2 md:flex">
              <Link href="/login" className="btn btn-outline">
                {t('nav.login')}
              </Link>
              <Link href="/register" className="btn btn-primary">
                {t('nav.downloadApp')}
              </Link>
            </div>
          )}
        </div>
      </nav>

      {/* Mobile drawer: every link plus auth actions. */}
      {open && (
        <div id="mobile-menu" className="border-t border-border bg-bg md:hidden">
          <ul className="mx-auto max-w-shell px-2 py-2">
            {links.map((link) => {
              const active = link.match(pathname);
              return (
                <li key={link.href}>
                  <Link
                    href={link.href}
                    className={`flex min-h-[48px] items-center rounded-control px-3 text-base ${
                      active ? 'bg-inactive text-accent' : 'text-muted hover:bg-inactive'
                    }`}
                  >
                    {t(link.labelKey)}
                  </Link>
                </li>
              );
            })}
            <li className="mt-2 border-t border-border pt-2">
              {user ? (
                <>
                  <div className="px-3 py-2 text-sm text-muted" title={user.displayName || user.email}>
                    <span className="block truncate">{user.displayName || user.email}</span>
                  </div>
                  <button
                    onClick={async () => {
                      await logout();
                      router.push('/');
                    }}
                    className="flex min-h-[48px] w-full items-center rounded-control px-3 text-left text-base text-muted hover:bg-inactive"
                  >
                    {t('nav.logout')}
                  </button>
                </>
              ) : (
                <div className="grid grid-cols-2 gap-2 p-2">
                  <Link href="/login" className="btn btn-outline">
                    {t('nav.login')}
                  </Link>
                  <Link href="/register" className="btn btn-primary">
                    {t('nav.downloadApp')}
                  </Link>
                </div>
              )}
              <div className="px-2 pb-2 pt-2">
                <LanguageSelector />
              </div>
            </li>
          </ul>
        </div>
      )}
    </header>
  );
}
