'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import type { OwnerClubSummary } from '@cyberbook/api-client';
import { useApi } from '@/lib/auth-context';
import { Protected } from '@/components/Protected';
import { useI18n } from '@/lib/i18n/context';
import { apiErrorMessage } from '@/lib/i18n/errors';

const STATUS_COLORS: Record<string, string> = {
  DRAFT: 'text-muted',
  PENDING: 'text-amber-300',
  APPROVED: 'text-green-300',
  REJECTED: 'text-red-300',
  SUSPENDED: 'text-red-400',
};

function DashboardInner() {
  const api = useApi();
  const { t, tp } = useI18n();
  const [clubs, setClubs] = useState<OwnerClubSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<{ value: unknown } | null>(null);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({
    name: '',
    address: '',
    city: 'Tashkent',
    district: '',
    latitude: 41.3111,
    longitude: 69.2797,
    phone: '',
  });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const result = await api.myClubs();
      setClubs(result.clubs);
    } catch (e) {
      setError({ value: e });
    } finally {
      setLoading(false);
    }
  }, [api]);

  useEffect(() => {
    void load();
  }, [load]);

  const createClub = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    try {
      await api.createClub({
        name: form.name,
        address: form.address,
        city: form.city,
        district: form.district || undefined,
        latitude: Number(form.latitude),
        longitude: Number(form.longitude),
        phone: form.phone || undefined,
      });
      setCreating(false);
      setForm({ ...form, name: '', address: '', district: '' });
      await load();
    } catch (e) {
      setError({ value: e });
    }
  };

  const submit = async (clubId: number) => {
    setError(null);
    try {
      await api.submitClubForApproval(clubId);
      await load();
    } catch (e) {
      setError({ value: e });
    }
  };

  return (
    <div>
      <div className="flex items-center justify-between gap-3">
        <h1 className="min-w-0 truncate font-heading text-xl font-bold text-text">{t('owner.myClubs')}</h1>
        <button
          onClick={() => setCreating((v) => !v)}
          className="shrink-0 whitespace-nowrap btn btn-primary"
        >
          {creating ? t('owner.cancel') : t('owner.addClub')}
        </button>
      </div>

      {error && <p className="mt-2 text-sm text-red-300">{apiErrorMessage(error.value, t, { log: false })}</p>}

      {creating && (
        <form onSubmit={createClub} className="mt-4 grid gap-3 surface p-4 sm:grid-cols-2">
          <input required placeholder={t('owner.clubName')} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="field" />
          <input required placeholder={t('owner.address')} value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} className="field" />
          <input placeholder={t('owner.city')} value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} className="field" />
          <input placeholder={t('owner.district')} value={form.district} onChange={(e) => setForm({ ...form, district: e.target.value })} className="field" />
          <input type="number" step="0.0001" placeholder={t('owner.latitude')} value={form.latitude} onChange={(e) => setForm({ ...form, latitude: Number(e.target.value) })} className="field" />
          <input type="number" step="0.0001" placeholder={t('owner.longitude')} value={form.longitude} onChange={(e) => setForm({ ...form, longitude: Number(e.target.value) })} className="field" />
          <button className="btn btn-primary sm:col-span-2">{t('owner.createClub')}</button>
        </form>
      )}

      {loading ? (
        <p className="mt-4 text-muted">{t('common.loading')}</p>
      ) : clubs.length === 0 ? (
        <p className="mt-4 text-muted">{t('owner.noClubs')}</p>
      ) : (
        <ul className="mt-4 space-y-3">
          {clubs.map((c) => (
            <li key={c.id} className="flex flex-wrap items-center justify-between gap-3 surface p-4">
              <div>
                <Link href={`/dashboard/clubs/${c.id}`} className="font-medium text-text hover:text-accent hover:underline">
                  {c.name}
                </Link>
                <div className="text-sm text-muted">
                  {c.city} · {tp('common.seatsCount', c.stationCount)} · {tp('common.bookingsCount', c.bookingCount)}
                </div>
              </div>
              <div className="flex items-center gap-3">
                <span className={`text-sm font-semibold ${STATUS_COLORS[c.status] ?? 'text-text'}`}>
                  {t(`clubStatus.${c.status}`)}
                </span>
                {(c.status === 'DRAFT' || c.status === 'REJECTED') && (
                  <button onClick={() => submit(c.id)} className="btn btn-primary min-h-0 px-3 py-1 text-sm">
                    {t('owner.submitForApproval')}
                  </button>
                )}
                <Link href={`/dashboard/clubs/${c.id}`} className="btn btn-ghost min-h-0 px-3 py-1 text-sm">
                  {t('owner.manage')}
                </Link>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export default function DashboardPage() {
  return (
    <Protected roles={['CLUB_OWNER', 'ADMIN', 'STAFF']}>
      <DashboardInner />
    </Protected>
  );
}

