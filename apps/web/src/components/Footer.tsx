'use client';

import { useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useApi, useAuth } from '@/lib/auth-context';
import { LOCALES, LOCALE_META, normalizeLocale } from '@/lib/i18n';
import { useI18n } from '@/lib/i18n/context';

/** Site footer with a compact RU / UZ / EN language switcher. */
export function Footer() {
  const { locale, setLocale, t } = useI18n();
  const { user } = useAuth();
  const api = useApi();
  const router = useRouter();

  const change = useCallback(
    (raw: string) => {
      const next = normalizeLocale(raw);
      if (next === locale) return;
      setLocale(next);
      router.refresh();
      if (!user) return;
      void api.updateProfile({ locale: next }).catch(() => {
        // The UI already switched; keep the profile in sync on next login.
      });
    },
    [api, locale, router, setLocale, user],
  );

  return (
    <footer className="mx-auto w-full max-w-shell px-4 py-8 pb-28 md:pb-10">
      <div className="flex flex-col items-center justify-between gap-4 border-t border-border pt-6 sm:flex-row">
        <p className="text-sm text-muted">{t('footer.copyright')}</p>
        <div
          role="group"
          aria-label={t('language.label')}
          className="inline-flex overflow-hidden rounded-control border border-border"
        >
          {LOCALES.map((code) => {
            const active = code === locale;
            return (
              <button
                key={code}
                type="button"
                onClick={() => change(code)}
                aria-pressed={active}
                className={`min-h-[40px] px-3 text-xs font-semibold transition ${
                  active ? 'bg-accent text-accent-fg' : 'text-muted hover:text-text'
                }`}
              >
                {LOCALE_META[code].short}
              </button>
            );
          })}
        </div>
      </div>
    </footer>
  );
}
