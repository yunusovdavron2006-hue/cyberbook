'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import type { ClubSummary } from '@cyberbook/api-client';
import { useI18n } from '@/lib/i18n/context';
import { TILE_SIZE, clampZoom, fitBounds, isValidCoord, project, unproject } from '@/lib/geo';

interface Props {
  clubs: ClubSummary[];
  activeId?: number | null;
  onSelect?: (club: ClubSummary) => void;
}

const OSM_TILE = (z: number, x: number, y: number) => `https://tile.openstreetmap.org/${z}/${x}/${y}.png`;

export function ClubMap({ clubs, activeId, onSelect }: Props) {
  const { t } = useI18n();
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  const [center, setCenter] = useState({ lat: 41.311081, lng: 69.240562 });
  const [zoom, setZoom] = useState(11);
  const zoomRef = useRef(zoom);
  zoomRef.current = zoom;

  const dragRef = useRef<{ x: number; y: number } | null>(null);
  const fittedKey = useRef<string | null>(null);
  const [tileErrors, setTileErrors] = useState(0);
  const [dragging, setDragging] = useState(false);

  const mappable = useMemo(
    () => clubs.filter((c) => isValidCoord({ lat: c.latitude, lng: c.longitude })),
    [clubs],
  );
  const clubsKey = useMemo(() => mappable.map((c) => c.id).join(','), [mappable]);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const measure = () => setSize({ w: el.clientWidth, h: el.clientHeight });
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!size.w || !size.h) return;
    // Re-fit whenever the club set changes *or* the viewport is resized, so
    // markers never end up off-screen after an orientation change.
    const fitKey = `${clubsKey}|${Math.round(size.w)}x${Math.round(size.h)}`;
    if (fittedKey.current === fitKey) return;
    const pts = mappable.map((c) => ({ lat: c.latitude, lng: c.longitude }));
    const fitted = fitBounds(pts, size.w, size.h);
    setCenter(fitted.center);
    setZoom(fitted.zoom);
    fittedKey.current = fitKey;
  }, [clubsKey, size.w, size.h, mappable]);

  const centerPx = project(center.lat, center.lng, zoom);
  const topLeftX = centerPx.x - size.w / 2;
  const topLeftY = centerPx.y - size.h / 2;

  const tiles = useMemo(() => {
    if (!size.w || !size.h) return [];
    const n = Math.pow(2, zoom);
    const minX = Math.floor(topLeftX / TILE_SIZE);
    const maxX = Math.floor((topLeftX + size.w) / TILE_SIZE);
    const minY = Math.max(0, Math.floor(topLeftY / TILE_SIZE));
    const maxY = Math.min(n - 1, Math.floor((topLeftY + size.h) / TILE_SIZE));
    const out: { key: string; url: string; left: number; top: number }[] = [];
    for (let y = minY; y <= maxY; y++) {
      for (let x = minX; x <= maxX; x++) {
        const wrapped = ((x % n) + n) % n;
        out.push({
          key: `${zoom}/${x}/${y}`,
          url: OSM_TILE(zoom, wrapped, y),
          left: x * TILE_SIZE - topLeftX,
          top: y * TILE_SIZE - topLeftY,
        });
      }
    }
    return out;
  }, [zoom, size.w, size.h, topLeftX, topLeftY]);

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    dragRef.current = { x: e.clientX, y: e.clientY };
    setDragging(true);
    e.currentTarget.setPointerCapture(e.pointerId);
  };
  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const last = dragRef.current;
    if (!last) return;
    const dx = e.clientX - last.x;
    const dy = e.clientY - last.y;
    dragRef.current = { x: e.clientX, y: e.clientY };
    setCenter((prev) => {
      const p = project(prev.lat, prev.lng, zoomRef.current);
      return unproject(p.x - dx, p.y - dy, zoomRef.current);
    });
  };
  const endDrag = () => {
    dragRef.current = null;
    setDragging(false);
  };

  const zoomBy = (delta: number) => setZoom((z) => clampZoom(z + delta));

  return (
    <div className="relative overflow-hidden rounded-lg border border-white/10 bg-slate-900">
      <div
        ref={containerRef}
        className={`relative h-[clamp(280px,60vh,520px)] w-full cursor-grab select-none active:cursor-grabbing sm:h-[420px] ${
          dragging ? 'touch-none' : 'touch-pan-y'
        }`}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerLeave={endDrag}
        onPointerCancel={endDrag}
      >
        {tiles.map((tile) => (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            key={tile.key}
            src={tile.url}
            alt=""
            draggable={false}
            onError={() => setTileErrors((n) => (n < 1 ? n + 1 : n))}
            className="pointer-events-none absolute select-none"
            style={{ left: tile.left, top: tile.top, width: TILE_SIZE, height: TILE_SIZE }}
          />
        ))}

        {tiles.length > 0 &&
          mappable.map((club) => {
            const p = project(club.latitude, club.longitude, zoom);
            const left = p.x - topLeftX;
            const top = p.y - topLeftY;
            if (left < -24 || top < -24 || left > size.w + 24 || top > size.h + 24) return null;
            const active = activeId === club.id;
            return (
              <button
                key={club.id}
                type="button"
                onPointerDown={(e) => e.stopPropagation()}
                onClick={() => onSelect?.(club)}
                title={club.name}
                className={`absolute z-10 max-w-[9rem] -translate-x-1/2 -translate-y-full truncate rounded-full border px-2 py-1 text-xs font-semibold shadow ${
                  active
                    ? 'border-brand-300 bg-brand-500 text-white'
                    : 'border-black/30 bg-white/95 text-slate-900 hover:bg-white'
                }`}
                style={{ left, top }}
              >
                {club.name}
                <span className="absolute left-1/2 top-full h-2 w-0.5 -translate-x-1/2 bg-black/40" />
              </button>
            );
          })}

        <div className="absolute right-2 top-2 z-10 flex flex-col rounded border border-white/20 bg-black/60">
          <button
            type="button"
            onClick={() => zoomBy(1)}
            className="btn-sm grid h-9 w-9 place-items-center rounded-t text-white hover:bg-white/10"
            aria-label={t('clubs.zoomIn')}
          >
            +
          </button>
          <button
            type="button"
            onClick={() => zoomBy(-1)}
            className="btn-sm grid h-9 w-9 place-items-center rounded-b border-t border-white/20 text-white hover:bg-white/10"
            aria-label={t('clubs.zoomOut')}
          >
            −
          </button>
        </div>

        <div className="pointer-events-none absolute bottom-0 right-0 z-10 bg-black/50 px-1 text-[11px] text-white/80">
          © OpenStreetMap contributors
        </div>

        {tileErrors > 0 && tiles.length > 0 && mappable.length > 0 && (
          <div className="absolute left-2 top-2 z-10 max-w-[calc(100%-7rem)] rounded bg-black/60 px-2 py-1 text-[11px] text-amber-200">
            {t('clubs.mapTilesError')}
          </div>
        )}
      </div>

      {mappable.length === 0 && (
        <div
          role="status"
          className="absolute inset-0 z-20 flex items-center justify-center bg-slate-900/80 px-4 text-center text-sm text-gray-300"
        >
          {t('clubs.mapEmpty')}
        </div>
      )}
    </div>
  );
}
