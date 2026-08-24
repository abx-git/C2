"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import {
  catalogFeed,
  DEFAULT_LAYOUT,
  hasCatalogTag,
  isPublishTag,
  type FeedItem,
  type Photo,
} from "@/lib/catalog";
import { Lightbox } from "@/components/gallery/lightbox";
import { LayoutColumnsPicker } from "@/components/editor/layout-columns-picker";
import { useEditorStore } from "@/store/editor-store";

type FilterMode = "include" | "exclude";

function itemId(item: FeedItem): string {
  return item.type === "photo" ? item.photo.id : item.text.id;
}

function itemEntity(item: FeedItem): { tags: string[] } {
  return item.type === "photo" ? item.photo : item.text;
}

function isFileDrag(event: React.DragEvent) {
  return Array.from(event.dataTransfer.types).includes("Files");
}

function itemSearchText(item: FeedItem): string {
  if (item.type === "photo") {
    return [item.photo.title, item.photo.caption, item.photo.originalName].join("\n");
  }
  return [item.text.title, item.text.body].join("\n");
}

function matchesQuery(item: FeedItem, query: string): boolean {
  const needle = query.trim().toLocaleLowerCase("de");
  if (!needle) return true;
  return itemSearchText(item).toLocaleLowerCase("de").includes(needle);
}

function filesFromDrop(event: React.DragEvent): File[] {
  const listed = Array.from(event.dataTransfer.files ?? []);
  if (listed.length) return listed;
  const fromItems: File[] = [];
  for (const item of Array.from(event.dataTransfer.items ?? [])) {
    if (item.kind !== "file") continue;
    const file = item.getAsFile();
    if (file) fromItems.push(file);
  }
  return fromItems;
}

