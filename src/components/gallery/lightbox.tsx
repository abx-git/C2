"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { Photo } from "@/lib/catalog";

type LightboxProps = {
  photos: Photo[];
  index: number;
  resolveUrl: (photo: Photo, kind: "display") => string;
  onClose: () => void;
  onIndex: (index: number) => void;
  playing?: boolean;
  intervalMs?: number;
  sidebar?: React.ReactNode;
  enterFullscreen?: boolean;
};

function fullscreenElement(): Element | null {
  const doc = document as Document & { webkitFullscreenElement?: Element | null };
  return document.fullscreenElement ?? doc.webkitFullscreenElement ?? null;
}

function fullscreenEnabled(): boolean {
  const doc = document as Document & { webkitFullscreenEnabled?: boolean };
  return Boolean(document.fullscreenEnabled || doc.webkitFullscreenEnabled);
}

async function requestFullscreen(el: HTMLElement) {
  const node = el as HTMLElement & { webkitRequestFullscreen?: () => Promise<void> | void };
  if (el.requestFullscreen) await el.requestFullscreen();
  else node.webkitRequestFullscreen?.call(el);
}

async function exitFullscreen() {
  const doc = document as Document & { webkitExitFullscreen?: () => Promise<void> | void };
  if (!fullscreenElement()) return;
  if (document.exitFullscreen) await document.exitFullscreen();
  else doc.webkitExitFullscreen?.();
}

export function Lightbox({
  photos,
  index,
  resolveUrl,
  onClose,
  onIndex,
  playing = false,
  intervalMs = 5000,
  sidebar,
  enterFullscreen = false,
}: LightboxProps) {
  const photo = photos[index];
  const rootRef = useRef<HTMLDivElement>(null);
  const [fullscreen, setFullscreen] = useState(false);
  const canFullscreen = typeof document !== "undefined" && fullscreenEnabled();

  const indexRef = useRef(index);
  indexRef.current = index;
  const onIndexRef = useRef(onIndex);
  onIndexRef.current = onIndex;
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  const go = useCallback((delta: number) => {
    const count = photos.length;
    if (!count) return;
    onIndexRef.current((indexRef.current + delta + count) % count);
  }, [photos.length]);

  const toggleFullscreen = useCallback(() => {
    const el = rootRef.current;
    if (!el || !fullscreenEnabled()) return;
    if (fullscreenElement() === el) void exitFullscreen();
    else void requestFullscreen(el);
  }, []);

  useEffect(() => {
    if (!playing || photos.length < 2) return;
    const timer = window.setTimeout(() => go(1), Math.max(1, intervalMs));
    return () => window.clearTimeout(timer);
  }, [playing, intervalMs, index, go, photos.length]);

  useEffect(() => {
    const onChange = () => setFullscreen(fullscreenElement() === rootRef.current);
    document.addEventListener("fullscreenchange", onChange);
    document.addEventListener("webkitfullscreenchange", onChange);
    return () => {
      document.removeEventListener("fullscreenchange", onChange);
      document.removeEventListener("webkitfullscreenchange", onChange);
    };
  }, []);

  useEffect(() => {
    if (!enterFullscreen || !canFullscreen) return;
    const el = rootRef.current;
    if (!el || fullscreenElement()) return;
    void requestFullscreen(el);
  }, [enterFullscreen, canFullscreen]);

  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
      if (fullscreenElement() === rootRef.current) void exitFullscreen();
    };
  }, []);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const tag = target?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || target?.isContentEditable) return;
      if (event.key === "Escape") {
        if (fullscreenElement()) return;
        onCloseRef.current();
      }
      if (event.key === "f" || event.key === "F") toggleFullscreen();
      if (event.key === "ArrowLeft") go(-1);
      if (event.key === "ArrowRight") go(1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [go, toggleFullscreen]);

  if (!photo) return null;

  const title = photo.title.trim();
  const meta = [photo.caption, photo.exif?.camera, photo.exif?.focalLength].filter(Boolean).join(" · ");
  const label = title || "Bild";
  const fillScreen = fullscreen;

  return (
    <div
      ref={rootRef}
      className="g-lightbox"
      role="dialog"
      aria-modal="true"
      aria-label={playing ? `Diashow: ${label}` : label}
    >
      <div className="g-lightbox-main">
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
      {canFullscreen ? (
        <button
          type="button"
          className="g-lightbox-full"
          onClick={toggleFullscreen}
          title={fullscreen ? "Vollbild beenden (f)" : "Vollbild (f)"}
          aria-label={fullscreen ? "Vollbild beenden" : "Vollbild"}
          aria-pressed={fullscreen}
        >
          {fullscreen ? (
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path
                d="M8 9H5V5h4M16 9h3V5h-4M8 15H5v4h4M16 15h3v4h-4"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          ) : (
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
          )}
        </button>
      ) : null}
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
          onDoubleClick={toggleFullscreen}
          style={
            fillScreen
              ? { maxWidth: "100%", maxHeight: "100%" }
              : { maxWidth: `min(100%, ${photo.width}px)`, maxHeight: `min(100%, ${photo.height}px)` }
          }
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
      {sidebar ? <div className="g-lightbox-meta">{sidebar}</div> : null}
    </div>
  );
}
