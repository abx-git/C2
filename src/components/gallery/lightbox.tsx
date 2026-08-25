"use client";

import { useCallback, useEffect } from "react";
import type { Photo } from "@/lib/catalog";

type LightboxProps = {
  photos: Photo[];
  index: number;
  resolveUrl: (photo: Photo, kind: "display") => string;
  onClose: () => void;
  onIndex: (index: number) => void;
  playing?: boolean;
  intervalMs?: number;
};

export function Lightbox({
  photos,
  index,
  resolveUrl,
  onClose,
  onIndex,
  playing = false,
  intervalMs = 5000,
}: LightboxProps) {
  const photo = photos[index];

  const go = useCallback(
    (delta: number) => {
      if (!photos.length) return;
      onIndex((index + delta + photos.length) % photos.length);
    },
    [index, onIndex, photos.length],
  );

  useEffect(() => {
    if (!playing || photos.length < 2) return;
    const timer = window.setTimeout(() => go(1), Math.max(1, intervalMs));
    return () => window.clearTimeout(timer);
  }, [playing, intervalMs, index, go, photos.length]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
      if (event.key === "ArrowLeft") go(-1);
      if (event.key === "ArrowRight") go(1);
    };
    window.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [go, onClose]);

  if (!photo) return null;

  const title = photo.title.trim();
  const meta = [photo.caption, photo.exif?.camera, photo.exif?.focalLength].filter(Boolean).join(" · ");
  const label = title || "Bild";

  return (
    <div className="g-lightbox" role="dialog" aria-modal="true" aria-label={playing ? `Diashow: ${label}` : label}>
      <button type="button" className="g-lightbox-back" onClick={onClose} aria-label="Zurück zur Übersicht">
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path
            d="M20 12H6M11.5 6.5 5 12l6.5 5.5"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </button>
      {photos.length > 1 ? (
        <button type="button" className="g-lightbox-nav prev" onClick={() => go(-1)} aria-label="Vorheriges Bild">
          ‹
        </button>
      ) : null}
      <div className="g-lightbox-stage">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          key={photo.id}
          src={resolveUrl(photo, "display")}
          alt={label}
          draggable={false}
          width={photo.width}
          height={photo.height}
          style={{ maxWidth: `min(100%, ${photo.width}px)`, maxHeight: `min(100%, ${photo.height}px)` }}
        />
      </div>
      {photos.length > 1 ? (
        <button type="button" className="g-lightbox-nav next" onClick={() => go(1)} aria-label="Nächstes Bild">
          ›
        </button>
      ) : null}
      {title || meta ? (
        <div className="g-lightbox-caption">
          {title ? <strong>{title}</strong> : null}
          {title && meta ? " — " : null}
          {meta}
        </div>
      ) : null}
    </div>
  );
}
