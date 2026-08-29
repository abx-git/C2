"use client";

import { useState } from "react";
import { catalogFeed, filterInUse, hasFilterOrder } from "@/lib/catalog";
import { FilterCriteriaBar } from "@/components/editor/filter-criteria";
import { useEditorStore } from "@/store/editor-store";

export function FilterManager() {
  const catalog = useEditorStore((s) => s.catalog);
  const filters = catalog.filters?.filters ?? [];
  const tags = catalog.tags.tags;
  const addFilter = useEditorStore((s) => s.addFilter);
  const renameFilter = useEditorStore((s) => s.renameFilter);
  const updateFilterSpec = useEditorStore((s) => s.updateFilterSpec);
  const deleteFilter = useEditorStore((s) => s.deleteFilter);
  const clearFilterOrder = useEditorStore((s) => s.clearFilterOrder);
  const [name, setName] = useState("");

  return (
    <div className="mx-auto w-full max-w-2xl">
      <h2 className="mb-3 text-sm font-medium">Filter</h2>
      <p className="mb-4 text-sm text-[var(--edit-muted)]">
        Gespeicherte Filter nutzen dieselben Kriterien wie die Bilderliste: Tags ein- oder ausschließen, Bewertung,
        Suche. In der Seitenstruktur wird ein Filter ausgewählt. Ändert sich der Filter, ändert sich die Bildauswahl
        aller Seiten, die ihn verwenden. Per Ziehen in der Bilderliste kann jeder Filter eine eigene Reihenfolge
        bekommen; sonst gilt die allgemeine Sortierung.
      </p>
      <form
        className="mb-6 flex gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          addFilter(name);
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
      {filters.length === 0 ? (
        <p className="text-sm text-[var(--edit-muted)]">Noch keine Filter.</p>
      ) : (
        <ul className="divide-y divide-[var(--edit-line)] rounded-xl border border-[var(--edit-line)] bg-[var(--edit-panel)]">
          {filters.map((filter) => {
            const count = catalogFeed(catalog, filter.spec, filter.order).length;
            const ownOrder = hasFilterOrder(filter);
            return (
              <li key={filter.id} className="space-y-2 px-3 py-3">
                <div className="flex flex-wrap items-center gap-3">
                  <input
                    className="edit-field min-w-[10rem] flex-1"
                    value={filter.name}
                    onChange={(event) => renameFilter(filter.id, event.target.value)}
                  />
                  <code className="shrink-0 text-[0.7rem] text-[var(--edit-muted)]">{filter.id}</code>
                  <span className="shrink-0 text-[0.7rem] text-[var(--edit-muted)]">
                    {count === 1 ? "1 Eintrag" : `${count} Einträge`}
                    {ownOrder ? " · eigene Reihenfolge" : ""}
                  </span>
                  {ownOrder ? (
                    <button
                      type="button"
                      className="edit-btn shrink-0"
                      onClick={() => clearFilterOrder(filter.id)}
                    >
                      Reihenfolge zurücksetzen
                    </button>
                  ) : null}
                  <button
                    type="button"
                    className="edit-btn shrink-0"
                    onClick={() => {
                      const used = filterInUse(filter.id, catalog.site.pages);
                      if (used && !window.confirm(`Filter „${filter.name}“ wird in der Struktur verwendet. Trotzdem löschen?`)) {
                        return;
                      }
                      deleteFilter(filter.id, true);
                    }}
                  >
                    Löschen
                  </button>
                </div>
                <FilterCriteriaBar
                  spec={filter.spec}
                  tags={tags}
                  onChange={(spec) => updateFilterSpec(filter.id, spec)}
                />
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
