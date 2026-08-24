"use client";

import { useEffect, useState } from "react";
import { emptyCatalog, galleryThemeStyle, toPublicCatalog, type Catalog, type Photo } from "@/lib/catalog";
import { createHttpCatalogSource } from "@/lib/catalog-source";
import { GalleryApp } from "@/components/gallery/gallery-app";

export function HttpGallery() {
  const [catalog, setCatalog] = useState<Catalog | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const source = createHttpCatalogSource(".");
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
      <div className="theme-gallery-v1" style={galleryThemeStyle("white") as React.CSSProperties}>
        <div className="g-name">Andreas Bergmann</div>
        <div className="g-essay-title" aria-hidden="true" />
        <aside className="g-rail" />
        <main className="g-essay">
          <p className="g-empty">Laden…</p>
        </main>
      </div>
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
          <p className="g-empty">
            {error ?? "Noch keine veröffentlichten Bilder."}
            {!error && typeof window !== "undefined" && window.location.protocol !== "file:" ? (
              <>
                {" "}
                <a href="./edit/">Editor</a>
              </>
            ) : null}
          </p>
        </main>
      </div>
    );
  }

  const resolveUrl = (photo: Photo, kind: "thumb" | "display") =>
    `./${kind === "thumb" ? photo.files.thumb : photo.files.display}`;

  return <GalleryApp catalog={catalog} resolveUrl={resolveUrl} />;
}
