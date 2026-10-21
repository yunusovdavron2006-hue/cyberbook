'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import type {
  Booking,
  ClubDashboard,
  CreatePromotionInput,
  OperatingHours,
  PricingRule,
  Promotion,
  PromotionType,
  Station,
} from '@cyberbook/api-client';
import { useApi } from '@/lib/auth-context';
import { Protected } from '@/components/Protected';
import { FloorPlanEditor } from '@/components/FloorPlanEditor';
import { useI18n } from '@/lib/i18n/context';
import { apiErrorMessage } from '@/lib/i18n/errors';

type Tab = 'overview' | 'stations' | 'hours' | 'pricing' | 'promotions' | 'bookings';

const CATEGORY_KEYS = ['PC', 'VIP_PC', 'BOOTCAMP', 'CONSOLE'] as const;

function ManageInner() {
  const api = useApi();
  const { t } = useI18n();
  const params = useParams<{ id: string }>();
  const clubId = Number(params.id);
  const [tab, setTab] = useState<Tab>('overview');
  const [clubName, setClubName] = useState('');
  const [dashboard, setDashboard] = useState<ClubDashboard | null>(null);
  const [stations, setStations] = useState<Station[]>([]);
  const [hours, setHours] = useState<OperatingHours[]>([]);
  const [rules, setRules] = useState<PricingRule[]>([]);
  const [promotions, setPromotions] = useState<Promotion[]>([]);
  const [bookingCounts, setBookingCounts] = useState<Record<string, number>>({});
  const [error, setError] = useState<{ value: unknown } | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [detail, dash, promos] = await Promise.all([
        api.ownerClubDetail(clubId),
        api.clubDashboard(clubId),
        api.managePromotions(clubId).catch(() => [] as Promotion[]),
      ]);
      setClubName(detail.club.name);
      setStations(detail.stations);
      setHours(detail.hours);
      setRules(detail.pricingRules);
      setBookingCounts(detail.bookingCounts ?? {});
      setDashboard(dash);
      setPromotions(promos);
    } catch (e) {
      setError({ value: e });
    } finally {
      setLoading(false);
    }
  }, [api, clubId]);

  useEffect(() => {
    void load();
  }, [load]);

  if (loading) return <p className="text-muted">{t('owner.loadingClub')}</p>;
  if (error) return <p className="text-sm text-red-300">{apiErrorMessage(error.value, t, { log: false })}</p>;

  const tabs: Tab[] = ['overview', 'stations', 'hours', 'pricing', 'promotions', 'bookings'];

  return (
    <div>
      <Link href="/dashboard" className="text-sm text-muted hover:text-text">
        {t('owner.backToMyClubs')}
      </Link>
      <h1 className="mt-2 font-heading text-xl font-bold text-text">{clubName}</h1>

      <div className="no-scrollbar mt-4 flex gap-2 overflow-x-auto border-b border-border">
        {tabs.map((tabKey) => (
          <button
            key={tabKey}
            onClick={() => setTab(tabKey)}
            className={`shrink-0 whitespace-nowrap px-3 py-2 text-sm ${
              tab === tabKey ? 'border-b-2 border-accent text-accent' : 'text-muted hover:text-text'
            }`}
          >
            {t(`owner.tabs.${tabKey}`)}
          </button>
        ))}
      </div>

      <div className="mt-5">
        {tab === 'overview' && dashboard && <Overview dash={dashboard} counts={bookingCounts} />}
        {tab === 'stations' && <Stations clubId={clubId} stations={stations} reload={load} />}
        {tab === 'hours' && <Hours clubId={clubId} hours={hours} reload={load} />}
        {tab === 'pricing' && <Pricing clubId={clubId} rules={rules} reload={load} />}
        {tab === 'promotions' && (
          <Promotions clubId={clubId} promotions={promotions} reload={load} />
        )}
        {tab === 'bookings' && <Bookings api={api} clubId={clubId} />}
      </div>
    </div>
  );
}

