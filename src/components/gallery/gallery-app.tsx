"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  DEFAULT_LAYOUT,
  catalogFeed,
  galleryThemeStyle,
  filterPhotos,
  flattenGalleryPages,
  flattenLeafPages,
  navPages,
  type Catalog,
  type LeafPage,
  type Photo,
  type SitePage,
} from "@/lib/catalog";
import { appBase } from "@/lib/app-base";
import { layoutEssayFeed } from "@/lib/essay";
import { ContactForm } from "./contact-form";
import { Lightbox } from "./lightbox";

type GalleryAppProps = {
  catalog: Catalog;
  resolveUrl: (photo: Photo, kind: "thumb" | "display") => string;
  className?: string;
};

function pageTitle(page: LeafPage | undefined, show: boolean): string {
  if (!page || !show) return "";
  if (page.type === "work") return "";
  return page.title;
}

function ArchiveList({
  pages,
  activeId,
  onSelect,
}: {
  pages: SitePage[];
  activeId: string;
  onSelect: (id: string) => void;
}) {
  return (
    <ul className="g-archive">
      {pages.map((page) =>
        page.type === "group" ? (
          <li key={page.id} className="g-archive-group">
            <span>{page.title}</span>
            <ArchiveList pages={page.children} activeId={activeId} onSelect={onSelect} />
          </li>
        ) : (
          <li key={page.id}>
            <a
              href={`#${page.id}`}
              aria-current={page.id === activeId ? "page" : undefined}
              onClick={(event) => {
                event.preventDefault();
                onSelect(page.id);
              }}
            >
              {page.title}
            </a>
          </li>
        ),
      )}
    </ul>
  );
}

function WorkIndex({
  pages,
  photos,
  tags,
  resolveUrl,
  onOpen,
}: {
  pages: SitePage[];
  photos: Photo[];
  tags: Catalog["tags"]["tags"];
  resolveUrl: (photo: Photo, kind: "thumb" | "display") => string;
  onOpen: (id: string) => void;
}) {
  const series = flattenGalleryPages(navPages(pages));
  return (
    <div className="g-work">
      <p className="g-work-intro">my views</p>
      {series.map((page) => {
        const published = filterPhotos(photos, page.filter, tags);
        if (!published.length) return null;
        const first = published[0];
        const src = first
          ? resolveUrl(first, "display")
          : page.cover
            ? `${appBase()}/${page.cover}`
            : "";
        return (
          <button key={page.id} type="button" className="g-work-tile" onClick={() => onOpen(page.id)}>
            {src ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={src} alt="" />
            ) : (
              <span className="g-work-fallback" />
            )}
            <span className="g-work-meta">
              <span>{page.title}</span>
              {page.year ? <span>{page.year}</span> : null}
            </span>
          </button>
        );
      })}
    </div>
  );
}

