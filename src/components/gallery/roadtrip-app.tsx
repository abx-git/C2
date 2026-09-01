"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  DEFAULT_LAYOUT,
  galleryThemeStyle,
  type Catalog,
  type Photo,
} from "@/lib/catalog";
import { formatGeo, formatPhotoDate, roadtripGeoPhotos, roadtripPhotos } from "@/lib/roadtrip";
import { OsmMap } from "./osm-map";
import { Lightbox } from "./lightbox";
import { SaveGuard } from "./protect-images";

type RoadtripAppProps = {
  catalog: Catalog;
  resolveUrl: (photo: Photo, kind: "thumb" | "display") => string;
  className?: string;
};

function photoLabel(photo: Photo): string {
  return photo.title.trim() || photo.originalName || "Bild";
}

export function RoadtripApp({ catalog, resolveUrl, className }: RoadtripAppProps) {
  const photos = useMemo(() => roadtripPhotos(catalog), [catalog]);
  const geoPhotos = useMemo(() => roadtripGeoPhotos(photos), [photos]);
  const markers = useMemo(
    () => geoPhotos.map((photo) => ({ id: photo.id, lat: photo.geo.lat, lng: photo.geo.lng })),
    [geoPhotos],
  );
  const [index, setIndex] = useState(0);
  const [tray, setTray] = useState(false);
  const [lightbox, setLightbox] = useState(false);
  const stageRef = useRef<HTMLDivElement>(null);
  const cardsRef = useRef<(HTMLButtonElement | null)[]>([]);
  const programmatic = useRef(false);
  const indexRef = useRef(index);
  indexRef.current = index;
  const layout = catalog.site.layout ?? DEFAULT_LAYOUT;
  const showMap = geoPhotos.length > 0;
  const current = photos[index];

  useEffect(() => {
    if (index >= photos.length) setIndex(Math.max(0, photos.length - 1));
  }, [index, photos.length]);

  const go = useCallback(
    (next: number, scroll = true) => {
      if (!photos.length) return;
      const clamped = Math.max(0, Math.min(photos.length - 1, next));
      setIndex(clamped);
      if (!scroll) return;
      const card = cardsRef.current[clamped];
      if (!card) return;
      programmatic.current = true;
      card.scrollIntoView({ inline: "center", block: "nearest", behavior: "smooth" });
    },
    [photos.length],
  );

  useEffect(() => {
    const card = cardsRef.current[index];
    if (!card) return;
    programmatic.current = true;
    card.scrollIntoView({ inline: "center", block: "nearest", behavior: "auto" });
  }, [photos.length]);

  useEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;
    let timer = 0;
    const syncFromScroll = () => {
      if (programmatic.current) {
        programmatic.current = false;
        return;
      }
      const mid = stage.scrollLeft + stage.clientWidth / 2;
      let best = 0;
      let bestDist = Infinity;
      cardsRef.current.forEach((card, i) => {
        if (!card) return;
        const center = card.offsetLeft + card.offsetWidth / 2;
        const dist = Math.abs(center - mid);
        if (dist < bestDist) {
          bestDist = dist;
          best = i;
        }
      });
      setIndex(best);
    };
    const onScroll = () => {
      window.clearTimeout(timer);
      timer = window.setTimeout(syncFromScroll, 80);
    };
    stage.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      stage.removeEventListener("scroll", onScroll);
      window.clearTimeout(timer);
    };
  }, [photos.length]);

  const openPhoto = useCallback(
    (next: number, showLightbox = false) => {
      go(next);
      setTray(false);
      if (showLightbox) setLightbox(true);
    },
    [go],
  );

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey) return;
      const target = event.target as HTMLElement | null;
      const tag = target?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || target?.isContentEditable) return;
      if (event.key === "Escape") {
        if (tray) {
          event.preventDefault();
          setTray(false);
        }
        return;
      }
      if (lightbox || tray) return;
      if (event.key === "ArrowRight" || event.key === "ArrowDown") {
        event.preventDefault();
        go(indexRef.current + 1);
      } else if (event.key === "ArrowLeft" || event.key === "ArrowUp") {
        event.preventDefault();
        go(indexRef.current - 1);
      } else if (event.key === "Home") {
        event.preventDefault();
        go(0);
      } else if (event.key === "End") {
        event.preventDefault();
        go(photos.length - 1);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [go, photos.length, lightbox, tray]);

  const traveledIds = useMemo(() => {
    const ids = new Set<string>();
    for (let i = 0; i <= index; i += 1) {
      const photo = photos[i];
      if (photo?.geo) ids.add(photo.id);
    }
    return ids;
  }, [index, photos]);

  const meta = current
    ? [
        formatPhotoDate(current.takenAt),
        current.caption.trim(),
        current.geo ? formatGeo(current.geo) : null,
        current.exif?.camera,
      ].filter(Boolean)
    : [];

  return (
    <SaveGuard className={className}>
      <div
        className={["theme-gallery-v1", "theme-roadtrip", showMap ? "has-map" : ""].filter(Boolean).join(" ")}
        style={galleryThemeStyle(layout.background) as React.CSSProperties}
      >
        <header className="rt-head">
          <span className="rt-title">{catalog.site.title}</span>
          <div className="rt-head-tools">
            {photos.length ? (
              <span className="rt-count">
                {index + 1} / {photos.length}
              </span>
            ) : null}
            {photos.length > 0 ? (
              <button
                type="button"
                className="rt-tool"
                onClick={() => setTray(true)}
                title="Lichtkasten: alle Bilder"
                aria-label="Lichtkasten: alle Bilder"
              >
                <svg viewBox="0 0 24 24" aria-hidden="true">
                  <path
                    d="M4 5h6v6H4zM14 5h6v6h-6zM4 13h6v6H4zM14 13h6v6h-6z"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.2"
                    strokeLinejoin="round"
                  />
                </svg>
              </button>
            ) : null}
          </div>
        </header>

        <div className="rt-stream-wrap">
          <div className="rt-stream" ref={stageRef} tabIndex={0} aria-label="Bildstrom">
            {photos.length === 0 ? (
              <p className="g-empty">Keine veröffentlichten Bilder für den Roadtrip.</p>
            ) : (
              photos.map((photo, i) => {
                const active = i === index;
                const near = Math.abs(i - index) <= 2;
                const kind = near ? "display" : "thumb";
                const src = Math.abs(i - index) <= 8 ? resolveUrl(photo, kind) : "";
                return (
                  <button
                    key={photo.id}
                    type="button"
                    ref={(el) => {
                      cardsRef.current[i] = el;
                    }}
                    className={`rt-card${active ? " is-active" : ""}`}
                    onClick={() => {
                      if (active) setLightbox(true);
                      else go(i);
                    }}
                    aria-current={active ? "true" : undefined}
                    aria-label={photoLabel(photo)}
                  >
                    {src ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={src}
                        alt={photoLabel(photo)}
                        draggable={false}
                        width={photo.width}
                        height={photo.height}
                      />
                    ) : (
                      <span className="rt-card-slot" />
                    )}
                  </button>
                );
              })
            )}
          </div>
        </div>

        {showMap ? (
          <aside className="rt-map" aria-label="Route">
            <OsmMap
              markers={markers}
              activeId={
                current?.geo
                  ? current.id
                  : [...geoPhotos].reverse().find((photo) => traveledIds.has(photo.id))?.id
              }
              traveledIds={traveledIds}
              onSelect={(id) => {
                const next = photos.findIndex((photo) => photo.id === id);
                if (next >= 0) openPhoto(next, true);
              }}
            />
          </aside>
        ) : null}

        <footer className="rt-meta">
          <div className="rt-meta-copy">
            {current ? <strong>{photoLabel(current)}</strong> : null}
            {meta.length ? <span>{meta.join(" · ")}</span> : null}
          </div>
          {photos.length > 1 ? (
            <div className="rt-nav">
              <button type="button" className="rt-nav-btn" onClick={() => go(index - 1)} disabled={index <= 0}>
                ←
              </button>
              <button
                type="button"
                className="rt-nav-btn"
                onClick={() => go(index + 1)}
                disabled={index >= photos.length - 1}
              >
                →
              </button>
            </div>
          ) : null}
        </footer>

        {tray ? (
          <div className="rt-tray" role="dialog" aria-label="Lichtkasten">
            <div className="rt-tray-bar">
              <span>Lichtkasten</span>
              <button type="button" className="rt-tool" onClick={() => setTray(false)} aria-label="Schließen">
                <svg viewBox="0 0 24 24" aria-hidden="true">
                  <path
                    d="M7 7l10 10M17 7L7 17"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.2"
                    strokeLinecap="round"
                  />
                </svg>
              </button>
            </div>
            <div className="rt-tray-grid">
              {photos.map((photo, i) => (
                <button
                  key={photo.id}
                  type="button"
                  className={`rt-tray-shot${i === index ? " is-active" : ""}`}
                  onClick={() => openPhoto(i, true)}
                  aria-label={photoLabel(photo)}
                  aria-current={i === index ? "true" : undefined}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={resolveUrl(photo, "thumb")} alt="" draggable={false} />
                </button>
              ))}
            </div>
          </div>
        ) : null}

        {lightbox && photos.length ? (
          <Lightbox
            photos={photos}
            index={index}
            resolveUrl={(photo) => resolveUrl(photo, "display")}
            onClose={() => setLightbox(false)}
            onIndex={(next) => go(next)}
          />
        ) : null}
      </div>
    </SaveGuard>
  );
}
