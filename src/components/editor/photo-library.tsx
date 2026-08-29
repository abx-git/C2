"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  catalogFeed,
  cloneFilterSpec,
  DEFAULT_LAYOUT,
  emptyFilterSpec,
  filterSpecsEqual,
  hasFilterOrder,
  isEmptyFilterSpec,
  type FeedItem,
  type Photo,
  type SavedFilterSpec,
} from "@/lib/catalog";
import { Lightbox } from "@/components/gallery/lightbox";
import { FilterCriteriaBar } from "@/components/editor/filter-criteria";
import { LayoutColumnsPicker } from "@/components/editor/layout-columns-picker";
import { confirmRemoveSelection, MetadataPanel } from "@/components/editor/metadata-panel";
import { fitMaxEdge, THUMB_MAX_EDGE } from "@/lib/image-prepare";
import { useEditorStore } from "@/store/editor-store";

const LIBRARY_GAP_PX = 8;

function libraryColumnCount(width: number, maxTile: number, gap = LIBRARY_GAP_PX): number {
  if (width <= 0 || maxTile <= 0) return 1;
  return Math.max(1, Math.ceil((width + gap) / (maxTile + gap)));
}

function thumbNativeSize(photo: Photo): { width: number; height: number } {
  return fitMaxEdge(photo.width, photo.height, THUMB_MAX_EDGE);
}

function itemId(item: FeedItem): string {
  return item.type === "photo" ? item.photo.id : item.text.id;
}

