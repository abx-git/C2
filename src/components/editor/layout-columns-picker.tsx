"use client";

import { LAYOUT_COLUMN_OPTIONS, type LayoutColumns } from "@/lib/catalog";

export function LayoutColumnsPicker({
  value,
  onChange,
}: {
  value: LayoutColumns;
  onChange: (columns: LayoutColumns) => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <span className="mr-1 text-xs text-[var(--edit-muted)]">Nebeneinander:</span>
      {LAYOUT_COLUMN_OPTIONS.map((item) => (
        <button
          key={item.id}
          type="button"
          title={item.hint}
          className={`rounded-full border px-2 py-0.5 text-xs ${
            value === item.id
              ? "border-[var(--edit-ink)] bg-[var(--edit-ink)] text-[#f7f5f1]"
              : "border-[var(--edit-line)] bg-[var(--edit-panel)]"
          }`}
          onClick={() => onChange(item.id)}
        >
          {item.label}
        </button>
      ))}
    </div>
  );
}
