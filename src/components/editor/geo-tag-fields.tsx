"use client";

import { useEffect, useMemo, useState } from "react";
import { geoEquals, parseGeoText, parsePhotoGeo, type PhotoGeo } from "@/lib/catalog";
import { readDeviceGeo, searchGeoPlaces, type GeoSearchHit } from "@/lib/geocode";
import { formatGeo } from "@/lib/roadtrip";
import { OsmMap } from "@/components/gallery/osm-map";

const EUROPE = { lat: 51.2, lng: 10.4, zoom: 5 };

type GeoTagFieldsProps = {
  value: PhotoGeo | null | undefined;
  mixed?: boolean;
  onChange: (geo: PhotoGeo | null) => void;
};

function fieldValue(n: number | undefined): string {
  if (n == null || !Number.isFinite(n)) return "";
  return String(n);
}

export function GeoTagFields({ value, mixed = false, onChange }: GeoTagFieldsProps) {
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<GeoSearchHit[]>([]);
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [latText, setLatText] = useState(fieldValue(value?.lat));
  const [lngText, setLngText] = useState(fieldValue(value?.lng));

  useEffect(() => {
    setLatText(fieldValue(value?.lat));
    setLngText(fieldValue(value?.lng));
  }, [value?.lat, value?.lng]);

  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) {
      setHits([]);
      setSearching(false);
      return;
    }
    let cancelled = false;
    setSearching(true);
    const timer = window.setTimeout(() => {
      void searchGeoPlaces(q)
        .then((next) => {
          if (!cancelled) {
            setHits(next);
            setError(null);
          }
        })
        .catch((err) => {
          if (!cancelled) setError(err instanceof Error ? err.message : "Ortssuche fehlgeschlagen.");
        })
        .finally(() => {
          if (!cancelled) setSearching(false);
        });
    }, 400);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [query]);

  const apply = (geo: PhotoGeo | null) => {
    setError(null);
    setHits([]);
    setQuery("");
    onChange(geo);
  };

  const commitFields = () => {
    const pasted = parseGeoText(`${latText}, ${lngText}`);
    if (pasted) {
      if (!geoEquals(pasted, value)) apply(pasted);
      return;
    }
    if (!latText.trim() && !lngText.trim()) return;
    setError("Koordinaten als Dezimalgrad, z. B. 53.5511 und 9.9937.");
  };

  const markers = useMemo(
    () => (value ? [{ id: "geo", lat: value.lat, lng: value.lng }] : []),
    [value],
  );

  return (
    <div>
      <div className="mb-1 text-xs text-[var(--edit-muted)]">Ort</div>
      {mixed ? (
        <p className="mb-1.5 text-xs text-[var(--edit-muted)]">Ausgewählte Bilder haben unterschiedliche Orte.</p>
      ) : null}
      <div className="relative mb-1.5">
        <input
          className="edit-field"
          value={query}
          placeholder="Ort suchen oder 53.55, 9.99"
          aria-label="Ort suchen"
          onChange={(event) => setQuery(event.target.value)}
          onKeyDown={(event) => {
            if (event.key !== "Enter") return;
            event.preventDefault();
            const pasted = parseGeoText(query);
            if (pasted) apply(pasted);
            else if (hits[0]) apply({ lat: hits[0].lat, lng: hits[0].lng });
          }}
        />
        {hits.length ? (
          <ul className="edit-geo-hits">
            {hits.map((hit) => (
              <li key={`${hit.lat},${hit.lng},${hit.label}`}>
                <button
                  type="button"
                  onClick={() => apply({ lat: hit.lat, lng: hit.lng })}
                >
                  {hit.label}
                </button>
              </li>
            ))}
          </ul>
        ) : searching ? (
          <p className="mt-1 text-[0.7rem] text-[var(--edit-muted)]">Suche…</p>
        ) : null}
      </div>
      <div className="mb-1.5 grid grid-cols-2 gap-1.5">
        <label className="block text-[0.7rem] text-[var(--edit-muted)]">
          Breite
          <input
            className="edit-field mt-0.5"
            inputMode="decimal"
            value={mixed && !query ? "" : latText}
            placeholder={mixed ? "gemischt" : "53.5511"}
            onChange={(event) => setLatText(event.target.value)}
            onBlur={commitFields}
          />
        </label>
        <label className="block text-[0.7rem] text-[var(--edit-muted)]">
          Länge
          <input
            className="edit-field mt-0.5"
            inputMode="decimal"
            value={mixed && !query ? "" : lngText}
            placeholder={mixed ? "gemischt" : "9.9937"}
            onChange={(event) => setLngText(event.target.value)}
            onBlur={commitFields}
          />
        </label>
      </div>
      <div className="edit-geo-map mb-1.5">
        <OsmMap
          markers={markers}
          activeId={value ? "geo" : null}
          onPick={(point) => {
            const geo = parsePhotoGeo(point);
            if (geo) apply(geo);
          }}
          initialView={value ? { lat: value.lat, lng: value.lng, zoom: 13 } : EUROPE}
        />
      </div>
      <p className="mb-1.5 text-[0.7rem] leading-relaxed text-[var(--edit-muted)]">
        {value ? formatGeo(value) : "Auf der Karte klicken, Ort suchen oder Koordinaten eintragen."}
      </p>
      {error ? <p className="mb-1.5 text-[0.7rem] text-red-800">{error}</p> : null}
      <div className="flex flex-wrap gap-1.5">
        <button
          type="button"
          className="edit-btn"
          onClick={() => {
            setError(null);
            void readDeviceGeo()
              .then(apply)
              .catch((err) => setError(err instanceof Error ? err.message : "Standort nicht verfügbar."));
          }}
        >
          Mein Standort
        </button>
        {value || mixed ? (
          <button type="button" className="edit-btn" onClick={() => apply(null)}>
            Ort entfernen
          </button>
        ) : null}
      </div>
    </div>
  );
}
