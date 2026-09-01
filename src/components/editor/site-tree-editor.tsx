"use client";

import { newId } from "@/lib/id";
import {
  DEFAULT_LAYOUT,
  DEFAULT_PROTECTION,
  emptyGalleryFilter,
  FADE_IN_DURATION_MAX,
  FADE_IN_DURATION_MIN,
  galleryFilterSpec,
  GALLERY_BACKGROUNDS,
  hasPageOrder,
  SLIDESHOW_INTERVAL_MAX,
  SLIDESHOW_INTERVAL_MIN,
  pageVisibility,
  photosForCover,
  withPageFilterSpec,
  type Catalog,
  type GalleryPage,
  type GroupPage,
  type PageVisibility,
  type Photo,
  type SitePage,
} from "@/lib/catalog";
import { FilterCriteriaBar } from "@/components/editor/filter-criteria";
import { LayoutColumnsPicker } from "@/components/editor/layout-columns-picker";
import { useEditorStore } from "@/store/editor-store";

function isGallery(page: SitePage): page is GalleryPage {
  return page.type === "gallery";
}

export function SiteTreeEditor() {
  const site = useEditorStore((s) => s.catalog.site);
  const catalog = useEditorStore((s) => s.catalog);
  const updateSite = useEditorStore((s) => s.updateSite);
  const projectSync = useEditorStore((s) => s.projectSync);
  const updateProjectSync = useEditorStore((s) => s.updateProjectSync);
  const galleryPassword = useEditorStore((s) => s.galleryPassword);
  const setGalleryPassword = useEditorStore((s) => s.setGalleryPassword);

  const setPages = (pages: SitePage[]) => updateSite({ ...site, pages });
  const protection = site.protection ?? DEFAULT_PROTECTION;

  return (
    <div className="mx-auto w-full max-w-4xl">
      <h2 className="mb-3 text-sm font-medium">Seitenstruktur</h2>
      <p className="mb-4 text-sm text-[var(--edit-muted)]">
        Navigation und Filter je Seite. Ohne Kriterien erscheinen alle Bilder.
      </p>
      <label className="mb-3 block text-xs text-[var(--edit-muted)]">
        Titel der Sammlung
        <input
          className="edit-field mt-1"
          value={site.title}
          onChange={(event) => updateSite({ ...site, title: event.target.value })}
        />
      </label>
      <label className="mb-3 block text-xs text-[var(--edit-muted)]">
        Contact-E-Mail
        <input
          className="edit-field mt-1"
          type="email"
          value={site.contactEmail ?? ""}
          onChange={(event) => updateSite({ ...site, contactEmail: event.target.value })}
        />
      </label>
      <label className="mb-1 block text-xs text-[var(--edit-muted)]">
        Unterordner auf dem Server
        <input
          className="edit-field mt-1"
          value={site.publishPath ?? ""}
          placeholder="leer = Website-Wurzel"
          spellCheck={false}
          onChange={(event) => {
            const next = event.target.value.trim().replace(/^\/+|\/+$/g, "").replace(/[^A-Za-z0-9._-]/g, "");
            updateSite({ ...site, publishPath: next });
          }}
        />
      </label>
      <p className="mb-5 text-xs text-[var(--edit-muted)]">
        Beispiel „rotterdam“ erscheint unter /rotterdam/. „Zum Server“ legt rotterdam.deploy
        neben der Hauptgalerie an — dafür den übergeordneten Ordner wählen (z. B. c2.site),
        nicht den Projektordner.
      </p>
      <label className="mb-3 block text-xs text-[var(--edit-muted)]">
        Server-Host
        <input
          className="edit-field mt-1"
          value={projectSync.host}
          placeholder="c2-strato"
          spellCheck={false}
          onChange={(event) => updateProjectSync({ host: event.target.value.trim() })}
        />
      </label>
      <label className="mb-1 block text-xs text-[var(--edit-muted)]">
        Ordner auf dem Server
        <input
          className="edit-field mt-1"
          value={projectSync.remote}
          placeholder="likibox"
          spellCheck={false}
          onChange={(event) =>
            updateProjectSync({ remote: event.target.value.trim().replace(/^\/+|\/+$/g, "") })
          }
        />
      </label>
      <p className="mb-5 text-xs text-[var(--edit-muted)]">
        Wird mit dem Projekt in data/sync.json gespeichert, nicht im öffentlichen Deploy. Passwort
        bleibt in rclone bzw. SSH.
      </p>
      <LayoutFields
        layout={site.layout ?? DEFAULT_LAYOUT}
        onChange={(layout) => updateSite({ ...site, layout })}
      />
      <ProtectionFields
        protection={protection}
        password={galleryPassword}
        onProtection={(next) => updateSite({ ...site, protection: next })}
        onPassword={setGalleryPassword}
      />
      <PageList pages={site.pages} catalog={catalog} onChange={setPages} depth={0} />
      <div className="mt-4 flex gap-2">
        <button
          type="button"
          className="edit-btn"
          onClick={() => setPages([...site.pages, newGalleryPage()])}
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
      <h3 className="mb-1 text-sm font-medium">Anzeige</h3>
      <p className="mb-3 text-xs text-[var(--edit-muted)]">
        Ein Deploy, diese Schalter gelten für Vorschau und öffentliche Seite.
      </p>
      <div className="mb-4 text-xs text-[var(--edit-muted)]">
        Bilder zeigen als
        <div className="mt-1.5 flex flex-wrap gap-2">
          {(
            [
              ["gallery", "Galerie"],
              ["roadtrip", "Roadtrip"],
            ] as const
          ).map(([id, label]) => {
            const selected = layout.view === id;
            return (
              <button
                key={id}
                type="button"
                aria-pressed={selected}
                className={`rounded-full border px-3 py-1 ${
                  selected ? "border-[var(--edit-ink)] text-[var(--edit-ink)]" : "border-[var(--edit-line)]"
                }`}
                onClick={() => set({ view: id })}
              >
                {label}
              </button>
            );
          })}
        </div>
      </div>
      <div className="mb-4 flex flex-wrap gap-4 text-xs">
        <label className="inline-flex items-center gap-2 text-[var(--edit-ink)]">
          <input
            type="checkbox"
            checked={layout.lightbox}
            onChange={(event) => set({ lightbox: event.target.checked })}
          />
          Detailansicht
        </label>
        <label className="inline-flex items-center gap-2 text-[var(--edit-ink)]">
          <input
            type="checkbox"
            checked={layout.slideshow}
            onChange={(event) => set({ slideshow: event.target.checked })}
          />
          Abspielen
        </label>
        <label className="inline-flex items-center gap-2 text-[var(--edit-ink)]">
          <input
            type="checkbox"
            checked={layout.fullscreen}
            onChange={(event) => set({ fullscreen: event.target.checked })}
          />
          Vollbild
        </label>
        {layout.view === "roadtrip" ? (
          <>
            <label className="inline-flex items-center gap-2 text-[var(--edit-ink)]">
              <input type="checkbox" checked={layout.map} onChange={(event) => set({ map: event.target.checked })} />
              Karte
            </label>
            <label className="inline-flex items-center gap-2 text-[var(--edit-ink)]">
              <input
                type="checkbox"
                checked={layout.overview}
                onChange={(event) => set({ overview: event.target.checked })}
              />
              Übersicht
            </label>
          </>
        ) : null}
      </div>
      <h3 className="mb-1 text-sm font-medium">Layout</h3>
      <p className="mb-3 text-xs text-[var(--edit-muted)]">
        Steuert die Bildstrecke. Änderungen erscheinen sofort in der Vorschau.
      </p>
      <div className="grid gap-3 sm:grid-cols-2">
        {layout.view === "gallery" ? (
          <>
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
          </>
        ) : null}
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
        {layout.slideshow ? (
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
        ) : null}
        <label className="block text-xs text-[var(--edit-muted)]">
          Einblend-Dauer (s)
          <input
            type="number"
            min={FADE_IN_DURATION_MIN}
            max={FADE_IN_DURATION_MAX}
            step={0.1}
            className="edit-field mt-1"
            disabled={!(layout.fadeIn ?? DEFAULT_LAYOUT.fadeIn)}
            value={layout.fadeInDuration ?? DEFAULT_LAYOUT.fadeInDuration}
            onChange={(event) =>
              set({ fadeInDuration: Number(event.target.value) || DEFAULT_LAYOUT.fadeInDuration })
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
        <label className="inline-flex items-center gap-2 text-[var(--edit-ink)]">
          <input
            type="checkbox"
            checked={layout.fadeIn ?? DEFAULT_LAYOUT.fadeIn}
            onChange={(event) => set({ fadeIn: event.target.checked })}
          />
          Einblend-Effekt
        </label>
      </div>
    </section>
  );
}

function ProtectionFields({
  protection,
  password,
  onProtection,
  onPassword,
}: {
  protection: typeof DEFAULT_PROTECTION;
  password: string;
  onProtection: (protection: typeof DEFAULT_PROTECTION) => void;
  onPassword: (password: string) => void;
}) {
  return (
    <section className="mb-6 rounded-xl border border-[var(--edit-line)] bg-[var(--edit-panel)] p-4">
      <h3 className="mb-1 text-sm font-medium">Bildschutz</h3>
      <p className="mb-3 text-xs text-[var(--edit-muted)]">
        Rechtsklick in der Galerie wird unterbunden. Ein Passwort macht die Dateien im Deploy-Ordner unlesbar — direkte
        URLs sind dann kein Bild mehr. Screenshots und Speichern nach dem Entsperren bleiben möglich.
      </p>
      <label className="mb-3 flex items-start gap-2 text-xs text-[var(--edit-ink)]">
        <input
          type="checkbox"
          className="mt-0.5"
          checked={protection.watermark}
          onChange={(event) => onProtection({ ...protection, watermark: event.target.checked })}
        />
        <span>
          Wasserzeichen auf Display-Bildern
          <span className="mt-0.5 block text-[var(--edit-muted)]">Wird beim Deploy unten rechts eingebrannt.</span>
        </span>
      </label>
      {protection.watermark ? (
        <label className="mb-3 block text-xs text-[var(--edit-muted)]">
          Wasserzeichen-Text
          <input
            className="edit-field mt-1"
            value={protection.watermarkText}
            placeholder="Leer = Titel der Sammlung"
            onChange={(event) => onProtection({ ...protection, watermarkText: event.target.value })}
          />
        </label>
      ) : null}
      <label className="mb-3 flex items-start gap-2 text-xs text-[var(--edit-ink)]">
        <input
          type="checkbox"
          className="mt-0.5"
          checked={protection.passwordProtect}
          onChange={(event) => onProtection({ ...protection, passwordProtect: event.target.checked })}
        />
        <span>
          Galerie mit Passwort schützen
          <span className="mt-0.5 block text-[var(--edit-muted)]">
            Display- und Vorschaubilder werden verschlüsselt. Das Passwort steht nur in diesem Projekt, nicht in der
            veröffentlichten Site.
          </span>
        </span>
      </label>
      {protection.passwordProtect ? (
        <label className="block text-xs text-[var(--edit-muted)]">
          Passwort
          <input
            className="edit-field mt-1"
            type="password"
            autoComplete="new-password"
            value={password}
            onChange={(event) => onPassword(event.target.value)}
          />
        </label>
      ) : null}
    </section>
  );
}

function newGalleryPage(): GalleryPage {
  return { id: newId(), type: "gallery", title: "Neue Seite", visibility: "public", filter: emptyGalleryFilter() };
}

function childPageCount(page: GroupPage): number {
  return page.children.reduce((count, child) => {
    if (child.type === "group") return count + childPageCount(child);
    return count + 1;
  }, 0);
}

function TypeBadge({ page }: { page: SitePage }) {
  if (page.type === "group") {
    return (
      <span className="rounded bg-[var(--edit-ink)] px-1.5 py-0.5 text-[0.65rem] font-semibold uppercase tracking-wider text-[#f7f5f1]">
        Gruppe
      </span>
    );
  }
  const label = page.type === "gallery" ? "Galerie-Seite" : page.type === "work" ? "Work" : "Contact";
  return (
    <span className="rounded border border-[var(--edit-line)] bg-white/80 px-1.5 py-0.5 text-[0.65rem] uppercase tracking-wide text-[var(--edit-muted)]">
      {label}
    </span>
  );
}

function PageToolbar({
  page,
  index,
  pages,
  depth,
  onChange,
  move,
}: {
  page: SitePage;
  index: number;
  pages: SitePage[];
  depth: number;
  onChange: (pages: SitePage[]) => void;
  move: (index: number, delta: number) => void;
}) {
  const groupCount = page.type === "group" ? childPageCount(page) : 0;
  return (
    <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
      <TypeBadge page={page} />
      <input
        className="edit-field max-w-xs"
        value={page.title}
        onChange={(event) => {
          const next = [...pages];
          next[index] = { ...page, title: event.target.value };
          onChange(next);
        }}
      />
      {page.type === "group" ? (
        <span className="text-xs text-[var(--edit-muted)]">
          {groupCount === 0 ? "noch keine Seiten" : `${groupCount} Seite${groupCount === 1 ? "" : "n"}`}
        </span>
      ) : null}
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
  );
}

function PageList({
  pages,
  catalog,
  onChange,
  depth,
}: {
  pages: SitePage[];
  catalog: Catalog;
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
    <ul className={`flex flex-col ${depth ? "gap-2" : "gap-3"}`}>
      {pages.map((page, index) => {
        const toolbar = (
          <PageToolbar page={page} index={index} pages={pages} depth={depth} onChange={onChange} move={move} />
        );
        if (page.type === "group") {
          return (
            <li key={page.id}>
              <article className="overflow-hidden rounded-2xl border border-[rgba(28,27,25,0.22)] border-l-4 border-l-[var(--edit-ink)] bg-[#ddd8d0] shadow-[0_1px_2px_rgba(28,27,25,0.06)]">
                <header className="flex flex-wrap items-center gap-2 bg-[#cfc9bf] px-3 py-2.5">
                  {toolbar}
                </header>
                <div className="p-3">
                  <CoverPicker
                    value={page.cover}
                    photos={photosForCover(page, catalog)}
                    emptyLabel="Automatisch (Seiten einzeln)"
                    onChange={(cover) => {
                      const next = [...pages];
                      next[index] = { ...page, cover };
                      onChange(next);
                    }}
                  />
                  <div className="mt-3 rounded-xl bg-[var(--edit-bg)] p-3 ring-1 ring-inset ring-[rgba(28,27,25,0.08)]">
                    <p className="mb-2 text-[0.7rem] font-medium uppercase tracking-wide text-[var(--edit-muted)]">
                      Seiten in dieser Gruppe
                    </p>
                    {page.children.length === 0 ? (
                      <p className="mb-2 text-xs text-[var(--edit-muted)]">Noch keine Seiten — unten anlegen.</p>
                    ) : (
                      <PageList
                        pages={page.children}
                        catalog={catalog}
                        depth={depth + 1}
                        onChange={(children) => {
                          const next = [...pages];
                          next[index] = { ...page, children } satisfies GroupPage;
                          onChange(next);
                        }}
                      />
                    )}
                    <button
                      type="button"
                      className="edit-btn mt-2"
                      onClick={() => {
                        const next = [...pages];
                        next[index] = {
                          ...page,
                          children: [...page.children, newGalleryPage()],
                        };
                        onChange(next);
                      }}
                    >
                      Seite in Gruppe
                    </button>
                  </div>
                </div>
              </article>
            </li>
          );
        }
        return (
          <li key={page.id}>
            <article className="rounded-xl border border-[var(--edit-line)] bg-[var(--edit-panel)] p-3">
              <div className="flex flex-wrap items-center gap-2">{toolbar}</div>
              {isGallery(page) ? (
                <>
                  <div className="mt-3 space-y-2 border-t border-[var(--edit-line)] pt-3">
                    <label className="block text-xs text-[var(--edit-muted)]">
                      Jahr
                      <input
                        className="edit-field mt-1 w-24"
                        value={page.year ?? ""}
                        onChange={(event) => {
                          const next = [...pages];
                          next[index] = { ...page, year: event.target.value || undefined };
                          onChange(next);
                        }}
                      />
                    </label>
                    <div>
                      <div className="mb-1.5 text-xs text-[var(--edit-muted)]">Bilder dieser Seite</div>
                      <FilterCriteriaBar
                        spec={galleryFilterSpec(page.filter)}
                        onChange={(spec) => {
                          const next = [...pages];
                          next[index] = { ...page, filter: withPageFilterSpec(page.filter, spec) };
                          onChange(next);
                        }}
                        tags={catalog.tags.tags}
                      />
                    </div>
                    <div className="flex flex-wrap items-center gap-1.5">
                      <button
                        type="button"
                        className="edit-btn"
                        title="Älteste zuerst. Die Reihenfolge gilt nur für diese Seite."
                        onClick={() => {
                          if (
                            !window.confirm(
                              "Bilder dieser Seite nach Aufnahmezeit sortieren (älteste zuerst)? Die Reihenfolge gilt nur für diese Seite.",
                            )
                          ) {
                            return;
                          }
                          useEditorStore.getState().sortGalleryByTakenAt(page.id);
                        }}
                      >
                        Nach Aufnahmezeit
                      </button>
                      {hasPageOrder(page.filter) ? (
                        <button
                          type="button"
                          className="edit-btn px-2 py-0.5 text-xs"
                          title="Eigene Reihenfolge löschen und wieder die allgemeine nutzen"
                          onClick={() => useEditorStore.getState().clearPageOrder(page.id)}
                        >
                          Reihenfolge zurücksetzen
                        </button>
                      ) : null}
                    </div>
                  </div>
                  <CoverPicker
                    value={page.cover}
                    photos={photosForCover(page, catalog)}
                    emptyLabel="Automatisch (erstes Bild)"
                    onChange={(cover) => {
                      const next = [...pages];
                      next[index] = { ...page, cover };
                      onChange(next);
                    }}
                  />
                </>
              ) : null}
            </article>
          </li>
        );
      })}
    </ul>
  );
}

function CoverPicker({
  value,
  photos,
  emptyLabel,
  onChange,
}: {
  value?: string;
  photos: Photo[];
  emptyLabel: string;
  onChange: (cover: string | undefined) => void;
}) {
  const thumbUrls = useEditorStore((s) => s.thumbUrls);
  if (!photos.length) {
    return <p className="mt-3 text-xs text-[var(--edit-muted)]">Index-Bild: keine Bilder in dieser Auswahl.</p>;
  }
  return (
    <div className="mt-3">
      <div className="mb-1.5 text-xs text-[var(--edit-muted)]">Index-Bild — anklicken</div>
      <div className="flex max-h-40 flex-wrap content-start gap-1 overflow-auto">
        <button
          type="button"
          title={emptyLabel}
          aria-label={emptyLabel}
          aria-pressed={!value}
          onClick={() => onChange(undefined)}
          className={`flex h-14 w-14 shrink-0 items-center justify-center rounded border px-1 text-center text-[0.65rem] leading-tight ${
            !value
              ? "border-[var(--edit-ink)] bg-[var(--edit-ink)] text-[#f7f5f1]"
              : "border-[var(--edit-line)] text-[var(--edit-muted)]"
          }`}
        >
          Auto
        </button>
        {photos.map((photo) => {
          const on = value === photo.id;
          const src = thumbUrls[photo.id];
          return (
            <button
              key={photo.id}
              type="button"
              title={photo.title.trim() || photo.originalName}
              aria-label={photo.title.trim() || photo.originalName}
              aria-pressed={on}
              onClick={() => onChange(on ? undefined : photo.id)}
              className={`relative h-14 w-14 shrink-0 overflow-hidden rounded border ${
                on ? "border-[var(--edit-ink)] ring-1 ring-[var(--edit-ink)]" : "border-transparent"
              }`}
            >
              {src ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={src} alt="" className="pointer-events-none h-full w-full object-cover" />
              ) : (
                <span className="block h-full w-full bg-[#ddd8d0]" />
              )}
            </button>
          );
        })}
      </div>
    </div>
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
