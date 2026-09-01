"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  DEFAULT_LAYOUT,
  clampSlideshowInterval,
  galleryThemeStyle,
  type Catalog,
  type Photo,
} from "@/lib/catalog";
import { formatGeo, formatPhotoDate, roadtripGeoPhotos, roadtripMapFocus, roadtripPhotos } from "@/lib/roadtrip";
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
  const [playing, setPlaying] = useState(false);
  const [wantFullscreen, setWantFullscreen] = useState(false);
  const fitPoints = useMemo(
    () => roadtripMapFocus(photos, index).map((photo) => ({ lat: photo.geo.lat, lng: photo.geo.lng })),
    [photos, index],
  );
  const stageRef = useRef<HTMLDivElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const cardsRef = useRef<(HTMLButtonElement | null)[]>([]);
  const programmatic = useRef(false);
  const indexRef = useRef(index);
  indexRef.current = index;
  const layout = catalog.site.layout ?? DEFAULT_LAYOUT;
  const allowLightbox = layout.lightbox ?? DEFAULT_LAYOUT.lightbox;
  const allowSlideshow = layout.slideshow ?? DEFAULT_LAYOUT.slideshow;
  const allowFullscreen = layout.fullscreen ?? DEFAULT_LAYOUT.fullscreen;
  const allowMap = layout.map ?? DEFAULT_LAYOUT.map;
  const allowOverview = layout.overview ?? DEFAULT_LAYOUT.overview;
  const intervalMs = clampSlideshowInterval(layout.slideshowInterval ?? DEFAULT_LAYOUT.slideshowInterval) * 1000;
  const showMap = allowMap && geoPhotos.length > 0;
  const current = photos[index];

  const scrollToIndex = useCallback((next: number, behavior: ScrollBehavior) => {
    const stage = stageRef.current;
    const card = cardsRef.current[next];
    if (!stage || !card || card.offsetWidth < 2) return false;
    const cardRect = card.getBoundingClientRect();
    const stageRect = stage.getBoundingClientRect();
    const left =
      stage.scrollLeft + (cardRect.left + cardRect.width / 2) - (stageRect.left + stageRect.width / 2);
    programmatic.current = true;
    stage.scrollTo({ left: Math.max(0, left), behavior });
    return true;
  }, []);

  useEffect(() => {
    if (index >= photos.length) setIndex(Math.max(0, photos.length - 1));
  }, [index, photos.length]);

  const go = useCallback(
    (next: number, scroll = true) => {
      if (!photos.length) return;
      const clamped = Math.max(0, Math.min(photos.length - 1, next));
      setIndex(clamped);
      if (scroll) scrollToIndex(clamped, "smooth");
    },
    [photos.length, scrollToIndex],
  );

  useEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;
    let lastH = -1;
    let lastW = -1;
    const recenter = () => {
      const h = stage.clientHeight;
      const w = stage.clientWidth;
      if (h === lastH && w === lastW) return;
      lastH = h;
      lastW = w;
      if (h > 0) stage.style.setProperty("--rt-stage-h", `${h}px`);
      requestAnimationFrame(() => scrollToIndex(indexRef.current, "auto"));
    };
    recenter();
    const ro = new ResizeObserver(recenter);
    ro.observe(stage);
    return () => ro.disconnect();
  }, [photos.length, scrollToIndex]);

  useEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;
    let timer = 0;
    const nearestIndex = () => {
      const mid = stage.getBoundingClientRect().left + stage.clientWidth / 2;
      let best = indexRef.current;
      let bestDist = Infinity;
      cardsRef.current.forEach((card, i) => {
        if (!card) return;
        const rect = card.getBoundingClientRect();
        const dist = Math.abs(rect.left + rect.width / 2 - mid);
        if (dist < bestDist) {
          bestDist = dist;
          best = i;
        }
      });
      return best;
    };
    const settle = () => {
      if (programmatic.current) {
        programmatic.current = false;
        return;
      }
      setIndex(nearestIndex());
    };
    const onScroll = () => {
      window.clearTimeout(timer);
      timer = window.setTimeout(settle, programmatic.current ? 400 : 120);
    };
    stage.addEventListener("scroll", onScroll, { passive: true });
    stage.addEventListener("scrollend", settle);
    return () => {
      stage.removeEventListener("scroll", onScroll);
      stage.removeEventListener("scrollend", settle);
      window.clearTimeout(timer);
    };
  }, [photos.length]);

  const openPhoto = useCallback(
    (next: number, showDetail = false) => {
      go(next);
      setTray(false);
      if (showDetail && allowLightbox) setLightbox(true);
    },
    [go, allowLightbox],
  );

  useEffect(() => {
    if (!playing || lightbox || photos.length < 2) return;
    const timer = window.setInterval(() => {
      go((indexRef.current + 1) % photos.length);
    }, intervalMs);
    return () => window.clearInterval(timer);
  }, [playing, lightbox, photos.length, intervalMs, go]);

  useEffect(() => {
    if (!wantFullscreen || lightbox) return;
    const el = rootRef.current;
    if (!el) return;
    const node = el as HTMLElement & { webkitRequestFullscreen?: () => void };
    if (el.requestFullscreen) void el.requestFullscreen();
    else node.webkitRequestFullscreen?.();
    setWantFullscreen(false);
  }, [wantFullscreen, lightbox]);

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
      if (tray || lightbox) return;
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
  }, [go, photos.length, tray, lightbox]);

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
        ref={rootRef}
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
            {photos.length > 0 && allowSlideshow ? (
              <button
                type="button"
                className="rt-tool"
                onClick={() => {
                  setPlaying((value) => !value);
                  if (allowLightbox) setLightbox(true);
                }}
                title={playing ? "Diashow anhalten" : "Diashow starten"}
                aria-label={playing ? "Diashow anhalten" : "Diashow starten"}
                aria-pressed={playing}
              >
                <svg viewBox="0 0 24 24" aria-hidden="true">
                  {playing ? (
                    <path d="M7 6h3v12H7zM14 6h3v12h-3z" fill="currentColor" />
                  ) : (
                    <path
                      d="M8 6.2v11.6L18.5 12z"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  )}
                </svg>
              </button>
            ) : null}
            {photos.length > 0 && allowFullscreen ? (
              <button
                type="button"
                className="rt-tool"
                onClick={() => {
                  if (allowLightbox) {
                    setLightbox(true);
                    setWantFullscreen(true);
                  } else {
                    setWantFullscreen(true);
                  }
                }}
                title="Vollbild"
                aria-label="Vollbild"
              >
                <svg viewBox="0 0 24 24" aria-hidden="true">
                  <path
                    d="M8 5H5v4M16 5h3v4M8 19H5v-4M16 19h3v-4"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </button>
            ) : null}
            {photos.length > 0 && allowOverview ? (
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
                    style={
                      {
                        "--rt-w": Math.max(1, photo.width || 3),
                        "--rt-h": Math.max(1, photo.height || 2),
                      } as React.CSSProperties
                    }
                    onClick={() => {
                      if (!active) go(i);
                      else if (allowLightbox) setLightbox(true);
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
          {photos.length > 1 ? (
            <>
              <button
                type="button"
                className="rt-nav-btn prev"
                onClick={() => go(index - 1)}
                disabled={index <= 0}
                aria-label="Vorheriges Bild"
              >
                ‹
              </button>
              <button
                type="button"
                className="rt-nav-btn next"
                onClick={() => go(index + 1)}
                disabled={index >= photos.length - 1}
                aria-label="Nächstes Bild"
              >
                ›
              </button>
            </>
          ) : null}
        </div>

        {showMap ? (
          <aside className="rt-map" aria-label="Route">
            <OsmMap
              className="h-full"
              markers={markers}
              fitPoints={fitPoints}
              activeId={
                current?.geo
                  ? current.id
                  : [...geoPhotos].reverse().find((photo) => traveledIds.has(photo.id))?.id
              }
              traveledIds={traveledIds}
              onSelect={(id) => {
                const next = photos.findIndex((photo) => photo.id === id);
                if (next >= 0) openPhoto(next);
              }}
            />
          </aside>
        ) : null}

        <footer className="rt-meta">
          <div className="rt-meta-copy">
            {current ? <strong>{photoLabel(current)}</strong> : null}
            {meta.length ? <span>{meta.join(" · ")}</span> : null}
          </div>
        </footer>

        {tray && allowOverview ? (
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
                  onClick={() => openPhoto(i)}
                  aria-label={photoLabel(photo)}
                  aria-current={i === index ? "true" : undefined}
                >
                  <span className="rt-tray-frame">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={resolveUrl(photo, "thumb")} alt="" draggable={false} />
                  </span>
                </button>
              ))}
            </div>
          </div>
        ) : null}

        {lightbox && allowLightbox && photos.length ? (
          <Lightbox
            photos={photos}
            index={index}
            resolveUrl={(photo) => resolveUrl(photo, "display")}
            onClose={() => {
              setLightbox(false);
              setPlaying(false);
              setWantFullscreen(false);
            }}
            onIndex={(next) => go(next)}
            playing={playing}
            onPlaying={setPlaying}
            intervalMs={intervalMs}
            enterFullscreen={wantFullscreen}
          />
        ) : null}
      </div>
    </SaveGuard>
  );
}