export function PhotoLibrary() {
  const catalog = useEditorStore((s) => s.catalog);
  const photos = catalog.photos.photos;
  const tags = catalog.tags.tags;
  const selectedPhotoId = useEditorStore((s) => s.selectedPhotoId);
  const selectedPhotoIds = useEditorStore((s) => s.selectedPhotoIds);
  const previewPhotoId = useEditorStore((s) => s.previewPhotoId);
  const thumbUrls = useEditorStore((s) => s.thumbUrls);
  const displayUrls = useEditorStore((s) => s.displayUrls);
  const importFiles = useEditorStore((s) => s.importFiles);
  const selectPhoto = useEditorStore((s) => s.selectPhoto);
  const togglePhotoSelected = useEditorStore((s) => s.togglePhotoSelected);
  const selectPhotos = useEditorStore((s) => s.selectPhotos);
  const openPreview = useEditorStore((s) => s.openPreview);
  const closePreview = useEditorStore((s) => s.closePreview);
  const reorderPhotos = useEditorStore((s) => s.reorderPhotos);
  const addTextTile = useEditorStore((s) => s.addTextTile);
  const updateSite = useEditorStore((s) => s.updateSite);
  const importProgress = useEditorStore((s) => s.importProgress);
  const canWrite = useEditorStore((s) => s.canWrite);
  const [draggingFiles, setDraggingFiles] = useState(false);
  const [dropTargetId, setDropTargetId] = useState<string | null>(null);
  const [dropAfter, setDropAfter] = useState(false);
  const [filter, setFilter] = useState<Record<string, FilterMode>>({});
  const [query, setQuery] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const reordering = useRef(false);
  const didDrag = useRef(false);
  const fileInsertBeforeRef = useRef<string | null>(null);

  const cycleTag = (id: string) => {
    setFilter((current) => {
      const next = { ...current };
      const mode = next[id];
      if (mode === "include") next[id] = "exclude";
      else if (mode === "exclude") delete next[id];
      else next[id] = "include";
      return next;
    });
  };

  const visible = useMemo(() => {
    const include = Object.entries(filter)
      .filter(([, mode]) => mode === "include")
      .map(([id]) => id);
    const exclude = Object.entries(filter)
      .filter(([, mode]) => mode === "exclude")
      .map(([id]) => id);
    let items = catalogFeed(catalog, include.length ? { tags: include } : undefined);
    if (exclude.length) {
      items = items.filter(
        (item) => !exclude.some((id) => hasCatalogTag(itemEntity(item), id, tags)),
      );
    }
    if (query.trim()) items = items.filter((item) => matchesQuery(item, query));
    return items;
  }, [filter, query, catalog, tags]);

  const visibleIds = visible.map(itemId);
  const visiblePhotos = visible.flatMap((item) => (item.type === "photo" ? [item.photo] : []));
  const tagFilterActive = Object.keys(filter).length > 0;
  const queryActive = query.trim().length > 0;
  const filterActive = tagFilterActive || queryActive;
  const previewPhotos = visiblePhotos.length ? visiblePhotos : photos;
  const previewAt = previewPhotoId ? previewPhotos.findIndex((photo) => photo.id === previewPhotoId) : -1;
  const textCount = catalog.texts?.texts.length ?? 0;
  const emptyLibrary = photos.length === 0 && textCount === 0;

  const onFiles = useCallback(
    (list: FileList | File[] | null, beforeId?: string | null) => {
      if (!list) return;
      const files = Array.from(list);
      if (!files.length) return;
      void importFiles(files, beforeId);
    },
    [importFiles],
  );

  const feedIds = useMemo(() => catalogFeed(catalog).map(itemId), [catalog]);

  const beforeIdForTile = (id: string, after: boolean) => {
    if (!after) return id;
    const index = feedIds.indexOf(id);
    if (index < 0 || index >= feedIds.length - 1) return null;
    return feedIds[index + 1]!;
  };

  const acceptFileDrop = (event: React.DragEvent, beforeId?: string | null) => {
    event.preventDefault();
    event.stopPropagation();
    const at = beforeId !== undefined ? beforeId : fileInsertBeforeRef.current;
    setDraggingFiles(false);
    setDropTargetId(null);
    setDropAfter(false);
    fileInsertBeforeRef.current = null;
    onFiles(filesFromDrop(event), at);
  };

  const selectItem = (item: FeedItem, event: React.MouseEvent) => {
    const id = itemId(item);
    if (event.metaKey || event.ctrlKey) {
      togglePhotoSelected(id);
      return;
    }
    if (event.shiftKey && selectedPhotoId) {
      const from = visibleIds.indexOf(selectedPhotoId);
      const to = visibleIds.indexOf(id);
      if (from >= 0 && to >= 0) {
        const start = Math.min(from, to);
        const end = Math.max(from, to);
        selectPhotos(visibleIds.slice(start, end + 1), id);
        return;
      }
    }
    selectPhoto(id);
  };

  return (
    <div
      className="relative flex min-h-0 flex-1 flex-col"
      onDragEnter={(event) => {
        event.preventDefault();
        if (reordering.current || !isFileDrag(event)) return;
        setDraggingFiles(true);
      }}
      onDragOver={(event) => {
        if (reordering.current || !isFileDrag(event)) return;
        event.preventDefault();
        event.dataTransfer.dropEffect = "copy";
        setDraggingFiles(true);
      }}
      onDragLeave={(event) => {
        const next = event.relatedTarget as Node | null;
        if (next && event.currentTarget.contains(next)) return;
        setDraggingFiles(false);
        setDropTargetId(null);
        setDropAfter(false);
        fileInsertBeforeRef.current = null;
      }}
      onDrop={(event) => {
        if (!isFileDrag(event)) return;
        acceptFileDrop(event);
      }}
    >
      <div className="mb-3 shrink-0 space-y-2">
        <div className="flex items-center justify-between gap-3">
          <p className="text-sm text-[var(--edit-muted)]">
            {filterActive ? `${visible.length} von ${photos.length + textCount}` : `${photos.length} Bild${photos.length === 1 ? "" : "er"}`}
            {textCount ? ` · ${textCount} Text` : ""}
            {selectedPhotoIds.length > 1 ? ` · ${selectedPhotoIds.length} ausgewählt` : ""}
            {photos.length + textCount > 1 ? " · ziehen zum Sortieren" : ""}
            {importProgress
              ? ` · Import ${importProgress.current}/${importProgress.total}: ${importProgress.name}`
              : ""}
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              className="edit-btn"
              disabled={!visible.length}
              onClick={() => selectPhotos(visibleIds)}
            >
              Sichtbare wählen
            </button>
            {selectedPhotoIds.length > 0 ? (
              <button type="button" className="edit-btn" onClick={() => selectPhotos([])}>
                Auswahl aufheben
              </button>
            ) : null}
            <button type="button" className="edit-btn" disabled={!canWrite} onClick={() => addTextTile()}>
              Textkachel
            </button>
            <button
              type="button"
              className="edit-btn"
              disabled={!canWrite}
              onClick={() => inputRef.current?.click()}
            >
              Bilder wählen
            </button>
          </div>
          <input
            ref={inputRef}
            type="file"
            accept="image/*"
            multiple
            className="hidden"
            onChange={(event) => {
              onFiles(event.target.files);
              event.target.value = "";
            }}
          />
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="mr-1 text-xs text-[var(--edit-muted)]">Filter:</span>
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Titel oder Text"
            aria-label="Nach Titel oder Text suchen"
            className="edit-field w-44 max-w-full py-0.5 text-xs"
          />
          <button
            type="button"
            className={`rounded-full border px-2 py-0.5 text-xs ${
              !filterActive
                ? "border-[var(--edit-ink)] bg-[var(--edit-ink)] text-[#f7f5f1]"
                : "border-[var(--edit-line)] bg-[var(--edit-panel)]"
            }`}
            onClick={() => {
              setFilter({});
              setQuery("");
            }}
          >
            Alle
          </button>
          {[...tags].sort((a, b) => Number(isPublishTag(b)) - Number(isPublishTag(a))).map((tag) => {
            const mode = filter[tag.id];
            return (
              <button
                key={tag.id}
                type="button"
                title={
                  mode === "include"
                    ? "Nochmals klicken: Tag ausschließen"
                    : mode === "exclude"
                      ? "Nochmals klicken: Filter lösen"
                      : "Klicken: nach Tag filtern"
                }
                className={`rounded-full border px-2 py-0.5 text-xs ${
                  mode === "include"
                    ? "border-[var(--edit-ink)] bg-[var(--edit-ink)] text-[#f7f5f1]"
                    : mode === "exclude"
                      ? "border-[var(--edit-ink)] bg-transparent text-[var(--edit-ink)] line-through"
                      : "border-[var(--edit-line)] bg-[var(--edit-panel)]"
                }`}
                onClick={() => cycleTag(tag.id)}
              >
                {mode === "exclude" ? `ohne ${tag.name}` : tag.name}
              </button>
            );
          })}
        </div>
        <LayoutColumnsPicker
          value={(catalog.site.layout ?? DEFAULT_LAYOUT).columns}
          onChange={(columns) => {
            const layout = catalog.site.layout ?? DEFAULT_LAYOUT;
            updateSite({ ...catalog.site, layout: { ...layout, columns } });
          }}
        />
      </div>
      {emptyLibrary ? (
        <button
          type="button"
          className="flex flex-1 items-center justify-center rounded-xl border border-dashed border-[var(--edit-line)] bg-[var(--edit-panel)] p-8 text-center text-sm text-[var(--edit-muted)]"
          disabled={!canWrite}
          onClick={() => inputRef.current?.click()}
        >
          Bilder hierher ziehen oder klicken, um Dateien zu wählen
        </button>
      ) : (
        <div className="min-h-0 flex-1 overflow-auto">
        {visible.length === 0 ? (
          <p className="rounded-xl border border-[var(--edit-line)] bg-[var(--edit-panel)] p-6 text-sm text-[var(--edit-muted)]">
            Keine Einträge zu diesem Filter.
          </p>
        ) : (
        <div className="grid select-none grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
          {visible.map((item) => {
            const id = itemId(item);
            const selected = selectedPhotoIds.includes(id);
            return (
              <button
                key={`${item.type}-${id}`}
                type="button"
                draggable
                onDragStart={(event) => {
                  reordering.current = true;
                  didDrag.current = true;
                  event.dataTransfer.setData("text/plain", id);
                  event.dataTransfer.effectAllowed = "move";
                }}
                onDragOver={(event) => {
                  if (isFileDrag(event)) {
                    event.preventDefault();
                    event.dataTransfer.dropEffect = "copy";
                    const rect = event.currentTarget.getBoundingClientRect();
                    const after = event.clientX > rect.left + rect.width / 2;
                    fileInsertBeforeRef.current = beforeIdForTile(id, after);
                    if (dropTargetId !== id) setDropTargetId(id);
                    if (dropAfter !== after) setDropAfter(after);
                    return;
                  }
                  if (!reordering.current) return;
                  event.preventDefault();
                  event.dataTransfer.dropEffect = "move";
                  if (dropTargetId !== id) setDropTargetId(id);
                }}
                onDragLeave={(event) => {
                  if (isFileDrag(event)) return;
                  if (dropTargetId === id) setDropTargetId(null);
                }}
                onDrop={(event) => {
                  if (isFileDrag(event)) {
                    const rect = event.currentTarget.getBoundingClientRect();
                    const after = event.clientX > rect.left + rect.width / 2;
                    acceptFileDrop(event, beforeIdForTile(id, after));
                    return;
                  }
                  event.preventDefault();
                  event.stopPropagation();
                  const fromId = event.dataTransfer.getData("text/plain");
                  setDropTargetId(null);
                  if (fromId) reorderPhotos(fromId, id, visibleIds);
                }}
                onDragEnd={() => {
                  reordering.current = false;
                  setDropTargetId(null);
                  window.setTimeout(() => {
                    didDrag.current = false;
                  }, 0);
                }}
                onClick={(event) => {
                  if (didDrag.current) return;
                  selectItem(item, event);
                }}
                onDoubleClick={() => {
                  if (didDrag.current || item.type !== "photo") return;
                  openPreview(item.photo.id);
                }}
                className={`relative cursor-grab overflow-hidden rounded-lg border bg-[var(--edit-panel)] text-left active:cursor-grabbing ${
                  selected ? "border-[var(--edit-ink)] ring-1 ring-[var(--edit-ink)]" : "border-transparent"
                } ${dropTargetId === id ? "ring-2 ring-[var(--edit-ink)]" : ""}`}
              >
                {draggingFiles && dropTargetId === id ? (
                  <span
                    className={`pointer-events-none absolute top-1 bottom-1 z-10 w-0.5 bg-[var(--edit-ink)] ${
                      dropAfter ? "right-0" : "left-0"
                    }`}
                  />
                ) : null}
                {item.type === "photo" ? (
                  <>
                    <div className="aspect-square bg-[#ddd8d0]">
                      {thumbUrls[item.photo.id] ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={thumbUrls[item.photo.id]}
                          alt={item.photo.title || item.photo.originalName}
                          draggable={false}
                          className="pointer-events-none h-full w-full object-cover"
                        />
                      ) : null}
                    </div>
                    <div className="truncate px-2 py-1.5 text-xs text-[var(--edit-muted)]">
                      {item.photo.title || item.photo.originalName}
                    </div>
                  </>
                ) : (
                  <>
                    <div className="flex aspect-square flex-col gap-1.5 bg-[#ece8e2] p-3">
                      <span className="text-[0.65rem] uppercase tracking-wide text-[var(--edit-muted)]">Text</span>
                      <p className="line-clamp-5 text-sm leading-snug text-[var(--edit-ink)]">
                        {item.text.title || item.text.body || "Leere Textkachel"}
                      </p>
                    </div>
                    <div className="truncate px-2 py-1.5 text-xs text-[var(--edit-muted)]">
                      {item.text.title || "Textkachel"}
                    </div>
                  </>
                )}
              </button>
            );
          })}
        </div>
        )}
        </div>
      )}
      {previewAt >= 0 ? (
        <div className="theme-gallery-v1 contents">
          <Lightbox
            photos={previewPhotos}
            index={previewAt}
            resolveUrl={(photo: Photo) => displayUrls[photo.id] ?? thumbUrls[photo.id] ?? ""}
            onClose={closePreview}
            onIndex={(index) => {
              const next = previewPhotos[index];
              if (next) openPreview(next.id);
            }}
          />
        </div>
      ) : null}
      {draggingFiles ? (
        <div className="pointer-events-none absolute inset-x-0 top-0 z-10 flex justify-center pt-1">
          <span className="rounded-full bg-[var(--edit-ink)] px-3 py-1 text-xs text-[#f7f5f1]">
            Ablegen zum Einfügen
          </span>
        </div>
      ) : null}
    </div>
  );
}
