"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { galleryThemeStyle, type Catalog, type Photo, type ProtectionCrypto } from "@/lib/catalog";
import { decryptBytes, sessionPasswordKey, unlockGalleryKey } from "@/lib/image-protect";

const HINT_MS = 2200;

export function SaveGuard({ children, className }: { children: ReactNode; className?: string }) {
  const [hint, setHint] = useState(false);
  const timer = useRef(0);

  const showHint = useCallback(() => {
    setHint(true);
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setHint(false), HINT_MS);
  }, []);

  useEffect(() => () => window.clearTimeout(timer.current), []);

  return (
    <div
      className={`g-save-guard ${className ?? ""}`.trim()}
      onContextMenu={(event) => {
        const target = event.target as HTMLElement | null;
        if (!target?.closest("img, .g-shot, .g-work-tile, .g-lightbox-stage, .rt-card, .rt-tray-shot")) return;
        event.preventDefault();
        showHint();
      }}
      onDragStart={(event) => {
        const target = event.target as HTMLElement | null;
        if (target?.closest("img")) event.preventDefault();
      }}
    >
      {children}
      {hint ? (
        <div className="g-save-hint" role="status">
          Speichern über Rechtsklick ist deaktiviert.
        </div>
      ) : null}
    </div>
  );
}

function filePrefix(base: string): string {
  const prefix = base.replace(/\/$/, "") || ".";
  return prefix;
}

export function useDecryptedUrls(
  catalog: Catalog,
  key: CryptoKey | null,
  base = ".",
): (photo: Photo, kind: "thumb" | "display") => string {
  const [urls, setUrls] = useState<Record<string, string>>({});
  const blobUrls = useRef<string[]>([]);
  const inflight = useRef(new Map<string, Promise<void>>());
  const prefix = filePrefix(base);

  useEffect(() => {
    inflight.current = new Map();
    return () => {
      for (const url of blobUrls.current) URL.revokeObjectURL(url);
      blobUrls.current = [];
    };
  }, [key]);

  useEffect(() => {
    if (!key) {
      setUrls({});
      return;
    }
    for (const photo of catalog.photos.photos) {
      for (const kind of ["display", "thumb"] as const) {
        const id = `${photo.id}:${kind}`;
        if (inflight.current.has(id)) continue;
        const path = kind === "thumb" ? photo.files.thumb : photo.files.display;
        const work = (async () => {
          const res = await fetch(`${prefix}/${path}`);
          if (!res.ok) throw new Error(`Bild fehlt (${res.status})`);
          const plain = await decryptBytes(key, await res.arrayBuffer());
          const url = URL.createObjectURL(new Blob([plain], { type: "image/webp" }));
          blobUrls.current.push(url);
          setUrls((prev) => ({ ...prev, [id]: url }));
        })().catch(() => {
          inflight.current.delete(id);
        });
        inflight.current.set(id, work);
      }
    }
  }, [catalog.photos.photos, key, prefix]);

  return useCallback(
    (photo: Photo, kind: "thumb" | "display") => {
      if (!key) return `${prefix}/${kind === "thumb" ? photo.files.thumb : photo.files.display}`;
      return urls[`${photo.id}:${kind}`] ?? "";
    },
    [key, prefix, urls],
  );
}

export function useGalleryUnlock(crypto: ProtectionCrypto | undefined) {
  const [key, setKey] = useState<CryptoKey | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [checking, setChecking] = useState(Boolean(crypto));

  const unlock = useCallback(
    async (password: string) => {
      if (!crypto) return;
      setBusy(true);
      setError(null);
      try {
        const next = await unlockGalleryKey(password, crypto);
        try {
          sessionStorage.setItem(sessionPasswordKey(crypto.salt), password);
        } catch {
          /* private mode */
        }
        setKey(next);
      } catch (err) {
        setKey(null);
        setError(err instanceof Error ? err.message : "Passwort ungültig.");
      } finally {
        setBusy(false);
      }
    },
    [crypto],
  );

  useEffect(() => {
    if (!crypto) {
      setKey(null);
      setChecking(false);
      return;
    }
    let saved = "";
    try {
      saved = sessionStorage.getItem(sessionPasswordKey(crypto.salt)) ?? "";
    } catch {
      saved = "";
    }
    if (!saved) {
      setKey(null);
      setChecking(false);
      return;
    }
    void unlock(saved).finally(() => setChecking(false));
  }, [crypto, unlock]);

  return { key, locked: Boolean(crypto) && !key, checking, error, busy, unlock };
}

export function GalleryUnlock({
  catalog,
  error,
  busy,
  onUnlock,
}: {
  catalog: Catalog;
  error: string | null;
  busy: boolean;
  onUnlock: (password: string) => void;
}) {
  const [password, setPassword] = useState("");
  const layout = catalog.site.layout;

  return (
    <div
      className="theme-gallery-v1"
      style={galleryThemeStyle(layout.background) as React.CSSProperties}
    >
      <div className="g-name">{catalog.site.title}</div>
      <div className="g-essay-title" aria-hidden="true" />
      <aside className="g-rail" />
      <main className="g-essay">
        <form
          className="g-unlock"
          onSubmit={(event) => {
            event.preventDefault();
            onUnlock(password);
          }}
        >
          <p className="g-unlock-copy">Diese Galerie ist passwortgeschützt.</p>
          <label>
            Passwort
            <input
              className="g-contact-field"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              autoFocus
            />
          </label>
          {error ? <p className="g-unlock-error">{error}</p> : null}
          <button type="submit" className="g-contact-submit" disabled={busy || !password.trim()}>
            {busy ? "Prüfen…" : "Öffnen"}
          </button>
        </form>
      </main>
    </div>
  );
}