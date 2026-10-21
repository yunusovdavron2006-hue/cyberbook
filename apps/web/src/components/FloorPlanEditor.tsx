'use client';

import { useEffect, useMemo, useState } from 'react';
import { readStationLayout, type Station } from '@cyberbook/api-client';
import { useApi } from '@/lib/auth-context';
import { useI18n } from '@/lib/i18n/context';
import { apiErrorMessage } from '@/lib/i18n/errors';

interface Row {
  zone: string;
  mapX: string;
  mapY: string;
}

const ZONES = ['STANDARD', 'VIP', 'BOOTCAMP', 'CONSOLE'];

/**
 * Owner editor for the 2D floor plan. Coordinates are stored inside each
 * station's free-form `specs` JSON, so no schema change is required. Empty
 * coordinates mean "not placed"; the customer floor plan then falls back to a
 * simple grid.
 */
export function FloorPlanEditor(props: { clubId: number; stations: Station[]; onSaved?: () => void }) {
  const api = useApi();
  const { t } = useI18n();
  const [rows, setRows] = useState<Record<number, Row>>({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<{ value: unknown } | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    const next: Record<number, Row> = {};
    for (const s of props.stations) {
      const l = readStationLayout(s);
      next[s.id] = {
        zone: l.zone ?? '',
        mapX: l.mapX === null ? '' : String(l.mapX),
        mapY: l.mapY === null ? '' : String(l.mapY),
      };
    }
    setRows(next);
  }, [props.stations]);

  const intOrUndef = (v: string) => {
    const n = Number(v);
    return v.trim() !== '' && Number.isInteger(n) && n >= 0 ? n : undefined;
  };

  const items = useMemo(
    () =>
      props.stations.map((s) => {
        const r = rows[s.id];
        return {
          stationId: s.id,
          zone: r?.zone.trim() ? r.zone.trim() : undefined,
          mapX: r ? intOrUndef(r.mapX) : undefined,
          mapY: r ? intOrUndef(r.mapY) : undefined,
        };
      }),
    [props.stations, rows],
  );

  const save = async () => {
    setSaving(true);
    setError(null);
    setSaved(false);
    try {
      await api.updateStationLayout(props.clubId, items);
      setSaved(true);
      props.onSaved?.();
    } catch (e) {
      setError({ value: e });
    } finally {
      setSaving(false);
    }
  };

  const update = (id: number, patch: Partial<Row>) =>
    setRows((prev) => ({ ...prev, [id]: { ...(prev[id] ?? { zone: '', mapX: '', mapY: '' }), ...patch } }));

  return (
    <div className="surface mt-4 p-4">
      <h3 className="font-heading text-base font-bold text-text">{t('owner.floorPlan.title')}</h3>
      <p className="mt-1 text-xs text-muted">{t('owner.floorPlan.hint')}</p>

      <div className="mt-3 overflow-x-auto">
        <table className="w-full min-w-[420px] text-sm">
          <thead>
            <tr className="text-left text-xs uppercase text-muted">
              <th className="py-1 pr-2">{t('owner.floorPlan.seat')}</th>
              <th className="py-1 pr-2">{t('owner.floorPlan.zone')}</th>
              <th className="py-1 pr-2">X</th>
              <th className="py-1 pr-2">Y</th>
            </tr>
          </thead>
          <tbody>
            {props.stations.map((s) => {
              const r = rows[s.id] ?? { zone: '', mapX: '', mapY: '' };
              return (
                <tr key={s.id} className="border-t border-border">
                  <td className="min-w-0 py-2 pr-2 text-text">{s.label}</td>
                  <td className="py-2 pr-2">
                    <select
                      value={r.zone}
                      onChange={(e) => update(s.id, { zone: e.target.value })}
                      className="field min-h-0 py-1"
                      aria-label={`${s.label} ${t('owner.floorPlan.zone')}`}
                    >
                      <option value="">—</option>
                      {ZONES.map((z) => (
                        <option key={z} value={z}>
                          {z}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="py-2 pr-2">
                    <input
                      type="number"
                      min={0}
                      value={r.mapX}
                      onChange={(e) => update(s.id, { mapX: e.target.value })}
                      className="field min-h-0 w-20 py-1"
                      aria-label={`${s.label} X`}
                    />
                  </td>
                  <td className="py-2 pr-2">
                    <input
                      type="number"
                      min={0}
                      value={r.mapY}
                      onChange={(e) => update(s.id, { mapY: e.target.value })}
                      className="field min-h-0 w-20 py-1"
                      aria-label={`${s.label} Y`}
                    />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {error && <p className="mt-2 text-sm text-red-300">{apiErrorMessage(error.value, t, { log: false })}</p>}
      {saved && !error && <p className="mt-2 text-sm text-accent">{t('owner.floorPlan.saved')}</p>}

      <button onClick={save} disabled={saving} className="btn btn-primary mt-3">
        {saving ? t('common.loading') : t('owner.floorPlan.save')}
      </button>
    </div>
  );
}
