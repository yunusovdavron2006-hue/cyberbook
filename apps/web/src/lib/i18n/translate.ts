import { DEFAULT_LOCALE, LOCALE_META, type Locale } from './locales';
import { uz, type Dictionary } from './locales/uz';
import { ru } from './locales/ru';
import { en } from './locales/en';

/** All dictionaries keyed by locale. */
export const DICTIONARIES: Record<Locale, Dictionary> = { uz, ru, en };

export interface PluralStrings {
  one: string;
  few: string;
  many: string;
  other: string;
}

export type InterpolationVars = Record<string, string | number>;

const PLURAL_CATEGORIES: readonly (keyof PluralStrings)[] = [
  'one',
  'few',
  'many',
  'other',
];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function isPluralStrings(value: unknown): value is PluralStrings {
  return (
    isRecord(value) &&
    typeof value.one === 'string' &&
    typeof value.other === 'string' &&
    typeof value.few === 'string' &&
    typeof value.many === 'string'
  );
}

/** Dot-path lookup that never throws for missing branches. */
export function getAtPath(root: unknown, path: string): unknown {
  const parts = path.split('.');
  let cursor: unknown = root;
  for (const part of parts) {
    if (isRecord(cursor) && part in cursor) {
      cursor = cursor[part];
    } else {
      return undefined;
    }
  }
  return cursor;
}

/** Replace every `{name}` placeholder with the matching variable value. */
export function interpolate(template: string, vars?: InterpolationVars): string {
  if (!vars) return template;
  return template.replace(/\{(\w+)\}/g, (match, key: string) => {
    const value = vars[key];
    return value === undefined || value === null ? match : String(value);
  });
}

function pluralCategory(locale: Locale, count: number): keyof PluralStrings {
  const category = new Intl.PluralRules(LOCALE_META[locale].intl).select(count);
  return (PLURAL_CATEGORIES as readonly string[]).includes(category)
    ? (category as keyof PluralStrings)
    : 'other';
}

function resolve(locale: Locale, path: string): unknown {
  const value = getAtPath(DICTIONARIES[locale], path);
  if (value !== undefined) return value;
  return getAtPath(DICTIONARIES[DEFAULT_LOCALE], path);
}

/**
 * Translate a string key for `locale`, falling back to the default locale and
 * finally to the raw key so the UI never crashes on a missing entry.
 */
export function translate(
  locale: Locale,
  path: string,
  vars?: InterpolationVars,
): string {
  const value = resolve(locale, path);
  return typeof value === 'string' ? interpolate(value, vars) : path;
}

/**
 * Translate a plural entry, selecting the CLDR category for `count`. The
 * `count` value is always available as `{count}` inside the template.
 */
export function translatePlural(
  locale: Locale,
  path: string,
  count: number,
  vars?: InterpolationVars,
): string {
  const value = resolve(locale, path);
  const merged: InterpolationVars = { ...vars, count };
  if (isPluralStrings(value)) {
    return interpolate(value[pluralCategory(locale, count)], merged);
  }
  return typeof value === 'string' ? interpolate(value, merged) : path;
}

/** Translate a string-array entry (e.g. weekday names). Falls back to `[]`. */
export function translateArray(locale: Locale, path: string): string[] {
  const value = resolve(locale, path);
  return Array.isArray(value) ? value.filter((v): v is string => typeof v === 'string') : [];
}

/**
 * Flatten a dictionary into a sorted set of leaf paths. Plural objects expand
 * to `path.one|few|many|other`; arrays collapse to a single `path[]` marker.
 * Used by tests to detect key drift between locales.
 */
export function flattenKeys(
  root: unknown,
  prefix = '',
  out: string[] = [],
): string[] {
  if (typeof root === 'string') {
    out.push(prefix);
    return out;
  }
  if (Array.isArray(root)) {
    out.push(`${prefix}[]`);
    return out;
  }
  if (isPluralStrings(root)) {
    for (const category of PLURAL_CATEGORIES) out.push(`${prefix}.${category}`);
    return out;
  }
  if (isRecord(root)) {
    for (const key of Object.keys(root)) {
      flattenKeys(root[key], prefix ? `${prefix}.${key}` : key, out);
    }
  }
  return out;
}
