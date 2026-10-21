import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ApiError } from '@cyberbook/api-client';
import { DICTIONARIES, flattenKeys, interpolate, translate, translateArray, translatePlural } from './translate';
import { apiErrorMessage, errorMessageKey } from './errors';
import { formatDateInTz, formatMoney, formatNumber, weekdayLabel } from '../format';
import type { Locale } from './locales';

const LOCALES: Locale[] = ['uz', 'ru', 'en'];

test('every locale exposes exactly the same translation keys', () => {
  const en = flattenKeys(DICTIONARIES.en).sort();
  for (const locale of LOCALES) {
    const keys = flattenKeys(DICTIONARIES[locale]).sort();
    assert.deepEqual(keys, en, `locale ${locale} has drifted from the canonical key set`);
  }
  assert.ok(en.length > 100, 'sanity: the dictionary is non-trivial');
});

test('no translation value is empty or whitespace', () => {
  for (const locale of LOCALES) {
    for (const key of flattenKeys(DICTIONARIES[locale])) {
      const value = key.split('.').reduce<unknown>(
        (acc, part) => (acc && typeof acc === 'object' ? (acc as Record<string, unknown>)[part] : undefined),
        DICTIONARIES[locale],
      );
      if (typeof value === 'string') {
        assert.ok(value.trim().length > 0, `${locale}.${key} is empty`);
      }
    }
  }
});

test('translate falls back to the key when a path is unknown', () => {
  assert.equal(translate('en', 'this.key.does.not.exist'), 'this.key.does.not.exist');
});

test('translate interpolates variables and leaves unknown placeholders intact', () => {
  const out = translate('en', 'clubs.apiError', { error: 'boom' });
  assert.match(out, /boom/);
  assert.equal(interpolate('a {x} b', {}), 'a {x} b');
});

test('translateArray returns an empty array for a missing path', () => {
  assert.deepEqual(translateArray('en', 'nope.nope'), []);
});

test('English pluralization', () => {
  assert.equal(translatePlural('en', 'common.reviewsCount', 1), '1 review');
  assert.equal(translatePlural('en', 'common.reviewsCount', 2), '2 reviews');
  assert.equal(translatePlural('en', 'common.seatsCount', 5), '5 seats');
});

test('Russian pluralization follows CLDR categories', () => {
  assert.equal(translatePlural('ru', 'common.reviewsCount', 1), '1 отзыв');
  assert.equal(translatePlural('ru', 'common.reviewsCount', 2), '2 отзыва');
  assert.equal(translatePlural('ru', 'common.reviewsCount', 5), '5 отзывов');
  assert.equal(translatePlural('ru', 'common.reviewsCount', 21), '21 отзыв');
  assert.equal(translatePlural('ru', 'common.reviewsCount', 22), '22 отзыва');
});

test('Uzbek pluralization uses one/other', () => {
  assert.equal(translatePlural('uz', 'common.reviewsCount', 1), '1 sharh');
  assert.equal(translatePlural('uz', 'common.reviewsCount', 3), '3 sharh');
});

test('translatePlural also handles plain string keys with a count var', () => {
  assert.equal(translatePlural('en', 'owner.bookings.totalCount', 4), '4 total');
});

test('money grouping is locale-aware but preserves the exact integer amount', () => {
  for (const locale of LOCALES) {
    const formatted = formatMoney(25000, 'CUR', locale);
    const digits = formatted.replace(/\D/g, '');
    assert.equal(digits, '25000', `digits must be intact for ${locale}`);
    assert.match(formatted, /CUR/);
  }
  assert.equal(formatNumber(1000000, 'en').replace(/\D/g, ''), '1000000');
});

test('dates and weekdays differ across locales', () => {
  const iso = '2026-01-15T09:30:00.000Z';
  const en = formatDateInTz(iso, 'Asia/Tashkent', 'en');
  const ru = formatDateInTz(iso, 'Asia/Tashkent', 'ru');
  assert.ok(en.length > 0 && ru.length > 0);
  assert.notEqual(en, ru);
  assert.notEqual(weekdayLabel(0, 'en'), weekdayLabel(0, 'ru'));
});

test('API error codes map to stable dictionary keys', () => {
  assert.equal(errorMessageKey(new ApiError('x', 409, 'BOOKING_CONFLICT')), 'errors.bookingConflict');
  assert.equal(errorMessageKey(new ApiError('x', 409, 'UNIQUE_VIOLATION')), 'errors.unique');
  assert.equal(errorMessageKey(new ApiError('x', 401, 'UNAUTHORIZED')), 'errors.unauthorized');
  assert.equal(errorMessageKey(new ApiError('x', 403, 'FORBIDDEN')), 'errors.forbidden');
  assert.equal(errorMessageKey(new ApiError('x', 404, 'NOT_FOUND')), 'errors.notFound');
});

test('unknown codes fall back to HTTP status, network and generic buckets', () => {
  assert.equal(errorMessageKey(new ApiError('x', 500, 'SOMETHING_NEW')), 'errors.server');
  assert.equal(errorMessageKey(new ApiError('x', 400, 'WEIRD')), 'errors.validation');
  assert.equal(errorMessageKey(new TypeError('Failed to fetch')), 'errors.network');
  assert.equal(errorMessageKey(new Error('mystery')), 'errors.generic');
});

test('apiErrorMessage returns a translated sentence', () => {
  const message = apiErrorMessage(new ApiError('raw', 409, 'BOOKING_CONFLICT'), (path) => translate('en', path), {
    log: false,
  });
  assert.equal(message, translate('en', 'errors.bookingConflict'));
});
