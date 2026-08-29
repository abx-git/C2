import { newId } from "./id";
import { uniqueSlug } from "./slug";

export const CATALOG_FILTER_VERSION = 1 as const;

export type FilterMode = "include" | "exclude";

export type SavedFilterSpec = {
  tags: Record<string, FilterMode>;
  untagged: FilterMode | null;
  ratings: number[];
  query: string;
};

export type SavedFilter = {
  id: string;
  name: string;
  slug: string;
  spec: SavedFilterSpec;
  /** Eigene Reihenfolge. Fehlt sie, gilt die allgemeine Sortierung. */
  order?: string[];
};

export type FiltersFile = {
  version: typeof CATALOG_FILTER_VERSION;
  filters: SavedFilter[];
};

export function emptyFilterSpec(): SavedFilterSpec {
  return { tags: {}, untagged: null, ratings: [], query: "" };
}

export function cloneFilterSpec(spec: SavedFilterSpec): SavedFilterSpec {
  return {
    tags: { ...spec.tags },
    untagged: spec.untagged,
    ratings: [...spec.ratings],
    query: spec.query,
  };
}

export function isEmptyFilterSpec(spec: SavedFilterSpec | null | undefined): boolean {
  if (!spec) return true;
  return (
    Object.keys(spec.tags).length === 0 &&
    spec.untagged == null &&
    spec.ratings.length === 0 &&
    spec.query.trim().length === 0
  );
}

export function filterSpecsEqual(a: SavedFilterSpec, b: SavedFilterSpec): boolean {
  if (a.untagged !== b.untagged) return false;
  if (a.query.trim() !== b.query.trim()) return false;
  const ratingsA = [...a.ratings].sort((x, y) => x - y).join(",");
  const ratingsB = [...b.ratings].sort((x, y) => x - y).join(",");
  if (ratingsA !== ratingsB) return false;
  const keysA = Object.keys(a.tags).sort();
  const keysB = Object.keys(b.tags).sort();
  if (keysA.join() !== keysB.join()) return false;
  return keysA.every((key) => a.tags[key] === b.tags[key]);
}

export function specFromLegacyTags(tagIds: string[]): SavedFilterSpec {
  const tags: Record<string, FilterMode> = {};
  for (const id of tagIds) {
    if (id) tags[id] = "include";
  }
  return { tags, untagged: null, ratings: [], query: "" };
}

export function emptyFilters(): FiltersFile {
  return { version: 1, filters: [] };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

export function parseFilterSpec(raw: unknown): SavedFilterSpec {
  const spec = emptyFilterSpec();
  if (!isRecord(raw)) return spec;
  if (isRecord(raw.tags)) {
    for (const [id, mode] of Object.entries(raw.tags)) {
      if (!id) continue;
      if (mode === "include" || mode === "exclude") spec.tags[id] = mode;
    }
  }
  if (Array.isArray(raw.includeTags)) {
    for (const id of raw.includeTags) {
      if (typeof id === "string" && id) spec.tags[id] = "include";
    }
  }
  if (Array.isArray(raw.excludeTags)) {
    for (const id of raw.excludeTags) {
      if (typeof id === "string" && id) spec.tags[id] = "exclude";
    }
  }
  if (raw.untagged === "include" || raw.untagged === "exclude") spec.untagged = raw.untagged;
  if (Array.isArray(raw.ratings)) {
    const ratings: number[] = [];
    for (const item of raw.ratings) {
      if (typeof item !== "number" || !Number.isFinite(item)) continue;
      const value = Math.min(5, Math.max(0, Math.round(item)));
      if (!ratings.includes(value)) ratings.push(value);
    }
    spec.ratings = ratings.sort((a, b) => a - b);
  }
  if (typeof raw.query === "string") spec.query = raw.query;
  return spec;
}

export function parseFilterOrder(raw: unknown): string[] | undefined {
  if (!Array.isArray(raw)) return undefined;
  const order: string[] = [];
  const seen = new Set<string>();
  for (const item of raw) {
    if (typeof item !== "string" || !item || seen.has(item)) continue;
    seen.add(item);
    order.push(item);
  }
  return order.length ? order : undefined;
}

export function hasFilterOrder(filter: Pick<SavedFilter, "order"> | null | undefined): boolean {
  return Array.isArray(filter?.order);
}

export function withoutFilterOrder(filter: SavedFilter): SavedFilter {
  if (!hasFilterOrder(filter)) return filter;
  const { order: _ignored, ...rest } = filter;
  return rest;
}

export function parseFilters(raw: unknown): FiltersFile {
  if (!isRecord(raw) || !Array.isArray(raw.filters)) return emptyFilters();
  const filters: SavedFilter[] = [];
  const seen = new Set<string>();
  for (const item of raw.filters) {
    if (!isRecord(item)) continue;
    const id = typeof item.id === "string" ? item.id : "";
    const name = typeof item.name === "string" ? item.name : "";
    if (!id || !name || seen.has(id)) continue;
    seen.add(id);
    const slug = typeof item.slug === "string" ? item.slug : "";
    const order = parseFilterOrder(item.order);
    filters.push({
      id,
      name,
      slug: slug || id,
      spec: parseFilterSpec(item.spec ?? item),
      ...(order ? { order } : {}),
    });
  }
  return { version: 1, filters };
}

export function createSavedFilter(name: string, existing: SavedFilter[], spec?: SavedFilterSpec): SavedFilter {
  const ids = new Set(existing.map((item) => item.id));
  const slugs = new Set(existing.map((item) => item.slug));
  const slug = uniqueSlug(name, slugs, "filter");
  let id = slug;
  if (ids.has(id)) id = newId();
  return {
    id,
    name: name.trim(),
    slug,
    spec: spec ? cloneFilterSpec(spec) : emptyFilterSpec(),
  };
}

export function cycleSpecTag(spec: SavedFilterSpec, tagId: string): SavedFilterSpec {
  const tags = { ...spec.tags };
  const mode = tags[tagId];
  if (mode === "include") tags[tagId] = "exclude";
  else if (mode === "exclude") delete tags[tagId];
  else tags[tagId] = "include";
  return { ...spec, tags };
}

export function cycleSpecUntagged(spec: SavedFilterSpec): SavedFilterSpec {
  if (spec.untagged === "include") return { ...spec, untagged: "exclude" };
  if (spec.untagged === "exclude") return { ...spec, untagged: null };
  return { ...spec, untagged: "include" };
}

export function toggleSpecRating(spec: SavedFilterSpec, rating: number): SavedFilterSpec {
  const value = Math.min(5, Math.max(0, Math.round(rating)));
  const ratings = spec.ratings.includes(value)
    ? spec.ratings.filter((item) => item !== value)
    : [...spec.ratings, value].sort((a, b) => a - b);
  return { ...spec, ratings };
}

export function stripTagFromSpec(spec: SavedFilterSpec, tagId: string): SavedFilterSpec {
  if (!(tagId in spec.tags)) return spec;
  const tags = { ...spec.tags };
  delete tags[tagId];
  return { ...spec, tags };
}