export function GalleryApp({ catalog, resolveUrl, className }: GalleryAppProps) {
  const leafPages = useMemo(() => flattenLeafPages(catalog.site.pages), [catalog.site.pages]);
  const [pageId, setPageId] = useState(leafPages[0]?.id ?? "work");
  const [lightbox, setLightbox] = useState<number | null>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);

  useEffect(() => {
    const ids = new Set(leafPages.map((p) => p.id));
    const hash = window.location.hash.replace(/^#/, "");
    setPageId((current) => {
      if (hash && ids.has(hash)) return hash;
      if (ids.has(current)) return current;
      return leafPages[0]?.id ?? current;
    });
  }, [leafPages]);

  useEffect(() => {
    const el = stageRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setWidth(Math.floor(el.clientWidth)));
    ro.observe(el);
    setWidth(Math.floor(el.clientWidth));
    return () => ro.disconnect();
  }, [pageId]);

  useEffect(() => {
    if (lightbox != null) return;
    const feed = stageRef.current;
    if (!feed) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey) return;
      const target = event.target as HTMLElement | null;
      const tag = target?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || target?.isContentEditable) return;
      if (event.key === "ArrowDown" || event.key === "ArrowUp") {
        feed.scrollBy({ top: event.key === "ArrowDown" ? 96 : -96 });
      } else if (event.key === "PageDown" || event.key === "PageUp") {
        feed.scrollBy({ top: (event.key === "PageDown" ? 1 : -1) * Math.max(120, feed.clientHeight * 0.9) });
      } else if (event.key === "Home") {
        feed.scrollTo({ top: 0 });
      } else if (event.key === "End") {
        feed.scrollTo({ top: feed.scrollHeight });
      } else {
        return;
      }
      event.preventDefault();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [lightbox, pageId]);

  const layout = catalog.site.layout ?? DEFAULT_LAYOUT;
  const page = leafPages.find((p) => p.id === pageId) ?? leafPages[0];
  const gallery = page?.type === "gallery" ? page : null;
  const items = useMemo(
    () => (gallery ? catalogFeed(catalog, gallery.filter) : []),
    [catalog, gallery],
  );
  const photos = useMemo(
    () => items.flatMap((item) => (item.type === "photo" ? [item.photo] : [])),
    [items],
  );
  const blocks = useMemo(() => layoutEssayFeed(items, width, layout), [items, width, layout]);

  const selectPage = (id: string) => {
    setLightbox(null);
    setPageId(id);
    if (window.location.hash !== `#${id}`) {
      window.history.replaceState(null, "", `#${id}`);
    }
  };

  const openPhoto = (photo: Photo) => {
    const index = photos.findIndex((p) => p.id === photo.id);
    if (index >= 0) setLightbox(index);
  };

  const heading = pageTitle(page, layout.showPageTitle);

  return (
    <div
      className={`theme-gallery-v1 ${className ?? ""}`.trim()}
      style={galleryThemeStyle(layout.background) as React.CSSProperties}
    >
      <div className="g-name">{catalog.site.title}</div>
      {heading ? <h1 className="g-essay-title">{heading}</h1> : <div className="g-essay-title" aria-hidden="true" />}

      <aside className="g-rail">
        <nav aria-label="Archiv">
          <ArchiveList pages={navPages(catalog.site.pages)} activeId={page?.id ?? ""} onSelect={selectPage} />
        </nav>
      </aside>

      <main className="g-essay">
        <div className="g-feed" ref={stageRef}>
          {page?.type === "work" ? (
            <WorkIndex
              pages={catalog.site.pages}
              photos={catalog.photos.photos}
              tags={catalog.tags.tags}
              resolveUrl={resolveUrl}
              onOpen={selectPage}
            />
          ) : page?.type === "contact" ? (
            <ContactForm email={catalog.site.contactEmail} />
          ) : items.length === 0 ? (
            <p className="g-empty">Keine Einträge in dieser Folge.</p>
          ) : (
            blocks.map((block, blockIndex) =>
              block.type === "text" ? (
                <article key={`text-${block.text.id}`} className="g-text">
                  {block.text.title ? <h2>{block.text.title}</h2> : null}
                  {block.text.body
                    ? block.text.body.split(/\n{2,}/).map((paragraph, index) => (
                        <p key={index}>{paragraph}</p>
                      ))
                    : null}
                </article>
              ) : (
                <div key={`row-${blockIndex}`} className="g-row" style={{ height: block.height, gap: layout.gap }}>
                  {block.photos.map((photo, slot) => {
                    const label = photo.title || photo.originalName;
                    return (
                      <button
                        key={`${blockIndex}-${slot}-${photo.id}`}
                        type="button"
                        className="g-shot"
                        style={{
                          width: Math.min(block.widths[slot], photo.width),
                          height: Math.min(block.height, photo.height),
                          maxWidth: photo.width,
                        }}
                        onClick={(event) => {
                          event.currentTarget.blur();
                          openPhoto(photo);
                        }}
                        aria-label={label}
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={resolveUrl(photo, "display")} alt={label} />
                      </button>
                    );
                  })}
                </div>
              ),
            )
          )}
        </div>
      </main>

      {lightbox != null && gallery ? (
        <Lightbox
          photos={photos}
          index={lightbox}
          resolveUrl={(photo) => resolveUrl(photo, "display")}
          onClose={() => setLightbox(null)}
          onIndex={setLightbox}
        />
      ) : null}
    </div>
  );
}
