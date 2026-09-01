export type LatLng = { lat: number; lng: number };

const MAX_LAT = 85.05112878;
export const OSM_MIN_ZOOM = 2;
export const OSM_MAX_ZOOM = 18;
export const OSM_TILE_SIZE = 256;

export function wrapLng(lng: number): number {
  if (lng >= -180 && lng <= 180) return lng;
  const wrapped = ((((lng + 180) % 360) + 360) % 360) - 180;
  return wrapped === -180 ? 180 : wrapped;
}

export function clampLat(lat: number): number {
  return Math.max(-MAX_LAT, Math.min(MAX_LAT, lat));
}

/** Fractional OSM tile X. */
export function lngToTileX(lng: number, zoom: number): number {
  return ((wrapLng(lng) + 180) / 360) * 2 ** zoom;
}

/** Fractional OSM tile Y. */
export function latToTileY(lat: number, zoom: number): number {
  const clamped = clampLat(lat);
  const s = Math.sin((clamped * Math.PI) / 180);
  return (0.5 - Math.log((1 + s) / (1 - s)) / (4 * Math.PI)) * 2 ** zoom;
}

export function tileXToLng(x: number, zoom: number): number {
  return (x / 2 ** zoom) * 360 - 180;
}

export function tileYToLat(y: number, zoom: number): number {
  const n = Math.PI - (2 * Math.PI * y) / 2 ** zoom;
  return (180 / Math.PI) * Math.atan(Math.sinh(n));
}

export function osmTileUrl(z: number, x: number, y: number): string {
  const n = 2 ** z;
  const wrappedX = ((x % n) + n) % n;
  return `https://tile.openstreetmap.org/${z}/${wrappedX}/${y}.png`;
}

export function fitZoom(points: LatLng[], width: number, height: number, padding = 48): number {
  if (width < 8 || height < 8 || !points.length) return 4;
  if (points.length === 1) return 11;
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  const world = 2 ** OSM_MAX_ZOOM;
  for (const point of points) {
    const x = lngToTileX(point.lng, OSM_MAX_ZOOM);
    const y = latToTileY(point.lat, OSM_MAX_ZOOM);
    minX = Math.min(minX, x);
    maxX = Math.max(maxX, x);
    minY = Math.min(minY, y);
    maxY = Math.max(maxY, y);
  }
  const spanX = Math.max(1e-6, maxX - minX);
  const spanY = Math.max(1e-6, maxY - minY);
  const innerW = Math.max(8, width - padding * 2);
  const innerH = Math.max(8, height - padding * 2);
  const zoomX = Math.log2((innerW / OSM_TILE_SIZE) * (world / spanX));
  const zoomY = Math.log2((innerH / OSM_TILE_SIZE) * (world / spanY));
  return Math.max(OSM_MIN_ZOOM, Math.min(OSM_MAX_ZOOM, Math.floor(Math.min(zoomX, zoomY))));
}

export function boundsCenter(points: LatLng[]): LatLng {
  if (!points.length) return { lat: 20, lng: 0 };
  if (points.length === 1) return points[0]!;
  let minLat = Infinity;
  let maxLat = -Infinity;
  let minLng = Infinity;
  let maxLng = -Infinity;
  for (const point of points) {
    minLat = Math.min(minLat, point.lat);
    maxLat = Math.max(maxLat, point.lat);
    minLng = Math.min(minLng, point.lng);
    maxLng = Math.max(maxLng, point.lng);
  }
  return { lat: (minLat + maxLat) / 2, lng: (minLng + maxLng) / 2 };
}
