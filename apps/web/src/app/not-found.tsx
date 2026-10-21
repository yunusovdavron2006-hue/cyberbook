import Link from 'next/link';
import { getServerI18n } from '@/lib/i18n/server';

export default async function NotFound() {
  const { t } = await getServerI18n();
  return (
    <div className="mx-auto max-w-md py-16 text-center">
      <h1 className="text-2xl font-bold text-white">{t('notFound.title')}</h1>
      <p className="mt-2 text-gray-400">{t('notFound.message')}</p>
      <Link
        href="/"
        className="mt-6 inline-block rounded bg-brand-600 px-4 py-2 text-sm font-medium hover:bg-brand-500"
      >
        {t('notFound.backHome')}
      </Link>
    </div>
  );
}
