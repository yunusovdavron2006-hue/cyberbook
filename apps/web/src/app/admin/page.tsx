'use client';

import { useCallback, useEffect, useState } from 'react';
import type {
  AdminClub,
  AdminStats,
  AdminUserSummary,
  Role,
  SupportTicket,
  TicketStatus,
} from '@cyberbook/api-client';
import { useApi } from '@/lib/auth-context';
import { Protected } from '@/components/Protected';
import { useI18n } from '@/lib/i18n/context';
import { apiErrorMessage } from '@/lib/i18n/errors';

type Tab = 'stats' | 'clubs' | 'users' | 'tickets';
const ROLES: Role[] = ['USER', 'CLUB_OWNER', 'STAFF', 'ADMIN'];
const TICKET_STATUSES: TicketStatus[] = ['OPEN', 'IN_PROGRESS', 'RESOLVED', 'CLOSED'];

function AdminInner() {
  const api = useApi();
  const { t, fmt } = useI18n();
  const [tab, setTab] = useState<Tab>('stats');
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [clubs, setClubs] = useState<AdminClub[]>([]);
  const [users, setUsers] = useState<AdminUserSummary[]>([]);
  const [tickets, setTickets] = useState<SupportTicket[]>([]);
  const [error, setError] = useState<{ value: unknown } | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const [s, c, u, tk] = await Promise.all([
        api.adminStats(),
        api.adminClubs({ size: 50 }),
        api.adminUsers({ size: 50 }),
        api.adminTickets({ size: 50 }),
      ]);
      setStats(s);
      setClubs(c.items);
      setUsers(u.items);
      setTickets(tk.items);
    } catch (e) {
      setError({ value: e });
    }
  }, [api]);

  useEffect(() => {
    void load();
  }, [load]);

  const act = async (fn: () => Promise<unknown>) => {
    setError(null);
    try {
      await fn();
      await load();
    } catch (e) {
      setError({ value: e });
    }
  };

  const tabs: Tab[] = ['stats', 'clubs', 'users', 'tickets'];

  return (
    <div>
      <h1 className="font-heading text-xl font-bold text-text">{t('admin.title')}</h1>
      {error && <p className="mt-2 text-sm text-red-300">{apiErrorMessage(error.value, t, { log: false })}</p>}

      <div className="no-scrollbar mt-4 flex gap-2 overflow-x-auto border-b border-border">
        {tabs.map((tabKey) => (
          <button
            key={tabKey}
            onClick={() => setTab(tabKey)}
            className={`shrink-0 whitespace-nowrap px-3 py-2 text-sm ${
              tab === tabKey ? 'border-b-2 border-accent text-accent' : 'text-muted hover:text-text'
            }`}
          >
            {t(`admin.tabs.${tabKey}`)}
          </button>
        ))}
      </div>

      <div className="mt-5">
        {tab === 'stats' && stats && (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {[
              [t('admin.stats.users'), stats.users],
              [t('admin.stats.clubOwners'), stats.clubOwners],
              [t('admin.stats.pendingApprovals'), stats.pendingClubApprovals],
              [t('admin.stats.bookingsToday'), stats.bookingsToday],
              [t('admin.stats.bookingsTotal'), stats.bookingsTotal],
              [t('admin.stats.grossVolume'), fmt.money(stats.grossBookingVolume)],
              [t('admin.stats.openTickets'), stats.openSupportTickets],
            ].map(([label, value]) => (
              <div key={String(label)} className="surface p-4">
                <div className="text-xs uppercase text-muted">{label}</div>
                <div className="mt-1 text-lg font-semibold text-text">{value}</div>
              </div>
            ))}
          </div>
        )}

        {tab === 'clubs' && (
          <ul className="divide-y divide-border text-sm">
            {clubs.map((c) => (
              <li key={c.id} className="flex flex-wrap items-center justify-between gap-2 py-3">
                <div>
                  <div className="text-text">{c.name}</div>
                  <div className="text-muted">
                    {c.city} · {t('admin.clubs.owner')} {c.owner?.email ?? '—'} ·{' '}
                    <span className="text-muted">{t(`clubStatus.${c.status}`)}</span>
                  </div>
                </div>
                <div className="flex gap-2">
                  {(c.status === 'PENDING' || c.status === 'SUSPENDED') && (
                    <button onClick={() => act(() => api.adminApproveClub(c.id))} className="btn btn-primary min-h-0 px-2 py-1 text-xs">
                      {t('admin.clubs.approve')}
                    </button>
                  )}
                  {c.status === 'PENDING' && (
                    <button onClick={() => act(() => api.adminRejectClub(c.id, 'Does not meet requirements'))} className="rounded bg-red-600/60 px-2 py-1 text-xs hover:bg-red-600">
                      {t('admin.clubs.reject')}
                    </button>
                  )}
                  {c.status === 'APPROVED' && (
                    <button onClick={() => act(() => api.adminSuspendClub(c.id, 'Policy review'))} className="btn btn-ghost min-h-0 px-2 py-1 text-xs">
                      {t('admin.clubs.suspend')}
                    </button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}

        {tab === 'users' && (
          <ul className="divide-y divide-border text-sm">
            {users.map((u) => (
              <li key={u.id} className="flex flex-wrap items-center justify-between gap-2 py-3">
                <div>
                  <div className="text-text">{u.profile?.displayName ?? u.email}</div>
                  <div className="text-muted">{u.email} · {u.status}</div>
                </div>
                <div className="flex items-center gap-2">
                  <select
                    value={u.role}
                    onChange={(e) => act(() => api.adminSetUserRole(u.id, e.target.value as Role))}
                    className="field min-h-0 px-2 py-1"
                  >
                    {ROLES.map((r) => (
                      <option key={r} value={r}>{t(`roles.${r}`)}</option>
                    ))}
                  </select>
                  <button
                    onClick={() => act(() => api.adminSetUserStatus(u.id, u.status === 'ACTIVE' ? 'BLOCKED' : 'ACTIVE'))}
                    className="btn btn-ghost min-h-0 px-2 py-1 text-xs"
                  >
                    {u.status === 'ACTIVE' ? t('admin.users.block') : t('admin.users.unblock')}
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}

        {tab === 'tickets' && (
          <ul className="divide-y divide-border text-sm">
            {tickets.length === 0 && <li className="py-3 text-muted">{t('admin.tickets.none')}</li>}
            {tickets.map((ticket) => (
              <li key={ticket.id} className="flex flex-wrap items-center justify-between gap-2 py-3">
                <div>
                  <div className="text-text">{ticket.subject}</div>
                  <div className="text-muted">{ticket.user?.email ?? '—'}</div>
                </div>
                <select
                  value={ticket.status}
                  onChange={(e) => act(() => api.adminSetTicketStatus(ticket.id, e.target.value as TicketStatus))}
                  className="field min-h-0 px-2 py-1"
                >
                  {TICKET_STATUSES.map((s) => (
                    <option key={s} value={s}>{t(`ticketStatus.${s}`)}</option>
                  ))}
                </select>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

export default function AdminPage() {
  return (
    <Protected roles={['ADMIN']}>
      <AdminInner />
    </Protected>
  );
}

