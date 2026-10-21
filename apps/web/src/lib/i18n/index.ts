// Client-safe barrel. Server helpers (cookie access via `next/headers`) live in
// `./server` and MUST be imported from there directly so that client components
// never pull `next/headers` into the browser bundle.
export {
  LOCALES,
  LOCALE_META,
  LOCALE_COOKIE,
  LOCALE_STORAGE_KEY,
  LOCALE_COOKIE_MAX_AGE,
  DEFAULT_LOCALE,
  isLocale,
  normalizeLocale,
  type Locale,
  type LocaleMeta,
} from './locales';
export { DICTIONARIES, translate, translatePlural, translateArray, flattenKeys } from './translate';
export type { InterpolationVars, PluralStrings } from './translate';
export { I18nProvider, useI18n } from './context';
export type { I18nValue, LocaleFormatters } from './context';
export { errorMessageKey, apiErrorMessage } from './errors';
