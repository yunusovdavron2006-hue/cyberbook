'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth-context';
import { useI18n } from '@/lib/i18n/context';

export function Protected({ children, roles }: { children: React.ReactNode; roles?: string[] }) {
  const { user, loading } = useAuth();
  const { t } = useI18n();
  const router = useRouter();

  useEffect(() => {
    if (loading) return;
    if (!user) {
      router.replace(`/login?next=${encodeURIComponent(window.location.pathname)}`);
      return;
    }
    if (roles && !roles.includes(user.role)) {
      router.replace('/');
    }
  }, [user, loading, roles, router]);

  if (loading) return <p className="text-gray-400">{t('common.loading')}</p>;
  if (!user) return null;
  if (roles && !roles.includes(user.role)) return <p className="text-gray-400">{t('errors.forbidden')}</p>;
  return <>{children}</>;
}
