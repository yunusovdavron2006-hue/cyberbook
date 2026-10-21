import { DEFAULT_LOCALE, LOCALE_META, type Locale } from './i18n/locales';

/** Locale-aware integer grouping (no currency). */
export function formatNumber(amount: number, locale: Locale = DEFAULT_LOCALE): string {
  return new Intl.NumberFormat(LOCALE_META[locale].intl, {
    maximumFractionDigits: 0,
  }).format(Math.round(amount));
}

/**
 * Money is stored as integer so'm (UZS). Grouping is locale-aware; the currency
 * word is passed in from the dictionary so it stays translated.
 */
export function formatMoney(
  amount: number,
  currencyLabel: string,
  locale: Locale = DEFAULT_LOCALE,
): string {
  return `${formatNumber(amount, locale)} ${currencyLabel}`;
}

/** Locale-aware distance; sub-kilometer values render as meters. */
export function formatKm(km: number, locale: Locale = DEFAULT_LOCALE): string {
  if (!Number.isFinite(km) || km < 0) return '';
  const intl = LOCALE_META[locale].intl;
  if (km < 1) {
    return new Intl.NumberFormat(intl, {
      style: 'unit',
      unit: 'meter',
      unitDisplay: 'short',
      maximumFractionDigits: 0,
    }).format(Math.round(km * 1000));
  }
  return new Intl.NumberFormat(intl, {
    style: 'unit',
    unit: 'kilometer',
    unitDisplay: 'short',
    maximumFractionDigits: 1,
  }).format(km);
}

/** Format a UTC instant in the club timezone, localized. */
export function formatInTz(
  iso: string,
  timeZone: string,
  locale: Locale = DEFAULT_LOCALE,
  opts?: Intl.DateTimeFormatOptions,
): string {
  return new Intl.DateTimeFormat(LOCALE_META[locale].intl, {
    timeZone,
    dateStyle: 'medium',
    timeStyle: 'short',
    ...opts,
  }).format(new Date(iso));
}

export function formatTimeInTz(
  iso: string,
  timeZone: string,
  locale: Locale = DEFAULT_LOCALE,
): string {
  return new Intl.DateTimeFormat(LOCALE_META[locale].intl, {
    timeZone,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(new Date(iso));
}

export function formatDateInTz(
  iso: string,
  timeZone: string,
  locale: Locale = DEFAULT_LOCALE,
): string {
  return new Intl.DateTimeFormat(LOCALE_META[locale].intl, {
    timeZone,
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  }).format(new Date(iso));
}

/** Monday-based weekday name (0 = Monday … 6 = Sunday). */
const REF_MONDAY_UTC = Date.UTC(2024, 0, 1, 12);

export function weekdayLabel(dayOfWeek: number, locale: Locale = DEFAULT_LOCALE): string {
  const date = new Date(REF_MONDAY_UTC + dayOfWeek * 86_400_000);
  return new Intl.DateTimeFormat(LOCALE_META[locale].intl, {
    weekday: 'long',
    timeZone: 'UTC',
  }).format(date);
}

/**
 * Club-timezone calendar date (yyyy-mm-dd) for "now". Kept locale-independent
 * (ISO-8601) because it feeds API query params and `<input type="date">`.
 */
export function todayIsoInTz(timeZone: string): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
}

/** Club-timezone calendar date (yyyy-mm-dd) for a given UTC instant. */
export function isoDateInTz(iso: string, timeZone: string): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date(iso));
}
