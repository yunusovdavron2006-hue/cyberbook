'use client';

import { Suspense, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useAuth } from '@/lib/auth-context';
import { useI18n } from '@/lib/i18n/context';
import { apiErrorMessage } from '@/lib/i18n/errors';

function LoginForm() {
  const { login } = useAuth();
  const { t } = useI18n();
  const router = useRouter();
  const search = useSearchParams();
  const next = search.get('next') || '/';
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<{ value: unknown } | null>(null);
  const [loading, setLoading] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const user = await login(email, password);
      if (user.role === 'ADMIN') router.push('/admin');
      else if (user.role === 'CLUB_OWNER' || user.role === 'STAFF') router.push('/dashboard');
      else router.push(next);
    } catch (err) {
      setError({ value: err });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="mx-auto max-w-sm">
      <div className="surface p-6">
        <h1 className="font-heading text-xl font-bold text-text">{t('auth.loginTitle')}</h1>
        <form onSubmit={submit} className="mt-4 space-y-3">
          <input
            type="email"
            required
            aria-label={t('auth.email')}
            placeholder={t('auth.email')}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="field"
          />
          <input
            type="password"
            required
            aria-label={t('auth.password')}
            placeholder={t('auth.password')}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="field"
          />
          {error && <p className="text-sm text-red-300">{apiErrorMessage(error.value, t, { log: false })}</p>}
          <button disabled={loading} className="btn btn-primary w-full">
            {loading ? t('auth.loggingIn') : t('auth.loginButton')}
          </button>
        </form>
        <p className="mt-4 text-sm text-muted">
          {t('auth.noAccount')}{' '}
          <Link href="/register" className="font-medium text-accent hover:underline">
            {t('auth.signUp')}
          </Link>
        </p>
      </div>
      <div className="mt-6 rounded-card border border-border bg-inactive p-3 text-xs text-muted">
        {t('auth.demoAccounts')} <code className="text-text">Password123!</code>
      </div>
    </div>
  );
}

export default function LoginPage() {
  const { t } = useI18n();
  return (
    <Suspense fallback={<p className="text-gray-400">{t('common.loading')}</p>}>
      <LoginForm />
    </Suspense>
  );
}
