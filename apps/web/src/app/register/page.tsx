'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { type Role } from '@cyberbook/api-client';
import { useAuth } from '@/lib/auth-context';
import { useI18n } from '@/lib/i18n/context';
import { apiErrorMessage } from '@/lib/i18n/errors';

export default function RegisterPage() {
  const { register } = useAuth();
  const { t } = useI18n();
  const router = useRouter();
  const [form, setForm] = useState({
    fullName: '',
    email: '',
    phone: '',
    password: '',
    role: 'USER' as Role,
  });
  const [error, setError] = useState<{ value: unknown } | null>(null);
  const [loading, setLoading] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const user = await register({
        fullName: form.fullName,
        email: form.email,
        phone: form.phone || undefined,
        password: form.password,
        role: form.role,
      });
      if (user.role === 'CLUB_OWNER') router.push('/dashboard');
      else router.push('/');
    } catch (err) {
      setError({ value: err });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="mx-auto max-w-sm">
      <div className="surface p-6">
        <h1 className="font-heading text-xl font-bold text-text">{t('auth.registerTitle')}</h1>
        <form onSubmit={submit} className="mt-4 space-y-3">
          <input
            required
            aria-label={t('auth.fullName')}
            placeholder={t('auth.fullName')}
            value={form.fullName}
            onChange={(e) => setForm({ ...form, fullName: e.target.value })}
            className="field"
          />
          <input
            type="email"
            required
            aria-label={t('auth.email')}
            placeholder={t('auth.email')}
            value={form.email}
            onChange={(e) => setForm({ ...form, email: e.target.value })}
            className="field"
          />
          <input
            aria-label={t('auth.phoneOptional')}
            placeholder={t('auth.phoneOptional')}
            value={form.phone}
            onChange={(e) => setForm({ ...form, phone: e.target.value })}
            className="field"
          />
          <input
            type="password"
            required
            minLength={8}
            aria-label={t('auth.passwordMin')}
            placeholder={t('auth.passwordMin')}
            value={form.password}
            onChange={(e) => setForm({ ...form, password: e.target.value })}
            className="field"
          />
          <label className="block text-sm text-muted">
            {t('auth.wantTo')}
            <select
              value={form.role}
              onChange={(e) => setForm({ ...form, role: e.target.value as Role })}
              className="field mt-1"
            >
              <option value="USER">{t('auth.roleUser')}</option>
              <option value="CLUB_OWNER">{t('auth.roleOwner')}</option>
            </select>
          </label>
          {error && <p className="text-sm text-red-300">{apiErrorMessage(error.value, t, { log: false })}</p>}
          <button disabled={loading} className="btn btn-primary w-full">
            {loading ? t('auth.creating') : t('auth.createAccount')}
          </button>
        </form>
        <p className="mt-4 text-sm text-muted">
          {t('auth.alreadyRegistered')}{' '}
          <Link href="/login" className="font-medium text-accent hover:underline">
            {t('auth.logIn')}
          </Link>
        </p>
      </div>
    </div>
  );
}
