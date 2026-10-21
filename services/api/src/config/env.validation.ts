/**
 * Lightweight environment validation. Fails fast on clearly broken configuration.
 * Secrets are required to be overridden outside development.
 */
export function validateEnv(env: Record<string, unknown>): Record<string, unknown> {
  const errors: string[] = [];
  const nodeEnv = (env.NODE_ENV as string) || 'development';

  const requireNonDefaultSecret = (name: string, devDefault: string) => {
    const value = env[name] as string | undefined;
    if (!value || value === devDefault) {
      if (nodeEnv === 'production') {
        errors.push(`${name} must be set to a strong unique value in production`);
      }
    }
  };

  requireNonDefaultSecret('JWT_ACCESS_SECRET', 'dev-access-secret-change-me');
  requireNonDefaultSecret('JWT_REFRESH_SECRET', 'dev-refresh-secret-change-me');

  if (!env.DATABASE_URL) {
    errors.push('DATABASE_URL is required');
  }

  if (nodeEnv === 'production') {
    if (env.DEV_VERIFICATION_FALLBACK === 'true') {
      errors.push('DEV_VERIFICATION_FALLBACK must be false in production');
    }
    if (env.SEED_DEVELOPMENT_DATA === 'true') {
      errors.push('SEED_DEVELOPMENT_DATA must be false in production');
    }
  }

  if (errors.length > 0) {
    throw new Error(`Invalid environment configuration:\n- ${errors.join('\n- ')}`);
  }
  return env;
}