function Overview({ dash, counts }: { dash: ClubDashboard; counts: Record<string, number> }) {
  const { t, fmt } = useI18n();
  const cells: [string, string | number][] = [
    [t('owner.overview.status'), t(`clubStatus.${dash.club.status}`)],
    [t('owner.overview.today'), dash.todayBookings],
    [t('owner.overview.upcoming'), dash.upcomingBookings],
    [t('owner.overview.completed'), dash.completedBookings],
    [t('owner.overview.cancelled'), dash.cancelledBookings],
    [t('owner.overview.occupancy'), `${dash.occupancyPercent}%`],
    [t('owner.overview.activeSeats'), `${dash.activeStations}/${dash.totalStations}`],
    [t('owner.overview.valueToday'), fmt.money(dash.grossBookingValueToday)],
    [t('owner.overview.value7d'), fmt.money(dash.grossBookingValue7d)],
  ];
  const countEntries = Object.entries(counts);
  return (
    <div className="space-y-5">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {cells.map(([label, value]) => (
          <div key={label} className="surface p-4">
            <div className="text-xs uppercase text-muted">{label}</div>
            <div className="mt-1 text-lg font-semibold text-text">{value}</div>
          </div>
        ))}
      </div>

      <div>
        <h3 className="text-sm font-semibold uppercase tracking-wide text-muted">
          {t('owner.overview.bookingsByStatus')}
        </h3>
        {countEntries.length === 0 ? (
          <p className="mt-2 text-sm text-muted">{t('owner.overview.noBookings')}</p>
        ) : (
          <div className="mt-2 grid gap-3 sm:grid-cols-3 lg:grid-cols-5">
            {countEntries.map(([status, count]) => (
              <div key={status} className="rounded-card border border-border bg-inactive p-3">
                <div className="text-xs uppercase text-muted">{t(`bookingStatus.${status}`)}</div>
                <div className="mt-1 text-base font-semibold text-text">{count}</div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function Stations({ clubId, stations, reload }: { clubId: number; stations: Station[]; reload: () => void }) {
  const api = useApi();
  const { t, fmt } = useI18n();
  const [form, setForm] = useState({ label: '', categoryKey: 'PC', pricePerHour: 25000 });
  const [error, setError] = useState<{ value: unknown } | null>(null);

  const add = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    try {
      await api.createStation(clubId, {
        label: form.label,
        categoryKey: form.categoryKey,
        pricePerHour: Number(form.pricePerHour),
      });
      setForm({ ...form, label: '' });
      reload();
    } catch (e) {
      setError({ value: e });
    }
  };

  const toggle = async (s: Station) => {
    await api.updateStation(s.id, { status: s.status === 'ACTIVE' ? 'MAINTENANCE' : 'ACTIVE' });
    reload();
  };

  return (
    <div>
      <form onSubmit={add} className="grid gap-3 surface p-4 sm:grid-cols-4">
        <input required placeholder={t('owner.stations.labelPlaceholder')} value={form.label} onChange={(e) => setForm({ ...form, label: e.target.value })} className="field" />
        <select value={form.categoryKey} onChange={(e) => setForm({ ...form, categoryKey: e.target.value })} className="field">
          {CATEGORY_KEYS.map((k) => (
            <option key={k} value={k}>{t(`categories.${k}`)}</option>
          ))}
        </select>
        <input type="number" min={0} value={form.pricePerHour} onChange={(e) => setForm({ ...form, pricePerHour: Number(e.target.value) })} className="field" />
        <button className="btn btn-primary">{t('owner.stations.addSeat')}</button>
        {error && <p className="text-sm text-red-300 sm:col-span-4">{apiErrorMessage(error.value, t, { log: false })}</p>}
      </form>

      <ul className="mt-4 divide-y divide-border">
          {stations.map((s) => (
            <li key={s.id} className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 py-2">
              <span className="min-w-0 text-text">
                {s.label}{' '}
                <span className="text-muted">
                  {s.category?.key ? t(`categories.${s.category.key}`) : ''}
                </span>
              </span>
              <span className="flex flex-wrap items-center gap-3">
                <span className="whitespace-nowrap text-muted">
                  {fmt.money(s.pricePerHour)}
                  {t('common.perHour')}
                </span>
                <span className={s.status === 'ACTIVE' ? 'text-accent' : 'text-amber-300'}>
                  {t(`stationStatus.${s.status}`)}
                </span>
                <button onClick={() => toggle(s)} className="btn btn-ghost min-h-0 px-2 py-1 text-xs">
                  {s.status === 'ACTIVE' ? t('owner.stations.disable') : t('owner.stations.enable')}
                </button>
              </span>
            </li>
          ))}
        </ul>

        <FloorPlanEditor clubId={clubId} stations={stations} onSaved={reload} />
      </div>
    );
}

function Hours({ clubId, hours, reload }: { clubId: number; hours: OperatingHours[]; reload: () => void }) {
  const api = useApi();
  const { t, fmt } = useI18n();
  const [draft, setDraft] = useState(hours);
  const [error, setError] = useState<{ value: unknown } | null>(null);

  useEffect(() => setDraft(hours), [hours]);

  const save = async () => {
    setError(null);
    try {
      await api.replaceHours(
        clubId,
        draft.map((h) => ({
          dayOfWeek: h.dayOfWeek,
          closed: h.closed,
          opensAt: h.closed ? undefined : h.opensAt ?? '10:00',
          closesAt: h.closed ? undefined : h.closesAt ?? '22:00',
        })),
      );
      reload();
    } catch (e) {
      setError({ value: e });
    }
  };

  return (
    <div className="surface p-4">
      <div className="-mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
        <table className="w-full min-w-[320px] text-sm">
          <tbody>
            {draft
              .slice()
              .sort((a, b) => a.dayOfWeek - b.dayOfWeek)
              .map((h) => (
                <tr key={h.dayOfWeek} className="border-b border-border">
                  <td className="whitespace-nowrap py-2 pr-2 text-muted">{fmt.weekday(h.dayOfWeek)}</td>
                  <td className="py-2 pr-2">
                    <input
                      type="time"
                      disabled={h.closed}
                      value={h.opensAt ?? '10:00'}
                      onChange={(e) => updateDraft(draft, setDraft, h.dayOfWeek, { opensAt: e.target.value })}
                      className="field min-h-0 w-full min-w-0 px-2 py-1 disabled:opacity-40"
                    />
                  </td>
                  <td className="py-2 pr-2">
                    <input
                      type="time"
                      disabled={h.closed}
                      value={h.closesAt ?? '22:00'}
                      onChange={(e) => updateDraft(draft, setDraft, h.dayOfWeek, { closesAt: e.target.value })}
                      className="field min-h-0 w-full min-w-0 px-2 py-1 disabled:opacity-40"
                    />
                  </td>
                  <td className="py-2 text-right">
                    <label className="inline-flex items-center gap-2 whitespace-nowrap text-muted">
                      {t('owner.hours.closed')}
                      <input
                        type="checkbox"
                        checked={h.closed}
                        onChange={(e) => updateDraft(draft, setDraft, h.dayOfWeek, { closed: e.target.checked })}
                      />
                    </label>
                  </td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>
      {error && <p className="mt-2 text-sm text-red-300">{apiErrorMessage(error.value, t, { log: false })}</p>}
      <button onClick={save} className="mt-4 btn btn-primary">
        {t('owner.hours.save')}
      </button>
      <p className="mt-2 text-xs text-muted">{t('owner.hours.overnightNote')}</p>
    </div>
  );
}

function updateDraft(
  draft: OperatingHours[],
  setDraft: (h: OperatingHours[]) => void,
  dayOfWeek: number,
  patch: Partial<OperatingHours>,
) {
  setDraft(draft.map((h) => (h.dayOfWeek === dayOfWeek ? { ...h, ...patch } : h)));
}

function Pricing({ clubId, rules, reload }: { clubId: number; rules: PricingRule[]; reload: () => void }) {
  const api = useApi();
  const { t, fmt } = useI18n();
  const [form, setForm] = useState({
    name: '',
    amount: 30000,
    unit: 'PER_HOUR' as 'PER_HOUR' | 'FLAT',
    priority: 0,
    startsAtTime: '18:00',
    endsAtTime: '23:00',
  });
  const [error, setError] = useState<{ value: unknown } | null>(null);

  const add = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    try {
      await api.createPricingRule(clubId, {
        name: form.name,
        amount: Number(form.amount),
        unit: form.unit,
        priority: Number(form.priority),
        startsAtTime: form.startsAtTime || undefined,
        endsAtTime: form.endsAtTime || undefined,
      });
      setForm({ ...form, name: '' });
      reload();
    } catch (e) {
      setError({ value: e });
    }
  };

  return (
    <div>
      <form onSubmit={add} className="grid gap-3 surface p-4 sm:grid-cols-3">
        <input required placeholder={t('owner.pricing.ruleNamePlaceholder')} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="field sm:col-span-2" />
        <input type="number" min={0} value={form.amount} onChange={(e) => setForm({ ...form, amount: Number(e.target.value) })} className="field" />
        <select value={form.unit} onChange={(e) => setForm({ ...form, unit: e.target.value as 'PER_HOUR' | 'FLAT' })} className="field">
          <option value="PER_HOUR">{t('owner.pricing.perHour')}</option>
          <option value="FLAT">{t('owner.pricing.flat')}</option>
        </select>
        <input type="number" value={form.priority} onChange={(e) => setForm({ ...form, priority: Number(e.target.value) })} className="field" />
        <button className="btn btn-primary">{t('owner.pricing.addRule')}</button>
        <input type="time" value={form.startsAtTime} onChange={(e) => setForm({ ...form, startsAtTime: e.target.value })} className="field" />
        <input type="time" value={form.endsAtTime} onChange={(e) => setForm({ ...form, endsAtTime: e.target.value })} className="field" />
        {error && <p className="text-sm text-red-300 sm:col-span-3">{apiErrorMessage(error.value, t, { log: false })}</p>}
      </form>

      <ul className="mt-4 divide-y divide-border text-sm">
        {rules.map((r) => (
          <li key={r.id} className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 py-2">
            <span className="min-w-0 text-text">
              {r.name}{' '}
              <span className="text-muted">
                {r.stationId
                  ? t('owner.pricing.stationRef', { id: r.stationId })
                  : r.categoryId
                    ? t('owner.pricing.categoryRef', { id: r.categoryId })
                    : t('owner.pricing.clubWide')}
              </span>
            </span>
            <span className="text-muted">
              {fmt.money(r.amount)}{' '}
              {r.unit === 'PER_HOUR' ? t('common.perHour') : t('owner.pricing.flat')} ·{' '}
              {t('owner.pricing.priority')} {r.priority}
              {r.startsAtTime ? ` · ${r.startsAtTime}–${r.endsAtTime}` : ''}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

const BOOKING_STATUSES = ['PENDING', 'CONFIRMED', 'COMPLETED', 'CANCELLED', 'NO_SHOW', 'EXPIRED'] as const;

function Promotions({
  clubId,
  promotions,
  reload,
}: {
  clubId: number;
  promotions: Promotion[];
  reload: () => void;
}) {
  const api = useApi();
  const { t, fmt } = useI18n();
  const [form, setForm] = useState({
    name: '',
    code: '',
    type: 'PERCENT' as PromotionType,
    value: 10,
    priority: 0,
    maxUsesTotal: 100,
    maxUsesPerUser: 1,
    active: true,
  });
  const [error, setError] = useState<{ value: unknown } | null>(null);

  const buildInput = (): CreatePromotionInput => ({
    name: form.name,
    type: form.type,
    value: Number(form.value),
    code: form.code.trim() || undefined,
    priority: Number(form.priority),
    maxUsesTotal: form.maxUsesTotal === 0 ? undefined : Number(form.maxUsesTotal),
    maxUsesPerUser: form.maxUsesPerUser === 0 ? undefined : Number(form.maxUsesPerUser),
    active: form.active,
  });

  const add = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    try {
      await api.createPromotion(clubId, buildInput());
      setForm({ ...form, name: '', code: '' });
      reload();
    } catch (e) {
      setError({ value: e });
    }
  };

  const act = async (fn: () => Promise<unknown>) => {
    setError(null);
    try {
      await fn();
      reload();
    } catch (e) {
      setError({ value: e });
    }
  };

  const summary = (p: Promotion) =>
    p.type === 'PERCENT'
      ? t('promotions.percent', { value: p.value })
      : t('promotions.flat', { value: fmt.money(p.value) });

  return (
    <div>
      <form
        onSubmit={add}
        className="grid gap-3 surface p-4 sm:grid-cols-3"
      >
        <input
          required
          placeholder={t('promotions.namePlaceholder')}
          value={form.name}
          onChange={(e) => setForm({ ...form, name: e.target.value })}
          className="field"
        />
        <input
          placeholder={t('promotions.codeOptional')}
          value={form.code}
          onChange={(e) => setForm({ ...form, code: e.target.value })}
          className="field"
        />
        <select
          value={form.type}
          onChange={(e) => setForm({ ...form, type: e.target.value as PromotionType })}
          className="field"
        >
          <option value="PERCENT">{t('promotions.typePercent')}</option>
          <option value="FLAT">{t('promotions.typeFlat')}</option>
        </select>
        <input
          type="number"
          min={1}
          max={form.type === 'PERCENT' ? 100 : undefined}
          value={form.value}
          onChange={(e) => setForm({ ...form, value: Number(e.target.value) })}
          className="field"
        />
        <input
          type="number"
          value={form.priority}
          onChange={(e) => setForm({ ...form, priority: Number(e.target.value) })}
          className="field"
        />
        <input
          type="number"
          min={0}
          placeholder={t('promotions.maxUsesTotal')}
          value={form.maxUsesTotal}
          onChange={(e) => setForm({ ...form, maxUsesTotal: Number(e.target.value) })}
          className="field"
        />
        <input
          type="number"
          min={0}
          placeholder={t('promotions.maxUsesPerUser')}
          value={form.maxUsesPerUser}
          onChange={(e) => setForm({ ...form, maxUsesPerUser: Number(e.target.value) })}
          className="field"
        />
        <label className="flex items-center gap-2 px-1 text-sm text-muted">
          <input
            type="checkbox"
            checked={form.active}
            onChange={(e) => setForm({ ...form, active: e.target.checked })}
          />
          {t('promotions.activeLabel')}
        </label>
        <button className="btn btn-primary">
          {t('promotions.addPromotion')}
        </button>
        {error && (
          <p className="text-sm text-red-300 sm:col-span-3">{apiErrorMessage(error.value, t, { log: false })}</p>
        )}
      </form>

      <ul className="mt-4 divide-y divide-border text-sm">
        {promotions.length === 0 && <li className="py-3 text-muted">{t('promotions.noManage')}</li>}
        {promotions.map((p) => (
          <li key={p.id} className="flex flex-wrap items-center justify-between gap-2 py-3">
            <div>
              <div className="text-text">
                {p.name}{' '}
                <span className="font-mono text-muted">{p.code ?? '—'}</span>
              </div>
              <div className="text-muted">
                {summary(p)} · {t('promotions.uses', { count: p.redemptionCount ?? 0 })} ·{' '}
                {t('promotions.priority')} {p.priority}
              </div>
            </div>
            <div className="flex items-center gap-2">
              <span className={p.active ? 'text-accent' : 'text-muted'}>
                {p.active ? t('promotions.active') : t('promotions.inactive')}
              </span>
              <button
                onClick={() => act(() => api.setPromotionActive(clubId, p.id, !p.active))}
                className="btn btn-ghost min-h-0 px-2 py-1 text-xs"
              >
                {p.active ? t('promotions.deactivate') : t('promotions.activate')}
              </button>
              <button
                onClick={() => act(() => api.deletePromotion(clubId, p.id))}
                className="rounded-control bg-red-600/60 px-2 py-1 text-xs hover:bg-red-600"
              >
                {t('promotions.delete')}
              </button>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

function Bookings({ api, clubId }: { api: ReturnType<typeof useApi>; clubId: number }) {
  const { t, tp, fmt } = useI18n();
  const [items, setItems] = useState<Booking[]>([]);
  const [total, setTotal] = useState(0);
  const [status, setStatus] = useState('');
  const [date, setDate] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<{ value: unknown } | null>(null);

  const fetchList = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.clubBookings(clubId, {
        status: status || undefined,
        date: date || undefined,
        size: 50,
      });
      setItems(res.items);
      setTotal(res.total);
    } catch (e) {
      setError({ value: e });
    } finally {
      setLoading(false);
    }
  }, [api, clubId, status, date]);

  useEffect(() => {
    void fetchList();
  }, [fetchList]);

  const act = async (fn: () => Promise<unknown>) => {
    setError(null);
    try {
      await fn();
      await fetchList();
    } catch (e) {
      setError({ value: e });
    }
  };

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-end gap-3">
        <label className="text-sm text-muted">
          <span className="mr-2">{t('owner.bookings.filterStatus')}</span>
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value)}
            className="field min-h-0 py-1.5"
          >
            <option value="">{t('common.all')}</option>
            {BOOKING_STATUSES.map((s) => (
              <option key={s} value={s}>
                {t(`bookingStatus.${s}`)}
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm text-muted">
          <span className="mr-2">{t('owner.bookings.filterDate')}</span>
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="field min-h-0 py-1.5"
          />
        </label>
        {(status || date) && (
          <button
            type="button"
            onClick={() => {
              setStatus('');
              setDate('');
            }}
            className="btn btn-ghost min-h-0 py-1.5 text-sm"
          >
            {t('owner.bookings.clear')}
          </button>
        )}
        <span className="text-sm text-muted">{tp('owner.bookings.totalCount', total)}</span>
        {loading && <span className="text-sm text-muted">{t('common.loading')}</span>}
      </div>

      {error && <p className="mb-3 text-sm text-red-300">{apiErrorMessage(error.value, t, { log: false })}</p>}

      <ul className="divide-y divide-border text-sm">
        {!loading && items.length === 0 && <li className="py-3 text-muted">{t('owner.bookings.noMatch')}</li>}
        {items.map((b) => (
          <li key={b.id} className="flex flex-wrap items-center justify-between gap-2 py-3">
            <div>
              <div className="text-text">
                {b.customerName ?? t('owner.bookings.userFallback', { id: b.userId })} ·{' '}
                {b.stationLabel ?? `#${b.stationId}`}
              </div>
              <div className="text-muted">
                {fmt.time(b.startsAt, b.timezone ?? 'Asia/Tashkent')}–
                {fmt.time(b.endsAt, b.timezone ?? 'Asia/Tashkent')} · {b.reference}
              </div>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-muted">{t(`bookingStatus.${b.status}`)}</span>
              {b.status === 'PENDING' && (
                <button onClick={() => act(() => api.setBookingStatus(b.id, 'CONFIRMED'))} className="btn btn-primary min-h-0 px-2 py-1 text-xs">
                  {t('owner.bookings.confirm')}
                </button>
              )}
              {(b.status === 'CONFIRMED' || b.status === 'PENDING') && (
                <>
                  <button onClick={() => act(() => api.checkInBooking(b.id))} className="btn btn-ghost min-h-0 px-2 py-1 text-xs">
                    {t('owner.bookings.checkIn')}
                  </button>
                  <button onClick={() => act(() => api.setBookingStatus(b.id, 'NO_SHOW'))} className="btn btn-ghost min-h-0 px-2 py-1 text-xs">
                    {t('owner.bookings.noShow')}
                  </button>
                </>
              )}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

export default function ManageClubPage() {
  return (
    <Protected roles={['CLUB_OWNER', 'ADMIN', 'STAFF']}>
      <ManageInner />
    </Protected>
  );
}

