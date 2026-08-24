"use client";

import { newId } from "@/lib/id";
import {
  DEFAULT_LAYOUT,
  GALLERY_BACKGROUNDS,
  SLIDESHOW_INTERVAL_MAX,
  SLIDESHOW_INTERVAL_MIN,
  isPublishTag,
  pageVisibility,
  type GalleryPage,
  type GroupPage,
  type PageVisibility,
  type SitePage,
} from "@/lib/catalog";
import { LayoutColumnsPicker } from "@/components/editor/layout-columns-picker";
import { useEditorStore } from "@/store/editor-store";

function isGallery(page: SitePage): page is GalleryPage {
  return page.type === "gallery";
}

export function SiteTreeEditor() {
  const site = useEditorStore((s) => s.catalog.site);
  const tags = useEditorStore((s) => s.catalog.tags.tags);
  const updateSite = useEditorStore((s) => s.updateSite);

  const setPages = (pages: SitePage[]) => updateSite({ ...site, pages });

  return (
    <div className="mx-auto w-full max-w-2xl">
      <h2 className="mb-3 text-sm font-medium">Seitenstruktur</h2>
      <p className="mb-4 text-sm text-[var(--edit-muted)]">
        Die Navigation folgt diesem Baum. Pro Galerie-Seite genau ein Tag: dann erscheinen nur Bilder mit diesem Tag.
        „Alle“ zeigt die ganze Sammlung. Sichtbarkeit: öffentlich in der Navigation, eingeschränkt nur per Link,
        privat nur im Editor. Eine Gruppe vererbt die strengere Stufe an ihre Seiten.
      </p>
      <label className="mb-3 block text-xs text-[var(--edit-muted)]">
        Titel der Sammlung
        <input
          className="edit-field mt-1"
          value={site.title}
          onChange={(event) => updateSite({ ...site, title: event.target.value })}
        />
      </label>
      <label className="mb-5 block text-xs text-[var(--edit-muted)]">
        Contact-E-Mail
        <input
          className="edit-field mt-1"
          type="email"
          value={site.contactEmail ?? ""}
          onChange={(event) => updateSite({ ...site, contactEmail: event.target.value })}
        />
      </label>
      <LayoutFields
        layout={site.layout ?? DEFAULT_LAYOUT}
        onChange={(layout) => updateSite({ ...site, layout })}
      />
      <PageList pages={site.pages} tags={tags} onChange={setPages} depth={0} />
      <div className="mt-4 flex gap-2">
        <button
          type="button"
          className="edit-btn"
          onClick={() =>
            setPages([
              ...site.pages,
              { id: newId(), type: "gallery", title: "Neue Seite", visibility: "public", filter: { tags: [] } },
            ])
          }
        >
          Galerie-Seite
        </button>
        <button
          type="button"
          className="edit-btn"
          onClick={() =>
            setPages([...site.pages, { id: newId(), type: "group", title: "Gruppe", visibility: "public", children: [] }])
          }
        >
          Gruppe
        </button>
      </div>
    </div>
  );
}

