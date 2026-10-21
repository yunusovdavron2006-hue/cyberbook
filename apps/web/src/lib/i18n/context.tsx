'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import {
  DEFAULT_LOCALE,
  LOCALE_COOKIE,
  LOCALE_COOKIE_MAX_AGE,
  LOCALE_META,
  LOCALE_STORAGE_KEY,
  normalizeLocale,
  type Locale,
} from './locales';
import { translate, translateArray, translatePlural, type InterpolationVars } from './translate';
import {
  formatDateInTz,
  formatInTz,
  formatKm,
  formatMoney,
  formatTimeInTz,
  weekdayLabel,
} from '../format';

export interface LocaleFormatters {
  money: (amount: number) => string;
  km: (km: number) => string;
  date: (iso: string, timeZone: string) => string;
  time: (iso: string, timeZone: string) => string;
  dateTime: (iso: string, timeZone: string, opts?: Intl.DateTimeFormatOptions) => string;
  weekday: (dayOfWeek: number) => string;
}

export interface I18nValue {
  locale: Locale;
  setLocale: (locale: Locale) => void;
  t: (path: string, vars?: InterpolationVars) => string;
  tp: (path: string, count: number, vars?: InterpolationVars) => string;
  ta: (path: string) => string[];
  fmt: LocaleFormatters;
}

const I18nContext = createContext<I18nValue | null>(null);

export function useI18n(): I18nValue {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error('useI18n must be used within <I18nProvider>');
  return ctx;
}

function persistLocale(locale: Locale): void {
  if (typeof document !== 'undefined') {
    const secure = location.protocol === 'https:' ? '; Secure' : '';
    document.cookie = `${LOCALE_COOKIE}=${locale}; Path=/; Max-Age=${LOCALE_COOKIE_MAX_AGE}; SameSite=Lax${secure}`;
    document.documentElement.lang = locale;
  }
  try {
    window.localStorage.setItem(LOCALE_STORAGE_KEY, locale);
  } catch {
    // ignore storage failures (private mode, quota)
  }
}

/** Broadcast so other open tabs follow the change without a reload. */
function broadcast(locale: Locale): void {
  try {
    window.localStorage.setItem(`${LOCALE_STORAGE_KEY}:event`, String(Date.now()));
  } catch {
    // ignore
  }
}

export function I18nProvider({
  children,
  initialLocale = DEFAULT_LOCALE,
}: {
  children: React.ReactNode;
  initialLocale?: Locale;
}) {
  const [locale, setLocaleState] = useState<Locale>(() => normalizeLocale(initialLocale));

  const setLocale = useCallback((next: Locale) => {
    setLocaleState((prev) => {
      if (prev === next) return prev;
      persistLocale(next);
      broadcast(next);
      return next;
    });
  }, []);

  // Adopt a locally stored preference that the server-rendered cookie missed.
  // Only act when a stored value actually exists: an absent value normalizes to
  // the default and would otherwise clobber a cookie-provided locale.
  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(LOCALE_STORAGE_KEY);
      if (!raw) return;
      const stored = normalizeLocale(raw);
      if (stored !== locale) setLocale(stored);
    } catch {
      // ignore
    }
    // Only on mount: initialLocale/state differences are resolved once.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Follow changes made in another tab.
  useEffect(() => {
    const onStorage = (event: StorageEvent) => {
      if (event.key === `${LOCALE_STORAGE_KEY}:event`) {
        try {
          setLocale(normalizeLocale(window.localStorage.getItem(LOCALE_STORAGE_KEY)));
        } catch {
          // ignore
        }
      }
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, [setLocale]);

  const value = useMemo<I18nValue>(() => {
    const t = (path: string, vars?: InterpolationVars) => translate(locale, path, vars);
    const tp = (path: string, count: number, vars?: InterpolationVars) =>
      translatePlural(locale, path, count, vars);
    const ta = (path: string) => translateArray(locale, path);
    const currencyLabel = translate(locale, 'common.currency');
    const fmt: LocaleFormatters = {
      money: (amount) => formatMoney(amount, currencyLabel, locale),
      km: (km) => formatKm(km, locale),
      date: (iso, timeZone) => formatDateInTz(iso, timeZone, locale),
      time: (iso, timeZone) => formatTimeInTz(iso, timeZone, locale),
      dateTime: (iso, timeZone, opts) => formatInTz(iso, timeZone, locale, opts),
      weekday: (dayOfWeek) => weekdayLabel(dayOfWeek, locale),
    };
    return { locale, setLocale, t, tp, ta, fmt };
  }, [locale, setLocale]);

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export { LOCALE_META };
