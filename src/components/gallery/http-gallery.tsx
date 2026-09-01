"use client";

import { useEffect, useState } from "react";
import { emptyCatalog, galleryThemeStyle, toPublicCatalog, type Catalog } from "@/lib/catalog";
import { createHttpCatalogSource, deployPageBase, readGalleryMode } from "@/lib/catalog-source";
import { GalleryApp } from "@/components/gallery/gallery-app";
import { RoadtripApp } from "@/components/gallery/roadtrip-app";
import { GalleryUnlock, useDecryptedUrls, useGalleryUnlock } from "@/components/gallery/protect-images";

export function HttpGallery() {
  const [catalog, setCatalog] = useState<Catalog | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const source = createHttpCatalogSource(deployPageBase());
    void source
      .loadCatalog()
      .then((loaded) => setCatalog(toPublicCatalog(loaded)))
      .catch((err) => {
        setCatalog(emptyCatalog());
        const file = typeof window !== "undefined" && window.location.protocol === "file:";
        setError(
          file
            ? "Galerie-Daten fehlen in index.html. Bitte den Ordner erneut deployen."
            : err instanceof Error
              ? err.message
              : "Keine Galerie-Daten gefunden.",
        );
      });
  }, []);

  if (!catalog) {
    return (
      <div className="h-full theme-gallery-v1" style={galleryThemeStyle("white") as React.CSSProperties}>
        <div className="g-name">Andreas Bergmann</div>
        <div className="g-essay-title" aria-hidden="true" />
        <aside className="g-rail" />
        <main className="g-essay">
          <p className="g-empty">Laden…</p>
        </main>
      </div>
    );
  }

  return <LoadedGallery catalog={catalog} error={error} />;
}

function LoadedGallery({ catalog, error }: { catalog: Catalog; error: string | null }) {
  const crypto = catalog.site.protection?.crypto;
  const { key, locked, checking, error: unlockError, busy, unlock } = useGalleryUnlock(crypto);
  const resolveUrl = useDecryptedUrls(catalog, crypto ? key : null, deployPageBase());
  const mode = readGalleryMode();

  if (checking) {
    return (
      <div
        className="theme-gallery-v1"
        style={galleryThemeStyle(catalog.site.layout.background) as React.CSSProperties}
      >
        <div className="g-name">{catalog.site.title}</div>
        <div className="g-essay-title" aria-hidden="true" />
        <aside className="g-rail" />
        <main className="g-essay">
          <p className="g-empty">Laden…</p>
        </main>
      </div>
    );
  }

  if (locked) {
    return (
      <GalleryUnlock
        catalog={catalog}
        error={unlockError}
        busy={busy}
        onUnlock={(password) => void unlock(password)}
      />
    );
  }

  if (catalog.photos.photos.length === 0) {
    return (
      <div
        className="theme-gallery-v1"
        style={galleryThemeStyle(catalog.site.layout.background) as React.CSSProperties}
      >
        <div className="g-name">{catalog.site.title}</div>
        <div className="g-essay-title" aria-hidden="true" />
        <aside className="g-rail" />
        <main className="g-essay">
          <p className="g-empty">{error ?? "Noch keine veröffentlichten Bilder."}</p>
        </main>
      </div>
    );
  }

  return (
    mode === "roadtrip" ? (
      <RoadtripApp className="h-full" catalog={catalog} resolveUrl={resolveUrl} />
    ) : (
      <GalleryApp className="h-full" catalog={catalog} resolveUrl={resolveUrl} />
    )
  );
}
