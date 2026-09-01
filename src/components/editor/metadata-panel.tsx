"use client";

import { useState } from "react";
import { geoEquals, isPublishTag, PHOTO_RATING_MAX, type Tag } from "@/lib/catalog";
import { GeoTagFields } from "@/components/editor/geo-tag-fields";
import { useEditorStore } from "@/store/editor-store";

export function confirmRemoveSelection(photoCount: number, textCount: number): boolean {
  if (photoCount + textCount <= 0) return false;
  if (photoCount === 1 && textCount === 0) return window.confirm("Bild aus dem Workspace entfernen?");
  if (photoCount === 0 && textCount === 1) return window.confirm("Textkachel entfernen?");
  const parts = [
    photoCount ? `${photoCount} Bild${photoCount === 1 ? "" : "er"}` : null,
    textCount ? `${textCount} Textkachel${textCount === 1 ? "" : "n"}` : null,
  ].filter(Boolean);
  return window.confirm(`${parts.join(" und ")} aus dem Workspace entfernen?`);
}

function findTag(tags: Tag[], name: string): Tag | undefined {
  const needle = name.trim().toLocaleLowerCase("de");
  if (!needle) return undefined;
  return tags.find((tag) =>
    [tag.name, tag.slug, tag.id].some((value) => value.toLocaleLowerCase("de") === needle),
  );
}

