import { NextFunction, Request, Response } from 'express';

const HEADERS: Record<string, string> = {
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Cross-Origin-Opener-Policy': 'same-origin',
  'Cross-Origin-Resource-Policy': 'same-site',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
};

export function securityHeadersMiddleware(_req: Request, res: Response, next: NextFunction) {
  for (const [key, value] of Object.entries(HEADERS)) {
    res.setHeader(key, value);
  }
  res.setHeader('X-Robots-Tag', 'noindex');
  next();
}
