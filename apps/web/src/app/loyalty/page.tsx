'use client';

import { useCallback, useEffect, useState } from 'react';
import type {
  ApplyReferralResult,
  LoyaltyAccount,
  LoyaltyLedgerEntry,
  LoyaltyLedgerPage,
  RedeemResult,
  ReferralListItem,
  ReferralSummary,
} from '@cyberbook/api-client';
import { useApi } from '@/lib/auth-context';
import { Protected } from '@/components/Protected';
import { useI18n } from '@/lib/i18n/context';
import { apiErrorMessage } from '@/lib/i18n/errors';

type LedgerEntry = LoyaltyLedgerEntry;

function LoyaltyInner() {
  const api = useApi();
  const { t, fmt } = useI18n();

  const [account, setAccount] = useState<LoyaltyAccount | null>(null);
  const [ledger, setLedger] = useState<LoyaltyLedgerPage | null>(null);
  const [referral, setReferral] = useState<ReferralSummary | null>(null);
  const [referrals, setReferrals] = useState<ReferralListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<{ value: unknown } | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [formError, setFormError] = useState<{ value: unknown } | null>(null);

  const [redeemPoints, setRedeemPoints] = useState('');
  const [redeeming, setRedeeming] = useState(false);
  const [friendCode, setFriendCode] = useState('');
  const [applying, setApplying] = useState(false);
  const [copied, setCopied] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [acc, page, ref, list] = await Promise.all([
        api.loyaltyAccount(),
        api.loyaltyLedger({ size: 8 }),
        api.myReferral(),
        api.listReferrals(),
      ]);
      setAccount(acc);
      setLedger(page);
      setReferral(ref);
      setReferrals(list);
    } catch (e) {
      setError({ value: e });
    } finally {
      setLoading(false);
    }
  }, [api]);

  useEffect(() => {
    void load();
  }, [load]);

  const doRedeem = async () => {
    const points = Number.parseInt(redeemPoints, 10);
    setFormError(null);
    setNotice(null);
    if (!Number.isFinite(points) || points <= 0) return;
    setRedeeming(true);
    try {
      const res: RedeemResult = await api.redeemPoints({ points });
      setNotice(t('loyalty.redeemSuccess', {
        points: res.pointsSpent,
        value: fmt.money(res.valueUzs),
      }));
      setRedeemPoints('');
      await load();
    } catch (e) {
      setFormError({ value: e });
    } finally {
      setRedeeming(false);
    }
  };

  const doApplyCode = async () => {
    const code = friendCode.trim();
    setFormError(null);
    setNotice(null);
    if (!code) return;
    setApplying(true);
    try {
      const res: ApplyReferralResult = await api.applyReferral(code);
      setNotice(t('loyalty.applySuccess', { points: res.refereeBonusPoints }));
      setFriendCode('');
      await load();
    } catch (e) {
      setFormError({ value: e });
    } finally {
      setApplying(false);
    }
  };

  const copy = async (value: string) => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      setCopied(false);
    }
  };

  const entryTypeLabel = (type: LedgerEntry['type']) => {
    const key = `loyalty.entryType.${type}`;
    const label = t(key);
    return label === key ? type : label;
  };

  const statusLabel = (status: ReferralListItem['status']) => {
    const key = `loyalty.referralStatus.${status}`;
    const label = t(key);
    return label === key ? status : label;
  };

  const tierLabel = (tier: LoyaltyAccount['tier']) => {
    const key = `loyalty.tierNames.${tier}`;
    const label = t(key);
    return label === key ? tier : label;
  };

  if (loading) return <p className="text-muted">{t('common.loading')}</p>;

  return (
    <div className="space-y-8">
      <div>
        <h1 className="font-heading text-xl font-bold text-text">{t('loyalty.title')}</h1>
        {error && (
          <p className="mt-2 text-sm text-red-300">{apiErrorMessage(error.value, t, { log: false })}</p>
        )}
      </div>

      {account && (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div className="surface p-4">
            <div className="text-xs uppercase tracking-wide text-muted">{t('loyalty.balance')}</div>
            <div className="mt-1 text-2xl font-semibold text-text">{account.balance}</div>
          </div>
          <div className="surface p-4">
            <div className="text-xs uppercase tracking-wide text-muted">{t('loyalty.tier')}</div>
            <div className="mt-1 text-2xl font-semibold text-text">{tierLabel(account.tier)}</div>
          </div>
          <div className="surface p-4">
            <div className="text-xs uppercase tracking-wide text-muted">{t('loyalty.value')}</div>
            <div className="mt-1 text-2xl font-semibold text-text">{fmt.money(account.valueUzs)}</div>
          </div>
          <div className="surface p-4">
            <div className="text-xs uppercase tracking-wide text-muted">{t('loyalty.earnRate')}</div>
            <div className="mt-1 text-2xl font-semibold text-text">{account.earnRate}</div>
          </div>
        </div>
      )}

      {notice && <p className="text-sm text-accent">{notice}</p>}
      {formError && (
        <p className="text-sm text-red-300">{apiErrorMessage(formError.value, t, { log: false })}</p>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        <section className="surface p-4">
          <h2 className="font-heading text-lg font-bold text-text">{t('loyalty.redeem')}</h2>
          <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-end">
            <label className="flex-1">
              <span className="text-xs text-muted">{t('loyalty.redeemPoints')}</span>
              <input
                value={redeemPoints}
                onChange={(e) => setRedeemPoints(e.target.value)}
                inputMode="numeric"
                placeholder="500"
                className="field mt-1"
              />
            </label>
            <button
              type="button"
              onClick={doRedeem}
              disabled={redeeming || !redeemPoints.trim()}
              className="btn btn-primary disabled:opacity-50"
            >
              {redeeming ? t('common.loading') : t('loyalty.redeemButton')}
            </button>
          </div>
          <p className="mt-2 text-xs text-muted">{t('loyalty.insufficient')}</p>
        </section>

        <section className="surface p-4">
          <h2 className="font-heading text-lg font-bold text-text">{t('loyalty.referral')}</h2>
          {referral ? (
            <div className="mt-3 space-y-3">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <div className="text-xs text-muted">{t('loyalty.referralCode')}</div>
                  <div className="font-mono text-lg text-text">{referral.code}</div>
                </div>
                <div className="text-right text-sm text-muted">
                  <div>{t('loyalty.invited')}: {referral.invited}</div>
                  <div>{t('loyalty.rewarded')}: {referral.rewarded}</div>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => copy(referral.shareUrl)}
                  className="btn btn-ghost min-h-0 px-3 py-1 text-sm"
                >
                  {copied ? t('loyalty.copied') : t('loyalty.copy')}
                </button>
                <button
                  type="button"
                  onClick={() => copy(referral.code)}
                  className="btn btn-ghost min-h-0 px-3 py-1 text-sm"
                >
                  {t('loyalty.referralCode')}
                </button>
              </div>
            </div>
          ) : (
            <p className="mt-3 text-sm text-muted">{t('loyalty.loadFailed')}</p>
          )}

          <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:items-end">
            <label className="flex-1">
              <span className="text-xs text-muted">{t('loyalty.applyCode')}</span>
              <input
                value={friendCode}
                onChange={(e) => setFriendCode(e.target.value)}
                placeholder={t('loyalty.applyPlaceholder')}
                className="field mt-1"
              />
            </label>
            <button
              type="button"
              onClick={doApplyCode}
              disabled={applying || !friendCode.trim()}
              className="btn btn-ghost disabled:opacity-50"
            >
              {applying ? t('common.loading') : t('loyalty.applyButton')}
            </button>
          </div>
        </section>
      </div>

      <section className="surface p-4">
        <h2 className="font-heading text-lg font-bold text-text">{t('loyalty.referrals')}</h2>
        {referrals.length === 0 ? (
          <p className="mt-3 text-sm text-muted">{t('loyalty.noReferrals')}</p>
        ) : (
          <ul className="mt-3 space-y-2 text-sm">
            {referrals.map((r) => (
              <li key={r.id} className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 border-b border-border pb-2">
                <span className="min-w-0 text-muted">{r.referredName || `#${r.id}`}</span>
                <span className="text-muted">{fmt.date(r.createdAt, 'Asia/Tashkent')}</span>
                <span className="text-muted">{statusLabel(r.status)}</span>
                <span className="text-accent">+{r.rewardPoints}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="surface p-4">
        <h2 className="font-heading text-lg font-bold text-text">{t('loyalty.recent')}</h2>
        {!ledger || ledger.items.length === 0 ? (
          <p className="mt-3 text-sm text-muted">{t('loyalty.noEntries')}</p>
        ) : (
          <ul className="mt-3 space-y-2 text-sm">
            {ledger.items.map((e) => (
              <li key={e.id} className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 border-b border-border pb-2">
                <span className="min-w-0 text-muted">{entryTypeLabel(e.type)}</span>
                <span className="text-muted">{fmt.date(e.createdAt, 'Asia/Tashkent')}</span>
                <span className="text-muted">{e.reason}</span>
                <span className={e.points >= 0 ? 'text-accent' : 'text-red-300'}>
                  {e.points >= 0 ? `+${e.points}` : e.points}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

export default function LoyaltyPage() {
  return (
    <Protected>
      <LoyaltyInner />
    </Protected>
  );
}


