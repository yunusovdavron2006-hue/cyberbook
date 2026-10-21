/**
 * Supported UI locales for CyberBook.
 *
 * The list is intentionally tiny and explicit so that dictionaries, the
 * language selector and the plural-rule lookup stay in sync.
 */
export const LOCALES = ['uz', 'ru', 'en'] as const;

export type Locale = (typeof LOCALES)[number];

/** Uzbek is the product default and the fallback for missing translations. */
export const DEFAULT_LOCALE: Locale = 'uz';

/** Cookie read on the server so the first paint already has the right locale. */
export const LOCALE_COOKIE = 'cb_locale';

/** localStorage mirror used to recover a preference if the cookie is lost. */
export const LOCALE_STORAGE_KEY = 'cb_locale';

/** How long the locale cookie lives (seconds). */
export const LOCALE_COOKIE_MAX_AGE = 60 * 60 * 24 * 365;

export interface LocaleMeta {
  code: Locale;
  /** Endonym shown in the language selector. */
  label: string;
  /** BCP-47 tag used for Intl.* formatting. */
  intl: string;
  /** Short code shown in the compact selector. */
  short: string;
}

export const LOCALE_META: Record<Locale, LocaleMeta> = {
  uz: { code: 'uz', label: 'O\u2018zbekcha', intl: 'uz-Latn-UZ', short: 'UZ' },
  ru: { code: 'ru', label: '\u0420\u0443\u0441\u0441\u043a\u0438\u0439', intl: 'ru-RU', short: 'RU' },
  en: { code: 'en', label: 'English', intl: 'en-GB', short: 'EN' },
};

export function isLocale(value: unknown): value is Locale {
  return typeof value === 'string' && (LOCALES as readonly string[]).includes(value);
}

/**
 * Best-effort coercion of arbitrary input (cookie, header, account field) to a
 * supported locale, falling back to {@link DEFAULT_LOCALE}.
 */
export function normalizeLocale(value: unknown): Locale {
  if (typeof value !== 'string' || value.length === 0) return DEFAULT_LOCALE;
  if (isLocale(value)) return value;
  const base = value.toLowerCase().slice(0, 2);
  return isLocale(base) ? base : DEFAULT_LOCALE;
}