export function MetadataPanel() {
  const photos = useEditorStore((s) => s.catalog.photos.photos);
  const texts = useEditorStore((s) => s.catalog.texts?.texts ?? []);
  const selectedPhotoIds = useEditorStore((s) => s.selectedPhotoIds);
  const previewPhotoId = useEditorStore((s) => s.previewPhotoId);
  const previewPhoto = previewPhotoId ? (photos.find((item) => item.id === previewPhotoId) ?? null) : null;
  const selectedPhotos = previewPhoto
    ? [previewPhoto]
    : photos.filter((item) => selectedPhotoIds.includes(item.id));
  const selectedTexts = previewPhoto ? [] : texts.filter((item) => selectedPhotoIds.includes(item.id));
  const photo = selectedPhotos.length === 1 && selectedTexts.length === 0 ? selectedPhotos[0]! : null;
  const text = selectedTexts.length === 1 && selectedPhotos.length === 0 ? selectedTexts[0]! : null;
  const tags = useEditorStore((s) => s.catalog.tags.tags);
  const updatePhoto = useEditorStore((s) => s.updatePhoto);
  const updateText = useEditorStore((s) => s.updateText);
  const addTag = useEditorStore((s) => s.addTag);
  const setPhotosTag = useEditorStore((s) => s.setPhotosTag);
  const setPhotosRating = useEditorStore((s) => s.setPhotosRating);
  const setPhotosGeo = useEditorStore((s) => s.setPhotosGeo);
  const deletePhoto = useEditorStore((s) => s.deletePhoto);
  const deleteText = useEditorStore((s) => s.deleteText);
  const deleteItems = useEditorStore((s) => s.deleteItems);
  const openPreview = useEditorStore((s) => s.openPreview);
  const [tagDraft, setTagDraft] = useState("");

  if (!previewPhoto && selectedPhotoIds.length === 0) {
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
  const assignTypedTags = (raw: string) => {
    const names = raw
      .split(",")
      .map((name) => name.trim())
      .filter(Boolean);
    if (!selectedIds.length) return;
    if (!names.length) {
      setTagDraft("");
      return;
    }
    let known = tags;
    for (const name of names) {
      const existing = findTag(known, name);
      if (existing) {
        setPhotosTag(selectedIds, existing.id, true);
        continue;
      }
      const created = addTag(name);
      if (!created) continue;
      known = [...known, created];
      setPhotosTag(selectedIds, created.id, true);
    }
    setTagDraft("");
  };

  return (
    <aside className="flex flex-col gap-3 rounded-xl border border-[var(--edit-line)] bg-[var(--edit-panel)] p-4">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-sm font-medium">
          {photo ? "Metadaten" : text ? "Textkachel" : `${selectedPhotoIds.length} ausgewählt`}
        </h2>
        {photo && !previewPhotoId ? (
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
          <StarRating value={photo.rating ?? 0} onChange={(rating) => updatePhoto(photo.id, { rating })} />
          <GeoTagFields value={photo.geo} onChange={(geo) => updatePhoto(photo.id, { geo })} />
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
        <>
          {selectedPhotos.length && !selectedTexts.length ? (
            <>
              <StarRating
                value={selectedPhotos.every((item) => (item.rating ?? 0) === (selectedPhotos[0]?.rating ?? 0))
                  ? (selectedPhotos[0]?.rating ?? 0)
                  : 0}
                mixed={!selectedPhotos.every((item) => (item.rating ?? 0) === (selectedPhotos[0]?.rating ?? 0))}
                onChange={(rating) => setPhotosRating(selectedPhotos.map((item) => item.id), rating)}
              />
              <GeoTagFields
                value={
                  selectedPhotos.every((item) => geoEquals(item.geo, selectedPhotos[0]?.geo))
                    ? selectedPhotos[0]?.geo
                    : undefined
                }
                mixed={!selectedPhotos.every((item) => geoEquals(item.geo, selectedPhotos[0]?.geo))}
                onChange={(geo) => setPhotosGeo(selectedPhotos.map((item) => item.id), geo)}
              />
            </>
          ) : null}
          <p className="text-xs text-[var(--edit-muted)]">Tags gelten für alle ausgewählten Bilder und Textkacheln.</p>
        </>
      )}
      <div>
        <div className="mb-1 text-xs text-[var(--edit-muted)]">Tags</div>
        <form
          className="mb-1.5"
          onSubmit={(event) => {
            event.preventDefault();
            assignTypedTags(tagDraft);
          }}
        >
          <input
            className="edit-field"
            value={tagDraft}
            placeholder="Tag eingeben, Enter oder Komma"
            aria-label="Tag eingeben"
            onChange={(event) => {
              const value = event.target.value;
              if (value.includes(",")) {
                const parts = value.split(",");
                const rest = parts.pop() ?? "";
                assignTypedTags(parts.join(","));
                setTagDraft(rest);
                return;
              }
              setTagDraft(value);
            }}
          />
        </form>
        {tags.length === 0 ? (
          <p className="text-xs text-[var(--edit-muted)]">Noch keine Tags — oben eingeben, um einen anzulegen.</p>
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
              if (confirmRemoveSelection(1, 0)) void deletePhoto(photo.id);
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
            if (confirmRemoveSelection(0, 1)) deleteText(text.id);
          }}
        >
          Textkachel löschen
        </button>
      ) : null}
      {!photo && !text ? (
        <button
          type="button"
          className="edit-btn self-start"
          onClick={() => {
            if (confirmRemoveSelection(selectedPhotos.length, selectedTexts.length)) {
              void deleteItems(selectedPhotoIds);
            }
          }}
        >
          Auswahl löschen
        </button>
      ) : null}
    </aside>
  );
}

function StarRating({
  value,
  mixed = false,
  onChange,
}: {
  value: number;
  mixed?: boolean;
  onChange: (rating: number) => void;
}) {
  return (
    <div>
      <div className="mb-1 text-xs text-[var(--edit-muted)]">Sterne</div>
      <div className="flex items-center gap-0.5" role="group" aria-label="Bewertung">
        {Array.from({ length: PHOTO_RATING_MAX }, (_, index) => {
          const n = index + 1;
          const on = !mixed && value >= n;
          return (
            <button
              key={n}
              type="button"
              title={n === 1 ? "1 Stern" : `${n} Sterne`}
              aria-label={n === 1 ? "1 Stern" : `${n} Sterne`}
              aria-pressed={on}
              onClick={() => onChange(!mixed && value === n ? 0 : n)}
              className={`px-0.5 text-base leading-none ${
                on ? "text-[var(--edit-ink)]" : "text-[var(--edit-muted)]"
              }`}
            >
              ★
            </button>
          );
        })}
      </div>
    </div>
  );
}

function toLocalInput(iso: string | null): string {
  if (!iso) return "";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}
