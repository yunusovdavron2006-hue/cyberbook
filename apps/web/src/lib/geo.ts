// Minimal Web Mercator helpers used by the dependency-free map component.
export interface LatLng {
  lat: number;
  lng: number;
}

export const TILE_SIZE = 256;
export const MIN_ZOOM = 3;
export const MAX_ZOOM = 18;

export function clampZoom(zoom: number): number {
  return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, zoom));
}

/** Project a coordinate into normalized world pixels (tile units) at a zoom. */
export function project(lat: number, lng: number, zoom: number): { x: number; y: number } {
  const scale = TILE_SIZE * Math.pow(2, zoom);
  const sin = Math.sin((lat * Math.PI) / 180);
  const x = ((lng + 180) / 360) * scale;
  const y = (0.5 - Math.log((1 + sin) / (1 - sin)) / (4 * Math.PI)) * scale;
  return { x, y };
}

/** Inverse of {@link project}. */
export function unproject(x: number, y: number, zoom: number): LatLng {
  const scale = TILE_SIZE * Math.pow(2, zoom);
  const lng = (x / scale) * 360 - 180;
  const n = Math.PI - (2 * Math.PI * y) / scale;
  const lat = (180 / Math.PI) * Math.atan(0.5 * (Math.exp(n) - Math.exp(-n)));
  return { lat, lng };
}

export function isValidCoord(c: Partial<LatLng> | null | undefined): boolean {
  return (
    !!c &&
    typeof c.lat === 'number' &&
    typeof c.lng === 'number' &&
    Number.isFinite(c.lat) &&
    Number.isFinite(c.lng) &&
    c.lat >= -85 &&
    c.lat <= 85 &&
    c.lng >= -180 &&
    c.lng <= 180 &&
    !(c.lat === 0 && c.lng === 0)
  );
}

/**
 * Choose a center and zoom so all provided points fit in a viewport of the
 * given pixel size.
 */
export function fitBounds(
  points: LatLng[],
  width: number,
  height: number,
  padding?: number,
): { center: LatLng; zoom: number } {
  if (points.length === 0) {
    return { center: { lat: 41.311081, lng: 69.240562 }, zoom: 11 };
  }
  // Scale the padding down on small viewports so a narrow phone map does not
  // lose most of its usable area to the margin.
  const pad = padding ?? Math.min(48, Math.round(width * 0.12));
  if (points.length === 1) {
    const single = clampZoom(Math.round(Math.log2(Math.max(1, width / 64))));
    return { center: points[0], zoom: single };
  }
  const lats = points.map((p) => p.lat);
  const lngs = points.map((p) => p.lng);
  const minLat = Math.min(...lats);
  const maxLat = Math.max(...lats);
  const minLng = Math.min(...lngs);
  const maxLng = Math.max(...lngs);

  const center: LatLng = { lat: (minLat + maxLat) / 2, lng: (minLng + maxLng) / 2 };

  const usableW = Math.max(64, width - pad * 2);
  const usableH = Math.max(64, height - pad * 2);

  let zoom = MAX_ZOOM;
  for (let z = MAX_ZOOM; z >= MIN_ZOOM; z--) {
    const nw = project(maxLat, minLng, z);
    const se = project(minLat, maxLng, z);
    const spanX = Math.abs(se.x - nw.x);
    const spanY = Math.abs(se.y - nw.y);
    if (spanX <= usableW && spanY <= usableH) {
      zoom = z;
      break;
    }
  }
  return { center, zoom };
}
