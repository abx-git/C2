import { parseGeoText, parsePhotoGeo, type PhotoGeo } from "./catalog";
import { formatGeo } from "./roadtrip";

export type GeoSearchHit = {
  label: string;
  lat: number;
  lng: number;
};

export async function searchGeoPlaces(query: string): Promise<GeoSearchHit[]> {
  const q = query.trim();
  if (q.length < 2) return [];
  const pasted = parseGeoText(q);
  if (pasted) return [{ label: formatGeo(pasted), lat: pasted.lat, lng: pasted.lng }];

  const url = new URL("https://nominatim.openstreetmap.org/search");
  url.searchParams.set("format", "jsonv2");
  url.searchParams.set("limit", "6");
  url.searchParams.set("addressdetails", "0");
  url.searchParams.set("q", q);
  const res = await fetch(url.toString(), {
    headers: { Accept: "application/json" },
  });
  if (!res.ok) throw new Error("Ortssuche fehlgeschlagen.");
  const rows = (await res.json()) as Array<{ display_name?: string; lat?: string; lon?: string }>;
  const hits: GeoSearchHit[] = [];
  for (const row of rows) {
    const geo = parsePhotoGeo({ lat: Number(row.lat), lng: Number(row.lon) });
    const label = typeof row.display_name === "string" ? row.display_name : "";
    if (!geo || !label) continue;
    hits.push({ label, lat: geo.lat, lng: geo.lng });
  }
  return hits;
}

export function readDeviceGeo(): Promise<PhotoGeo> {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error("Standort ist in diesem Browser nicht verfügbar."));
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const geo = parsePhotoGeo({ lat: pos.coords.latitude, lng: pos.coords.longitude });
        if (!geo) reject(new Error("Standort konnte nicht gelesen werden."));
        else resolve(geo);
      },
      () => reject(new Error("Standortzugriff wurde nicht erlaubt.")),
      { enableHighAccuracy: true, timeout: 8000, maximumAge: 60_000 },
    );
  });
}
