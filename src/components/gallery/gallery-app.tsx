"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  DEFAULT_LAYOUT,
  catalogFeedForPage,
  clampFadeInDuration,
  clampSlideshowInterval,
  coverPhoto,
  galleryThemeStyle,
  flattenLeafPages,
  navPages,
  workIndexTiles,
  type Catalog,
  type LeafPage,
  type Photo,
  type SitePage,
} from "@/lib/catalog";
import { layoutEssayFeed } from "@/lib/essay";
import { ContactForm } from "./contact-form";
import { Lightbox } from "./lightbox";
import { SaveGuard } from "./protect-images";

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
  catalog,
  resolveUrl,
  onOpen,
}: {
  catalog: Catalog;
  resolveUrl: (photo: Photo, kind: "thumb" | "display") => string;
  onOpen: (id: string) => void;
}) {
  const tiles = workIndexTiles(catalog.site.pages);
  return (
    <div className="g-work">
      <p className="g-work-intro">my views</p>
      {tiles.map(({ page, openId }) => {
        const photo = coverPhoto(page, catalog);
        if (!photo) return null;
        const year = page.type === "gallery" ? page.year : undefined;
        return (
          <button key={page.id} type="button" className="g-work-tile" onClick={() => onOpen(openId)}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={resolveUrl(photo, "display")} alt="" draggable={false} />
            <span className="g-work-meta">
              <span>{page.title}</span>
              {year ? <span>{year}</span> : null}
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
  const [slideshow, setSlideshow] = useState(false);
  const [wantFullscreen, setWantFullscreen] = useState(false);
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
    () => (gallery ? catalogFeedForPage(catalog, gallery) : []),
    [catalog, gallery],
  );
  const photos = useMemo(
    () => items.flatMap((item) => (item.type === "photo" ? [item.photo] : [])),
    [items],
  );
  const blocks = useMemo(() => layoutEssayFeed(items, width, layout), [items, width, layout]);

  const selectPage = (id: string) => {
    setLightbox(null);
    setSlideshow(false);
    setWantFullscreen(false);
    setPageId(id);
    if (window.location.hash !== `#${id}`) {
      window.history.replaceState(null, "", `#${id}`);
    }
  };

  const openPhoto = (photo: Photo) => {
    const index = photos.findIndex((p) => p.id === photo.id);
    if (index >= 0) {
      setSlideshow(false);
      setWantFullscreen(false);
      setLightbox(index);
    }
  };

  const startSlideshow = () => {
    if (!photos.length) return;
    setSlideshow(true);
    setLightbox(0);
  };

  const startFullscreen = () => {
    if (!photos.length) return;
    setWantFullscreen(true);
    setLightbox(lightbox ?? 0);
  };

  const closeLightbox = () => {
    setSlideshow(false);
    setWantFullscreen(false);
    setLightbox(null);
  };

  const heading = pageTitle(page, layout.showPageTitle);
  const intervalMs = clampSlideshowInterval(layout.slideshowInterval ?? DEFAULT_LAYOUT.slideshowInterval) * 1000;
  const fadeIn = layout.fadeIn ?? DEFAULT_LAYOUT.fadeIn;
  const fadeDuration = clampFadeInDuration(layout.fadeInDuration ?? DEFAULT_LAYOUT.fadeInDuration);

  return (
    <SaveGuard className={className}>
      <div
        className={fadeIn ? "theme-gallery-v1 g-fade-in" : "theme-gallery-v1"}
        style={
          {
            ...galleryThemeStyle(layout.background),
            "--g-fade-duration": `${fadeDuration}s`,
          } as React.CSSProperties
        }
      >
      <div className="g-name">{catalog.site.title}</div>
      <div className="g-essay-head">
        {heading ? <h1 className="g-essay-title">{heading}</h1> : <div className="g-essay-title" aria-hidden="true" />}
        {gallery && photos.length > 0 ? (
          <div className="g-essay-actions">
          <button
            type="button"
            className="g-slideshow"
            onClick={startSlideshow}
            title="Diashow starten"
            aria-label="Diashow starten"
          >
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path
                d="M8 6.2v11.6L18.5 12z"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </button>
          <button
            type="button"
            className="g-slideshow"
            onClick={startFullscreen}
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
          </div>
        ) : null}
      </div>

      <aside className="g-rail">
        <nav aria-label="Archiv">
          <ArchiveList pages={navPages(catalog.site.pages)} activeId={page?.id ?? ""} onSelect={selectPage} />
        </nav>
      </aside>

      <main className="g-essay">
        <div className="g-feed" ref={stageRef}>
          {page?.type === "work" ? (
            <WorkIndex catalog={catalog} resolveUrl={resolveUrl} onOpen={selectPage} />
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
                <div
                  key={`row-${blockIndex}`}
                  className="g-row"
                  style={{ height: block.height, gap: layout.gap, marginBottom: layout.gap }}
                >
                  {block.photos.map((photo, slot) => {
                    const label = photo.title || photo.originalName;
                    const caption = photo.caption.trim();
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
                        aria-label={caption ? `${label}. ${caption}` : label}
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={resolveUrl(photo, "display")} alt={label} draggable={false} />
                        {caption ? <span className="g-shot-caption">{caption}</span> : null}
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
          onClose={closeLightbox}
          onIndex={setLightbox}
          playing={slideshow}
          onPlaying={setSlideshow}
          intervalMs={intervalMs}
          enterFullscreen={wantFullscreen}
        />
      ) : null}
      </div>
    </SaveGuard>
  );
}