function isFileDrag(event: React.DragEvent) {
  return Array.from(event.dataTransfer.types).includes("Files");
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
  const deleteItems = useEditorStore((s) => s.deleteItems);
  const updateSite = useEditorStore((s) => s.updateSite);
  const addFilter = useEditorStore((s) => s.addFilter);
  const clearFilterOrder = useEditorStore((s) => s.clearFilterOrder);
  const importProgress = useEditorStore((s) => s.importProgress);
  const canWrite = useEditorStore((s) => s.canWrite);
  const savedFilters = catalog.filters?.filters ?? [];
  const [draggingFiles, setDraggingFiles] = useState(false);
  const [dropTargetId, setDropTargetId] = useState<string | null>(null);
  const [dropAfter, setDropAfter] = useState(false);
  const [spec, setSpec] = useState<SavedFilterSpec>(() => emptyFilterSpec());
  const [boundFilterId, setBoundFilterId] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const workAreaRef = useRef<HTMLDivElement>(null);
  const [workAreaWidth, setWorkAreaWidth] = useState(0);
  const reordering = useRef(false);
  const didDrag = useRef(false);
  const clickTimer = useRef<number | null>(null);
  const fileInsertBeforeRef = useRef<string | null>(null);

  const matchingSaved = useMemo(() => {
    if (boundFilterId) {
      const bound = savedFilters.find((item) => item.id === boundFilterId);
      if (bound && filterSpecsEqual(spec, bound.spec)) return bound;
    }
    return savedFilters.find((item) => filterSpecsEqual(spec, item.spec));
  }, [boundFilterId, savedFilters, spec]);
  const visible = useMemo(
    () => catalogFeed(catalog, spec, matchingSaved?.order),
    [spec, catalog, matchingSaved],
  );

  const visibleIds = visible.map(itemId);
  const visiblePhotos = visible.flatMap((item) => (item.type === "photo" ? [item.photo] : []));
  const filterActive = !isEmptyFilterSpec(spec);
  const previewPhotos = visiblePhotos.length ? visiblePhotos : photos;
  const previewAt = previewPhotoId ? previewPhotos.findIndex((photo) => photo.id === previewPhotoId) : -1;
  const textCount = catalog.texts?.texts.length ?? 0;
  const emptyLibrary = photos.length === 0 && textCount === 0;
  const selectedPhotoCount = photos.filter((photo) => selectedPhotoIds.includes(photo.id)).length;
  const selectedTextCount = (catalog.texts?.texts ?? []).filter((text) => selectedPhotoIds.includes(text.id)).length;
  const maxTile = visible.reduce((max, item) => {
    if (item.type !== "photo") return Math.max(max, THUMB_MAX_EDGE);
    const native = thumbNativeSize(item.photo);
    return Math.max(max, native.width, native.height);
  }, 1);
  const libraryColumns = libraryColumnCount(workAreaWidth, Math.min(maxTile, THUMB_MAX_EDGE));

  const removeSelected = useCallback(() => {
    if (!canWrite || !selectedPhotoIds.length) return;
    if (!confirmRemoveSelection(selectedPhotoCount, selectedTextCount)) return;
    void deleteItems(selectedPhotoIds);
  }, [canWrite, deleteItems, selectedPhotoCount, selectedPhotoIds, selectedTextCount]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Backspace" && event.key !== "Delete") return;
      if (event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey) return;
      const target = event.target as HTMLElement | null;
      const tag = target?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || target?.isContentEditable) return;
      if (!selectedPhotoIds.length || !canWrite) return;
      if (previewPhotoId) return;
      event.preventDefault();
      removeSelected();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [canWrite, previewPhotoId, removeSelected, selectedPhotoIds.length]);

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

  const clearClickTimer = () => {
    if (clickTimer.current == null) return;
    window.clearTimeout(clickTimer.current);
    clickTimer.current = null;
  };

  useEffect(() => () => clearClickTimer(), []);

  useEffect(() => {
    const el = workAreaRef.current;
    if (!el) return;
    const update = () => setWorkAreaWidth(Math.floor(el.clientWidth));
    const ro = new ResizeObserver(update);
    ro.observe(el);
    update();
    return () => ro.disconnect();
  }, [emptyLibrary]);

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
            {photos.length + textCount > 1
              ? matchingSaved
                ? ` · ziehen sortiert „${matchingSaved.name}“`
                : " · ziehen zum Sortieren"
              : ""}
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
            {selectedPhotoIds.length > 0 ? (
              <button type="button" className="edit-btn" disabled={!canWrite} onClick={removeSelected}>
                Löschen
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
        <div className="space-y-1.5">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="mr-1 text-xs text-[var(--edit-muted)]">Filter:</span>
            <FilterCriteriaBar
              spec={spec}
              onChange={(next) => {
                setSpec(next);
                if (isEmptyFilterSpec(next)) setBoundFilterId(null);
              }}
              tags={tags}
              className="contents"
            />
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="mr-1 text-xs text-[var(--edit-muted)]">Gespeichert:</span>
            {savedFilters.length === 0 ? (
              <span className="text-xs text-[var(--edit-muted)]">noch keine Filter</span>
            ) : (
              savedFilters.map((item) => {
                const on = matchingSaved?.id === item.id;
                return (
                  <button
                    key={item.id}
                    type="button"
                    title="Kriterien dieses Filters übernehmen"
                    className={`rounded-full border px-2 py-0.5 text-xs ${
                      on
                        ? "border-[var(--edit-ink)] bg-[var(--edit-ink)] text-[#f7f5f1]"
                        : "border-[var(--edit-line)] bg-[var(--edit-panel)]"
                    }`}
                    onClick={() => {
                      setBoundFilterId(item.id);
                      setSpec(cloneFilterSpec(item.spec));
                    }}
                  >
                    {item.name}
                  </button>
                );
              })
            )}
            <button
              type="button"
              className="edit-btn ml-1 px-2 py-0.5 text-xs"
              disabled={!canWrite || !filterActive || Boolean(matchingSaved)}
              title={
                matchingSaved
                  ? `Bereits gespeichert als „${matchingSaved.name}“`
                  : "Aktuelle Kriterien als Filter speichern"
              }
              onClick={() => {
                const name = window.prompt("Name für diesen Filter");
                if (!name?.trim()) return;
                addFilter(name, spec);
              }}
            >
              Speichern
            </button>
            {matchingSaved && hasFilterOrder(matchingSaved) ? (
              <button
                type="button"
                className="edit-btn px-2 py-0.5 text-xs"
                disabled={!canWrite}
                title="Eigene Reihenfolge dieses Filters löschen und wieder die allgemeine nutzen"
                onClick={() => clearFilterOrder(matchingSaved.id)}
              >
                Reihenfolge zurücksetzen
              </button>
            ) : null}
          </div>
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
        <div ref={workAreaRef} className="min-h-0 flex-1 overflow-auto">
        {visible.length === 0 ? (
          <p className="rounded-xl border border-[var(--edit-line)] bg-[var(--edit-panel)] p-6 text-sm text-[var(--edit-muted)]">
            Keine Einträge zu diesem Filter.
          </p>
        ) : (
        <div
          className="grid select-none"
          style={{
            gap: LIBRARY_GAP_PX,
            gridTemplateColumns:
              workAreaWidth > 0
                ? `repeat(${libraryColumns}, minmax(0, 1fr))`
                : `repeat(auto-fill, minmax(0, ${Math.min(maxTile, THUMB_MAX_EDGE)}px))`,
          }}
        >
          {visible.map((item) => {
            const id = itemId(item);
            const selected = selectedPhotoIds.includes(id);
            const native = item.type === "photo" ? thumbNativeSize(item.photo) : { width: THUMB_MAX_EDGE, height: THUMB_MAX_EDGE };
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
                  if (fromId) reorderPhotos(fromId, id, visibleIds, matchingSaved?.id);
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
                  if (item.type === "photo" && event.detail > 1) {
                    clearClickTimer();
                    return;
                  }
                  if (event.metaKey || event.ctrlKey || event.shiftKey || item.type !== "photo") {
                    clearClickTimer();
                    selectItem(item, event);
                    return;
                  }
                  clearClickTimer();
                  clickTimer.current = window.setTimeout(() => {
                    clickTimer.current = null;
                    selectPhoto(id);
                  }, 220);
                }}
                onDoubleClick={() => {
                  clearClickTimer();
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
                    <div className="flex aspect-square items-center justify-center bg-[#ddd8d0]">
                      {thumbUrls[item.photo.id] ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={thumbUrls[item.photo.id]}
                          alt={item.photo.title || item.photo.originalName}
                          draggable={false}
                          width={native.width}
                          height={native.height}
                          className="pointer-events-none max-h-full max-w-full object-contain"
                          style={{ maxWidth: native.width, maxHeight: native.height }}
                        />
                      ) : null}
                    </div>
                    <div className="flex items-center justify-between gap-1 truncate px-2 py-1.5 text-xs text-[var(--edit-muted)]">
                      <span className="min-w-0 truncate">{item.photo.title || item.photo.originalName}</span>
                      {item.photo.rating > 0 ? (
                        <span className="shrink-0 tracking-tight" aria-label={`${item.photo.rating} von 5 Sternen`}>
                          {"★".repeat(item.photo.rating)}
                        </span>
                      ) : null}
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
            onClose={() => {
              didDrag.current = false;
              closePreview();
            }}
            onIndex={(index) => {
              const next = previewPhotos[index];
              if (next) openPreview(next.id);
            }}
            sidebar={<MetadataPanel />}
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
