import { cookies } from 'next/headers';
import { DEFAULT_LOCALE, LOCALE_COOKIE, normalizeLocale, type Locale } from './locales';
import {
  translate,
  translateArray,
  translatePlural,
  type InterpolationVars,
} from './translate';

/**
 * Read the active locale on the server from the `cb_locale` cookie so the very
 * first paint (SSR) already uses the right language — no flash of default.
 */
export async function getLocale(): Promise<Locale> {
  const store = await cookies();
  return normalizeLocale(store.get(LOCALE_COOKIE)?.value);
}

export interface ServerI18n {
  locale: Locale;
  t: (path: string, vars?: InterpolationVars) => string;
  tp: (path: string, count: number, vars?: InterpolationVars) => string;
  ta: (path: string) => string[];
}

export function createServerTranslator(locale: Locale = DEFAULT_LOCALE): ServerI18n {
  return {
    locale,
    t: (path, vars) => translate(locale, path, vars),
    tp: (path, count, vars) => translatePlural(locale, path, count, vars),
    ta: (path) => translateArray(locale, path),
  };
}

export async function getServerI18n(): Promise<ServerI18n> {
  return createServerTranslator(await getLocale());
}
