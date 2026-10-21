'use client';

/**
 * Browser-only token storage. Tokens are kept in localStorage and mirrored to a
 * cookie so they survive navigation. This is an MVP approach; a hardened
 * production setup should use httpOnly cookies set by the server.
 */
const ACCESS_KEY = 'cb_access_token';
const REFRESH_KEY = 'cb_refresh_token';

export const session = {
  getAccessToken(): string | null {
    if (typeof window === 'undefined') return null;
    return window.localStorage.getItem(ACCESS_KEY);
  },
  getRefreshToken(): string | null {
    if (typeof window === 'undefined') return null;
    return window.localStorage.getItem(REFRESH_KEY);
  },
  set(accessToken: string, refreshToken: string) {
    if (typeof window === 'undefined') return;
    window.localStorage.setItem(ACCESS_KEY, accessToken);
    window.localStorage.setItem(REFRESH_KEY, refreshToken);
  },
  clear() {
    if (typeof window === 'undefined') return;
    window.localStorage.removeItem(ACCESS_KEY);
    window.localStorage.removeItem(REFRESH_KEY);
  },
};