function LayoutFields({
  layout,
  onChange,
}: {
  layout: typeof DEFAULT_LAYOUT;
  onChange: (layout: typeof DEFAULT_LAYOUT) => void;
}) {
  const set = (patch: Partial<typeof DEFAULT_LAYOUT>) => onChange({ ...layout, ...patch });

  return (
    <section className="mb-6 rounded-xl border border-[var(--edit-line)] bg-[var(--edit-panel)] p-4">
      <h3 className="mb-1 text-sm font-medium">Layout</h3>
      <p className="mb-3 text-xs text-[var(--edit-muted)]">
        Steuert die Bildstrecke. Änderungen erscheinen sofort in der Vorschau.
      </p>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block text-xs text-[var(--edit-muted)]">
          Abstand (px)
          <input
            type="number"
            min={0}
            max={64}
            className="edit-field mt-1"
            value={layout.gap}
            onChange={(event) => set({ gap: Number(event.target.value) || 0 })}
          />
        </label>
        <div className="text-xs text-[var(--edit-muted)] sm:col-span-2">
          <LayoutColumnsPicker value={layout.columns} onChange={(columns) => set({ columns })} />
          <p className="mt-1.5 text-[0.7rem] leading-relaxed">
            1–6 Bilder füllen die Zeile fest. „2–3“ wechselt. „Rand“ legt so viele Bilder in eine Zeile, bis die
            aktuelle Breite erreicht ist — Zeile min/max steuert dann die Packdichte. Kleine Originale werden nicht
            über ihre Pixelbreite vergrößert.
          </p>
        </div>
        <div className="text-xs text-[var(--edit-muted)] sm:col-span-2">
          Hintergrund
          <div className="mt-1.5 flex flex-wrap items-center gap-2">
            {GALLERY_BACKGROUNDS.map((tone) => {
              const selected = layout.background === tone.id;
              return (
                <button
                  key={tone.id}
                  type="button"
                  title={tone.label}
                  aria-label={tone.label}
                  aria-pressed={selected}
                  onClick={() => set({ background: tone.id })}
                  className={`flex items-center gap-2 rounded-full border px-2 py-1 ${
                    selected ? "border-[var(--edit-ink)]" : "border-[var(--edit-line)]"
                  }`}
                >
                  <span
                    className="h-5 w-5 rounded-full border border-black/15"
                    style={{ background: tone.bg }}
                  />
                  {tone.label}
                </button>
              );
            })}
          </div>
        </div>
        <label className="block text-xs text-[var(--edit-muted)]">
          Zeile min. (px)
          <input
            type="number"
            min={80}
            max={600}
            className="edit-field mt-1"
            value={layout.rowMinHeight}
            onChange={(event) => set({ rowMinHeight: Number(event.target.value) || 80 })}
          />
        </label>
        <label className="block text-xs text-[var(--edit-muted)]">
          Zeile max. (px)
          <input
            type="number"
            min={120}
            max={900}
            className="edit-field mt-1"
            value={layout.rowMaxHeight}
            onChange={(event) => set({ rowMaxHeight: Number(event.target.value) || 120 })}
          />
        </label>
        <label className="block text-xs text-[var(--edit-muted)]">
          Diashow-Intervall (s)
          <input
            type="number"
            min={SLIDESHOW_INTERVAL_MIN}
            max={SLIDESHOW_INTERVAL_MAX}
            className="edit-field mt-1"
            value={layout.slideshowInterval ?? DEFAULT_LAYOUT.slideshowInterval}
            onChange={(event) =>
              set({ slideshowInterval: Number(event.target.value) || DEFAULT_LAYOUT.slideshowInterval })
            }
          />
        </label>
      </div>
      <div className="mt-3 flex flex-wrap gap-4 text-xs">
        <label className="inline-flex items-center gap-2 text-[var(--edit-ink)]">
          <input
            type="checkbox"
            checked={layout.showPageTitle}
            onChange={(event) => set({ showPageTitle: event.target.checked })}
          />
          Seitentitel zeigen
        </label>
      </div>
    </section>
  );
}

