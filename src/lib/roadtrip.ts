import { photoHasGeo, type Catalog, type Photo, type PhotoGeo } from "./catalog";

function takenAtValue(iso: string | null): number {
  if (!iso) return Number.POSITIVE_INFINITY;
  const time = Date.parse(iso);
  return Number.isFinite(time) ? time : Number.POSITIVE_INFINITY;
}

/** Veröffentlichte Bilder in Reise-Reihenfolge (Aufnahmezeit, sonst Katalog). */
export function roadtripPhotos(catalog: Catalog): Photo[] {
  return catalog.photos.photos
    .map((photo, index) => ({ photo, index }))
    .sort((a, b) => {
      const delta = takenAtValue(a.photo.takenAt) - takenAtValue(b.photo.takenAt);
      if (delta !== 0) return delta;
      return a.index - b.index;
    })
    .map((item) => item.photo);
}

export function roadtripGeoPhotos(photos: Photo[]): Array<Photo & { geo: PhotoGeo }> {
  return photos.filter(photoHasGeo);
}

export function formatPhotoDate(iso: string | null): string {
  if (!iso) return "";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("de-DE", {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(date);
}

export function formatGeo(geo: PhotoGeo): string {
  const latHemi = geo.lat >= 0 ? "N" : "S";
  const lngHemi = geo.lng >= 0 ? "E" : "W";
  return `${Math.abs(geo.lat).toFixed(4)}° ${latHemi}, ${Math.abs(geo.lng).toFixed(4)}° ${lngHemi}`;
}
