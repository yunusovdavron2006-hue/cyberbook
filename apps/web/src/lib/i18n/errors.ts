import { ApiError } from '@cyberbook/api-client';
import type { InterpolationVars } from './translate';

type Translate = (path: string, vars?: InterpolationVars) => string;

const CODE_TO_KEY: Record<string, string> = {
  BOOKING_CONFLICT: 'errors.bookingConflict',
  UNIQUE_VIOLATION: 'errors.unique',
  UNAUTHORIZED: 'errors.unauthorized',
  FORBIDDEN: 'errors.forbidden',
  NOT_FOUND: 'errors.notFound',
  CONFLICT: 'errors.conflict',
  BAD_REQUEST: 'errors.validation',
  VALIDATION_ERROR: 'errors.validation',
  INTERNAL_ERROR: 'errors.server',
  RATE_LIMITED: 'errors.rateLimited',
  TOO_MANY_REQUESTS: 'errors.rateLimited',
};

function statusToKey(status: number): string {
  if (status === 401) return 'errors.unauthorized';
  if (status === 403) return 'errors.forbidden';
  if (status === 404) return 'errors.notFound';
  if (status === 409) return 'errors.conflict';
  if (status === 400 || status === 422) return 'errors.validation';
  if (status === 429) return 'errors.rateLimited';
  if (status >= 500) return 'errors.server';
  return 'errors.generic';
}

function looksLikeNetworkError(error: unknown): boolean {
  if (error instanceof TypeError) return true;
  if (error instanceof Error) {
    return /failed to fetch|network|fetch failed|load failed/i.test(error.message);
  }
  return false;
}

/**
 * Map any thrown value from the API client to a stable dictionary key. The
 * priority is: specific server `code` → HTTP status → network → generic.
 */
export function errorMessageKey(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.code && CODE_TO_KEY[error.code]) return CODE_TO_KEY[error.code];
    return statusToKey(error.status);
  }
  if (looksLikeNetworkError(error)) return 'errors.network';
  return 'errors.generic';
}

/**
 * Localize an API/network error for display. In development the raw server
 * message is logged (once, when the error is caught) so developers keep the
 * original detail, while users only ever see the translated copy. Set
 * `{ log: false }` when re-rendering an already-logged error.
 */
export function apiErrorMessage(
  error: unknown,
  t: Translate,
  opts: { log?: boolean } = {},
): string {
  if (opts.log !== false && process.env.NODE_ENV !== 'production') {
    const detail = error instanceof Error ? error.message : String(error);
    if (detail) console.warn('[i18n] API error:', detail);
  }
  return t(errorMessageKey(error));
}