function PageList({
  pages,
  tags,
  onChange,
  depth,
}: {
  pages: SitePage[];
  tags: { id: string; name: string }[];
  onChange: (pages: SitePage[]) => void;
  depth: number;
}) {
  const move = (index: number, delta: number) => {
    const next = [...pages];
    const target = index + delta;
    if (target < 0 || target >= next.length) return;
    const [item] = next.splice(index, 1);
    next.splice(target, 0, item!);
    onChange(next);
  };

  return (
    <ul className="flex flex-col gap-2" style={{ marginLeft: depth ? 16 : 0 }}>
      {pages.map((page, index) => (
        <li key={page.id} className="rounded-xl border border-[var(--edit-line)] bg-[var(--edit-panel)] p-3">
          <div className="flex flex-wrap items-center gap-2">
            <input
              className="edit-field max-w-xs"
              value={page.title}
              onChange={(event) => {
                const next = [...pages];
                next[index] = { ...page, title: event.target.value };
                onChange(next);
              }}
            />
            <span className="text-[0.7rem] uppercase tracking-wide text-[var(--edit-muted)]">
              {page.type === "gallery"
                ? "Galerie"
                : page.type === "group"
                  ? "Gruppe"
                  : page.type === "work"
                    ? "Work"
                    : "Contact"}
            </span>
            <VisibilityPicker
              value={pageVisibility(page)}
              onChange={(visibility) => {
                const next = [...pages];
                next[index] = { ...page, visibility };
                onChange(next);
              }}
            />
            <button type="button" className="edit-btn" onClick={() => move(index, -1)} disabled={index === 0}>
              Hoch
            </button>
            <button
              type="button"
              className="edit-btn"
              onClick={() => move(index, 1)}
              disabled={index === pages.length - 1}
            >
              Runter
            </button>
            <button
              type="button"
              className="edit-btn"
              onClick={() => onChange(pages.filter((_, i) => i !== index))}
              disabled={depth === 0 && pages.length === 1}
            >
              Entfernen
            </button>
          </div>
          {isGallery(page) ? (
            <div className="mt-3 flex flex-wrap items-center gap-1.5">
              <label className="mr-2 text-xs text-[var(--edit-muted)]">
                Jahr
                <input
                  className="edit-field ml-1 w-20"
                  value={page.year ?? ""}
                  onChange={(event) => {
                    const next = [...pages];
                    next[index] = { ...page, year: event.target.value || undefined };
                    onChange(next);
                  }}
                />
              </label>
              <span className="mr-1 text-xs text-[var(--edit-muted)]">Nur Bilder mit Tag:</span>
              <button
                type="button"
                className={`rounded-full border px-2 py-0.5 text-xs ${
                  page.filter.tags.length === 0
                    ? "border-[var(--edit-ink)] bg-[var(--edit-ink)] text-[#f7f5f1]"
                    : "border-[var(--edit-line)]"
                }`}
                onClick={() => {
                  const next = [...pages];
                  next[index] = { ...page, filter: { tags: [] } };
                  onChange(next);
                }}
              >
                Alle
              </button>
              {tags.filter((tag) => !isPublishTag(tag.id)).length === 0 ? (
                <span className="text-xs text-[var(--edit-muted)]">keine Tags angelegt</span>
              ) : (
                tags.filter((tag) => !isPublishTag(tag.id)).map((tag) => {
                  const on = page.filter.tags.includes(tag.id);
                  return (
                    <button
                      key={tag.id}
                      type="button"
                      className={`rounded-full border px-2 py-0.5 text-xs ${
                        on ? "border-[var(--edit-ink)] bg-[var(--edit-ink)] text-[#f7f5f1]" : "border-[var(--edit-line)]"
                      }`}
                      onClick={() => {
                        const next = [...pages];
                        next[index] = { ...page, filter: { tags: on ? [] : [tag.id] } };
                        onChange(next);
                      }}
                    >
                      {tag.name}
                    </button>
                  );
                })
              )}
            </div>
          ) : page.type === "group" ? (
            <div className="mt-3">
              <PageList
                pages={page.children}
                tags={tags}
                depth={depth + 1}
                onChange={(children) => {
                  const next = [...pages];
                  next[index] = { ...page, children } satisfies GroupPage;
                  onChange(next);
                }}
              />
              <button
                type="button"
                className="edit-btn mt-2"
                onClick={() => {
                  const next = [...pages];
                  const group = page;
                  next[index] = {
                    ...group,
                    children: [
                      ...group.children,
                      { id: newId(), type: "gallery", title: "Neue Seite", visibility: "public", filter: { tags: [] } },
                    ],
                  };
                  onChange(next);
                }}
              >
                Seite in Gruppe
              </button>
            </div>
          ) : null}
        </li>
      ))}
    </ul>
  );
}

const VISIBILITY: { id: PageVisibility; label: string }[] = [
  { id: "public", label: "public" },
  { id: "restricted", label: "restricted" },
  { id: "private", label: "private" },
];

function VisibilityPicker({
  value,
  onChange,
}: {
  value: PageVisibility;
  onChange: (value: PageVisibility) => void;
}) {
  return (
    <div className="flex gap-1">
      {VISIBILITY.map((item) => (
        <button
          key={item.id}
          type="button"
          className={`edit-btn px-2 py-0.5 text-[0.7rem] ${value === item.id ? "edit-btn-primary" : ""}`}
          onClick={() => onChange(item.id)}
        >
          {item.label}
        </button>
      ))}
    </div>
  );
}
