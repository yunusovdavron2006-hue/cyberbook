import { CyberBookClient } from '@cyberbook/api-client';

const API_PATH = '/api/v1';
const SERVER_API_ORIGIN = process.env.API_INTERNAL_URL || 'http://localhost:4000';

/**
 * In the browser we talk to the web app's own origin (`/api/v1`) which Next.js
 * rewrites to the API (see next.config.mjs). On the server we need an absolute
 * URL, so we target the internal API origin directly.
 *
 * `NEXT_PUBLIC_API_BASE_URL` still works as an explicit override (e.g. when the
 * API is exposed on a separate host), but it is optional.
 */
export const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_BASE_URL ||
  (typeof window === 'undefined' ? `${SERVER_API_ORIGIN}${API_PATH}` : API_PATH);

/**
 * Public (unauthenticated) client for server components and public pages.
 */
export const publicApi = new CyberBookClient({ baseUrl: API_BASE_URL });
