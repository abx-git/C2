import type { FeedItem, LayoutConfig, Photo, TextTile } from "./catalog";

export type FeedRow = {
  photos: Photo[];
  height: number;
  widths: number[];
};

export type EssayBlock =
  | { type: "row"; photos: Photo[]; height: number; widths: number[] }
  | { type: "text"; text: TextTile };

function aspect(photo: Photo): number {
  return photo.width / Math.max(photo.height, 1);
}

function patternFor(columns: LayoutConfig["columns"]): number[] {
  if (columns === "mix") return [3, 3, 2, 3, 2];
  if (columns === "fill") return [3];
  const count = Number(columns);
  if (count >= 1 && count <= 6) return [count];
  return [3];
}

function fillHeight(slice: Photo[], containerWidth: number, gap: number): number {
  const gaps = gap * Math.max(0, slice.length - 1);
  const sum = slice.reduce((total, photo) => total + aspect(photo), 0);
  return (containerWidth - gaps) / Math.max(sum, 0.0001);
}

function nativeHeight(photo: Photo): number {
  return Math.max(1, photo.height);
}

function nativeWidth(photo: Photo): number {
  return Math.max(1, photo.width);
}

/** Row height at which no photo would be shown wider (or taller) than its pixels. */
function nativeRowHeight(slice: Photo[]): number {
  return Math.min(...slice.map(nativeHeight));
}

function naturalWidths(slice: Photo[], height: number): number[] {
  return slice.map((photo) => Math.min(nativeWidth(photo), aspect(photo) * height));
}

function justifyWidths(slice: Photo[], containerWidth: number, height: number, gap: number): number[] {
  const gaps = gap * Math.max(0, slice.length - 1);
  const raw = naturalWidths(slice, height);
  const sum = raw.reduce((total, value) => total + value, 0);
  if (sum <= 0) return raw;
  const inner = Math.max(1, containerWidth - gaps);
  const scale = inner / sum;
  const widths = raw.map((value, index) =>
    Math.min(nativeWidth(slice[index]!), Math.max(1, Math.floor(value * scale))),
  );
  if (widths.length === 1) {
    widths[0] = Math.min(nativeWidth(slice[0]!), inner);
    return widths;
  }
  const head = widths.slice(0, -1).reduce((total, value) => total + value, 0);
  const last = slice[slice.length - 1]!;
  widths[widths.length - 1] = Math.min(nativeWidth(last), Math.max(1, inner - head));
  return widths;
}

function rowCount(
  rowIndex: number,
  remaining: number,
  containerWidth: number,
  columns: LayoutConfig["columns"],
): number {
  if (remaining <= 1) return 1;
  const pattern = patternFor(columns);
  const wanted = pattern[rowIndex % pattern.length]!;
  if (containerWidth < 640 && wanted > 2) return Math.min(2, remaining);
  return Math.min(wanted, remaining);
}

function packFillCount(photos: Photo[], start: number, containerWidth: number, layout: LayoutConfig): number {
  const remaining = photos.length - start;
  if (remaining <= 1) return remaining;
  let count = 1;
  while (count < remaining) {
    const withNext = photos.slice(start, start + count + 1);
    if (fillHeight(withNext, containerWidth, layout.gap) < layout.rowMinHeight) break;
    count += 1;
    if (fillHeight(photos.slice(start, start + count), containerWidth, layout.gap) <= layout.rowMaxHeight) {
      break;
    }
  }
  return count;
}

function makeRow(slice: Photo[], containerWidth: number, layout: LayoutConfig, stretch: boolean): FeedRow {
  const fillH = fillHeight(slice, containerWidth, layout.gap);
  const maxH = Math.min(nativeRowHeight(slice), layout.rowMaxHeight);
  const height = Math.min(fillH, maxH);
  const canFill = stretch && fillH <= maxH + 0.5;
  return {
    photos: slice,
    height,
    widths: canFill ? justifyWidths(slice, containerWidth, height, layout.gap) : naturalWidths(slice, height),
  };
}

export function layoutFeed(photos: Photo[], containerWidth: number, layout: LayoutConfig): FeedRow[] {
  if (containerWidth <= 0 || photos.length === 0) return [];

  const rows: FeedRow[] = [];
  let i = 0;
  let rowIndex = 0;

  while (i < photos.length) {
    const remaining = photos.length - i;
    const count =
      layout.columns === "fill"
        ? packFillCount(photos, i, containerWidth, layout)
        : rowCount(rowIndex, remaining, containerWidth, layout.columns);
    const slice = photos.slice(i, i + count);
    const last = i + count >= photos.length;
    const natural = fillHeight(slice, containerWidth, layout.gap);
    const maxH = Math.min(nativeRowHeight(slice), layout.rowMaxHeight);
    const stretch = layout.columns === "fill" ? !last || natural <= maxH : true;
    rows.push(makeRow(slice, containerWidth, layout, stretch));
    i += count;
    rowIndex += 1;
  }

  return rows;
}

export function layoutEssayFeed(items: FeedItem[], containerWidth: number, layout: LayoutConfig): EssayBlock[] {
  const blocks: EssayBlock[] = [];
  let run: Photo[] = [];
  const flush = () => {
    if (!run.length) return;
    for (const row of layoutFeed(run, containerWidth, layout)) {
      blocks.push({ type: "row", photos: row.photos, height: row.height, widths: row.widths });
    }
    run = [];
  };
  for (const item of items) {
    if (item.type === "photo") run.push(item.photo);
    else {
      flush();
      blocks.push({ type: "text", text: item.text });
    }
  }
  flush();
  return blocks;
}
