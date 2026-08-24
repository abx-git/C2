"use client";

import { isPublishTag } from "@/lib/catalog";
import { useEditorStore } from "@/store/editor-store";

export function MetadataPanel() {
  const photos = useEditorStore((s) => s.catalog.photos.photos);
  const texts = useEditorStore((s) => s.catalog.texts?.texts ?? []);
  const selectedPhotoIds = useEditorStore((s) => s.selectedPhotoIds);
  const selectedPhotos = photos.filter((photo) => selectedPhotoIds.includes(photo.id));
  const selectedTexts = texts.filter((text) => selectedPhotoIds.includes(text.id));
  const photo = selectedPhotos.length === 1 && selectedTexts.length === 0 ? selectedPhotos[0]! : null;
  const text = selectedTexts.length === 1 && selectedPhotos.length === 0 ? selectedTexts[0]! : null;
  const tags = useEditorStore((s) => s.catalog.tags.tags);
  const updatePhoto = useEditorStore((s) => s.updatePhoto);
  const updateText = useEditorStore((s) => s.updateText);
  const setPhotosTag = useEditorStore((s) => s.setPhotosTag);
  const deletePhoto = useEditorStore((s) => s.deletePhoto);
  const deleteText = useEditorStore((s) => s.deleteText);
  const openPreview = useEditorStore((s) => s.openPreview);

  if (selectedPhotoIds.length === 0) {
    return (
      <aside className="rounded-xl border border-[var(--edit-line)] bg-[var(--edit-panel)] p-4 text-sm text-[var(--edit-muted)]">
        Ein Bild oder eine Textkachel auswählen. Mehrere: Klick, Umschalt-Klick oder Cmd/Ctrl-Klick. Reihenfolge per
        Ziehen.
      </aside>
    );
  }

  const selectedIds = [...selectedPhotos, ...selectedTexts].map((item) => item.id);
  const toggleTag = (tagId: string) => {
    const allOn = [...selectedPhotos, ...selectedTexts].every((item) => item.tags.includes(tagId));
    setPhotosTag(selectedIds, tagId, !allOn);
  };

  return (
    <aside className="flex flex-col gap-3 rounded-xl border border-[var(--edit-line)] bg-[var(--edit-panel)] p-4">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-sm font-medium">
          {photo ? "Metadaten" : text ? "Textkachel" : `${selectedPhotoIds.length} ausgewählt`}
        </h2>
        {photo ? (
          <button type="button" className="edit-btn" onClick={() => openPreview(photo.id)}>
            Schnellansicht
          </button>
        ) : null}
      </div>
      {photo ? (
        <>
          <label className="block text-xs text-[var(--edit-muted)]">
            Titel
            <input
              className="edit-field mt-1"
              value={photo.title}
              onChange={(event) => updatePhoto(photo.id, { title: event.target.value })}
            />
          </label>
          <label className="block text-xs text-[var(--edit-muted)]">
            Text
            <textarea
              className="edit-field mt-1 min-h-20"
              value={photo.caption}
              onChange={(event) => updatePhoto(photo.id, { caption: event.target.value })}
            />
          </label>
          <label className="block text-xs text-[var(--edit-muted)]">
            Aufnahmedatum
            <input
              type="datetime-local"
              className="edit-field mt-1"
              value={toLocalInput(photo.takenAt)}
              onChange={(event) =>
                updatePhoto(photo.id, {
                  takenAt: event.target.value ? new Date(event.target.value).toISOString() : null,
                })
              }
            />
          </label>
        </>
      ) : text ? (
        <>
          <label className="block text-xs text-[var(--edit-muted)]">
            Überschrift
            <input
              className="edit-field mt-1"
              value={text.title}
              onChange={(event) => updateText(text.id, { title: event.target.value })}
            />
          </label>
          <label className="block text-xs text-[var(--edit-muted)]">
            Text
            <textarea
              className="edit-field mt-1 min-h-32"
              value={text.body}
              onChange={(event) => updateText(text.id, { body: event.target.value })}
            />
          </label>
        </>
      ) : (
        <p className="text-xs text-[var(--edit-muted)]">Tags gelten für alle ausgewählten Bilder und Textkacheln.</p>
      )}
      <div>
        <div className="mb-1 text-xs text-[var(--edit-muted)]">Tags</div>
        {tags.length === 0 ? (
          <p className="text-xs text-[var(--edit-muted)]">Noch keine Tags — unter „Tags“ anlegen.</p>
        ) : (
          <div className="flex flex-wrap gap-1.5">
            {[...tags].sort((a, b) => Number(isPublishTag(b)) - Number(isPublishTag(a))).map((tag) => {
              const count = [...selectedPhotos, ...selectedTexts].filter((item) => item.tags.includes(tag.id)).length;
              const on = count === selectedPhotos.length + selectedTexts.length;
              const mixed = count > 0 && !on;
              return (
                <button
                  key={tag.id}
                  type="button"
                  onClick={() => toggleTag(tag.id)}
                  className={`rounded-full border px-2 py-0.5 text-xs ${
                    on
                      ? "border-[var(--edit-ink)] bg-[var(--edit-ink)] text-[#f7f5f1]"
                      : mixed
                        ? "border-dashed border-[var(--edit-ink)]"
                        : isPublishTag(tag)
                          ? "border-dashed border-[var(--edit-ink)]"
                          : "border-[var(--edit-line)]"
                  }`}
                >
                  {tag.name}
                  {selectedPhotoIds.length > 1 && mixed ? ` ${count}/${selectedPhotoIds.length}` : ""}
                </button>
              );
            })}
          </div>
        )}
      </div>
      {photo ? (
        <>
          <p className="text-xs text-[var(--edit-muted)]">
            Datei: {photo.originalName}
            {photo.exif?.camera ? ` · ${photo.exif.camera}` : ""}
            {photo.exif?.focalLength ? ` · ${photo.exif.focalLength}` : ""}
            {` · ${photo.width}×${photo.height}`}
          </p>
          <button
            type="button"
            className="edit-btn self-start"
            onClick={() => {
              if (window.confirm("Bild aus dem Workspace entfernen?")) void deletePhoto(photo.id);
            }}
          >
            Bild löschen
          </button>
        </>
      ) : null}
      {text ? (
        <button
          type="button"
          className="edit-btn self-start"
          onClick={() => {
            if (window.confirm("Textkachel entfernen?")) deleteText(text.id);
          }}
        >
          Textkachel löschen
        </button>
      ) : null}
    </aside>
  );
}

function toLocalInput(iso: string | null): string {
  if (!iso) return "";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}
