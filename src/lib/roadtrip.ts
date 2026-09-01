import { catalogFeed, photoHasGeo, type Catalog, type Photo, type PhotoGeo } from "./catalog";

/** Veröffentlichte Bilder in der Reihenfolge der Edit-Bibliothek. */
export function roadtripPhotos(catalog: Catalog): Photo[] {
  return catalogFeed(catalog).flatMap((item) => (item.type === "photo" ? [item.photo] : []));
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
