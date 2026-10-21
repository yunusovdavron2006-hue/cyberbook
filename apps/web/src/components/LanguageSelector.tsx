'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useApi, useAuth } from '@/lib/auth-context';
import { LOCALES, LOCALE_COOKIE, LOCALE_META, LOCALE_STORAGE_KEY, normalizeLocale } from '@/lib/i18n';
import { useI18n } from '@/lib/i18n/context';

/**
 * Header language selector. Switching is instant and persists to a cookie (so
 * server-rendered pages start in the right language). When the visitor is
 * signed in, the choice is also pushed to the account profile so it survives
 * across devices. A silent failure never blocks the UI switch.
 */
export function LanguageSelector() {
  const { locale, setLocale, t } = useI18n();
  const { user } = useAuth();
  const api = useApi();
  const router = useRouter();
  const [pending, setPending] = useState(false);

  const change = useCallback(
    (raw: string) => {
      const next = normalizeLocale(raw);
      if (next === locale) return;
      setLocale(next);
      // Re-render server components (which read the cookie) in the new locale.
      router.refresh();
      if (!user) return;
      setPending(true);
      void api
        .updateProfile({ locale: next })
        .catch(() => {
          // The UI already switched; keep the profile in sync on next login.
        })
        .finally(() => setPending(false));
    },
    [api, locale, router, setLocale, user],
  );

  return (
    <label className="flex shrink-0 items-center gap-1">
      <span className="sr-only">{t('language.label')}</span>
      <select
        value={locale}
        onChange={(event) => change(event.target.value)}
        aria-label={t('language.change')}
        disabled={pending}
        className="max-w-[6.5rem] rounded-control border border-border bg-inactive px-2 py-2 text-xs text-text hover:border-accent disabled:opacity-50"
      >
        {LOCALES.map((code) => (
          <option key={code} value={code} className="bg-neutral-900 text-white">
            {LOCALE_META[code].label}
          </option>
        ))}
      </select>
    </label>
  );
}

/**
 * On mount, a signed-in visitor who has never chosen a language locally adopts
 * the account locale. An explicit local choice always wins and is never
 * overwritten by the default.
 */
export function LocaleAccountBridge() {
  const { locale, setLocale } = useI18n();
  const { user } = useAuth();
  const applied = useRef(false);

  useEffect(() => {
    if (applied.current || !user) return;
    applied.current = true;

    let stored: string | null = null;
    try {
      stored = window.localStorage.getItem(LOCALE_STORAGE_KEY);
    } catch {
      // ignore storage failures
    }
    // A locale cookie set on a previous visit is an explicit choice too and must
    // not be overwritten by the account default (which may still be the fallback).
    const hasCookie = document.cookie
      .split(';')
      .some((c) => c.trim().startsWith(`${LOCALE_COOKIE}=`));
    if (stored || hasCookie || !user.locale) return;

    const accountLocale = normalizeLocale(user.locale);
    if (accountLocale !== locale) setLocale(accountLocale);
  }, [user, locale, setLocale]);

  return null;
}
