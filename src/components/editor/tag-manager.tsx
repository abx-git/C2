"use client";

import { useState } from "react";
import { isPublishTag, tagInUse } from "@/lib/catalog";
import { useEditorStore } from "@/store/editor-store";

export function TagManager() {
  const tags = useEditorStore((s) => s.catalog.tags.tags);
  const photos = useEditorStore((s) => s.catalog.photos.photos);
  const texts = useEditorStore((s) => s.catalog.texts?.texts ?? []);
  const addTag = useEditorStore((s) => s.addTag);
  const renameTag = useEditorStore((s) => s.renameTag);
  const deleteTag = useEditorStore((s) => s.deleteTag);
  const [name, setName] = useState("");

  return (
    <div className="mx-auto w-full max-w-xl">
      <h2 className="mb-3 text-sm font-medium">Tags</h2>
      <p className="mb-4 text-sm text-[var(--edit-muted)]">
        Tags bekommen einen Anzeigenamen. Die interne ID bleibt stabil und wird für Kategorien in der Seitenstruktur
        verwendet. Nur Bilder und Textkacheln mit dem Tag <strong>publish</strong> erscheinen auf der öffentlichen Seite und in der
        Vorschau.
      </p>
      <form
        className="mb-6 flex gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          addTag(name);
          setName("");
        }}
      >
        <input
          className="edit-field"
          placeholder="Anzeigename"
          value={name}
          onChange={(event) => setName(event.target.value)}
        />
        <button type="submit" className="edit-btn-primary edit-btn" disabled={!name.trim()}>
          Anlegen
        </button>
      </form>
      {tags.length === 0 ? (
        <p className="text-sm text-[var(--edit-muted)]">Noch keine Tags.</p>
      ) : (
        <ul className="divide-y divide-[var(--edit-line)] rounded-xl border border-[var(--edit-line)] bg-[var(--edit-panel)]">
          {tags.map((tag) => (
            <li key={tag.id} className="flex items-center gap-3 px-3 py-2">
              <input
                className="edit-field"
                value={tag.name}
                onChange={(event) => renameTag(tag.id, event.target.value)}
              />
              <code className="shrink-0 text-[0.7rem] text-[var(--edit-muted)]">{tag.id}</code>
              {isPublishTag(tag) ? (
                <span className="shrink-0 text-[0.7rem] text-[var(--edit-muted)]">fest</span>
              ) : (
              <button
                type="button"
                className="edit-btn shrink-0"
                onClick={() => {
                  const used = tagInUse(tag.id, photos, texts);
                  if (used && !window.confirm(`Tag „${tag.name}“ wird verwendet. Trotzdem löschen?`)) {
                    return;
                  }
                  deleteTag(tag.id, true);
                }}
              >
                Löschen
              </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
