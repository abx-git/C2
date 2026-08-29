"use client";

import {
  PHOTO_RATING_MAX,
  cycleSpecTag,
  cycleSpecUntagged,
  emptyFilterSpec,
  isEmptyFilterSpec,
  isPublishTag,
  toggleSpecRating,
  type SavedFilterSpec,
  type Tag,
} from "@/lib/catalog";

function chipClass(active: boolean, exclude = false) {
  if (exclude) return "border-[var(--edit-ink)] bg-transparent text-[var(--edit-ink)] line-through";
  if (active) return "border-[var(--edit-ink)] bg-[var(--edit-ink)] text-[#f7f5f1]";
  return "border-[var(--edit-line)] bg-[var(--edit-panel)]";
}

export function FilterCriteriaBar({
  spec,
  onChange,
  tags,
  className = "flex flex-wrap items-center gap-1.5",
}: {
  spec: SavedFilterSpec;
  onChange: (spec: SavedFilterSpec) => void;
  tags: Tag[];
  className?: string;
}) {
  const empty = isEmptyFilterSpec(spec);
  return (
    <div className={className}>
      <input
        type="search"
        value={spec.query}
        onChange={(event) => onChange({ ...spec, query: event.target.value })}
        placeholder="Titel oder Text"
        aria-label="Nach Titel oder Text suchen"
        className="edit-field w-44 max-w-full py-0.5 text-xs"
      />
      <button
        type="button"
        className={`rounded-full border px-2 py-0.5 text-xs ${chipClass(empty)}`}
        onClick={() => onChange(emptyFilterSpec())}
      >
        Alle
      </button>
      <button
        type="button"
        title={
          spec.untagged === "include"
            ? "Nochmals klicken: Einträge mit Tags zeigen"
            : spec.untagged === "exclude"
              ? "Nochmals klicken: Filter lösen"
              : "Klicken: nur Einträge ohne Tags"
        }
        className={`rounded-full border px-2 py-0.5 text-xs ${chipClass(spec.untagged === "include", spec.untagged === "exclude")}`}
        onClick={() => onChange(cycleSpecUntagged(spec))}
      >
        {spec.untagged === "exclude" ? "mit Tags" : "keine Tags gesetzt"}
      </button>
      {Array.from({ length: PHOTO_RATING_MAX + 1 }, (_, rating) => {
        const on = spec.ratings.includes(rating);
        const label = rating === 0 ? "keine Sterne" : "★".repeat(rating);
        return (
          <button
            key={`rating-${rating}`}
            type="button"
            title={
              rating === 0
                ? on
                  ? "Keine-Sterne-Filter lösen"
                  : "Nur Bilder ohne Sterne"
                : on
                  ? "Stern-Filter lösen"
                  : `Nur ${rating} Stern${rating === 1 ? "" : "e"}`
            }
            className={`rounded-full border px-2 py-0.5 text-xs ${chipClass(on)}`}
            onClick={() => onChange(toggleSpecRating(spec, rating))}
          >
            {label}
          </button>
        );
      })}
      {[...tags].sort((a, b) => Number(isPublishTag(b)) - Number(isPublishTag(a))).map((tag) => {
        const mode = spec.tags[tag.id];
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
            className={`rounded-full border px-2 py-0.5 text-xs ${chipClass(mode === "include", mode === "exclude")}`}
            onClick={() => onChange(cycleSpecTag(spec, tag.id))}
          >
            {mode === "exclude" ? `ohne ${tag.name}` : tag.name}
          </button>
        );
      })}
    </div>
  );
}
